import { db } from './db';
import { files, folders, fileMetadata } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { googleDriveService, type GoogleDriveMetadata } from './googleDriveService';
import { nanoid } from 'nanoid';

/**
 * Enhanced Excel import service that fetches Google Drive metadata
 */
export class ExcelWithDriveMetadataService {
  /**
   * Create files from Excel data with Google Drive metadata extraction
   */
  static async createFilesWithDriveMetadata(
    processedRows: any[],
    folderMap: Map<string, any>,
    userId: string
  ): Promise<any[]> {
    const createdFiles: any[] = [];
    
    // Collect all Google Drive URLs for batch processing
    const driveUrls: string[] = [];
    const fileDataMap = new Map<string, any>();
    
    // First pass: collect all Google Drive URLs
    for (const row of processedRows) {
      const folderId = folderMap.get(row.folderName)?.id;
      
      for (const fileData of row.files) {
        if (fileData.url && fileData.url.includes('drive.google.com')) {
          driveUrls.push(fileData.url);
          fileDataMap.set(fileData.url, { ...fileData, folderId, row });
        }
      }
    }
    
    // Batch fetch Google Drive metadata
    let driveMetadataMap = new Map<string, GoogleDriveMetadata | null>();
    if (driveUrls.length > 0) {
      console.log(`Fetching Google Drive metadata for ${driveUrls.length} files...`);
      
      if (googleDriveService.isInitialized()) {
        try {
          driveMetadataMap = await googleDriveService.batchGetMetadata(driveUrls);
          console.log(`✓ Fetched metadata for ${driveMetadataMap.size} Google Drive files`);
        } catch (error) {
          console.error('Error fetching Google Drive metadata:', error);
          // Continue without metadata if fetch fails
        }
      } else {
        console.warn('Google Drive API not initialized. Using fallback metadata.');
        // Generate fallback metadata for all URLs
        for (const url of driveUrls) {
          driveMetadataMap.set(url, googleDriveService['getFallbackMetadata'](url));
        }
      }
    }
    
    // Second pass: create files with metadata
    for (const row of processedRows) {
      const folderId = folderMap.get(row.folderName)?.id;
      
      for (const fileData of row.files) {
        if (!fileData.filename || fileData.filename.trim() === '') {
          continue;
        }
        
        // Check if we have Google Drive metadata for this file
        const driveMetadata = fileData.url ? driveMetadataMap.get(fileData.url) : null;
        
        // Determine file properties
        let filename = fileData.filename;
        let mimeType = 'text/plain';
        let size = 100; // Default size
        let googleDriveId: string | null = null;
        let googleDriveUrl: string | null = null;
        let googleDriveMetadataJson: any = null;
        
        // If we have Google Drive metadata, use it
        if (driveMetadata) {
          // Use actual filename from Drive if available
          if (driveMetadata.actualName && driveMetadata.actualName !== 'Google Drive File') {
            filename = driveMetadata.actualName;
          }
          
          // Use actual MIME type
          if (driveMetadata.mimeType) {
            mimeType = driveMetadata.mimeType;
          }
          
          // Use actual size
          if (driveMetadata.size) {
            size = driveMetadata.size;
          }
          
          // Store Google Drive specific data
          googleDriveId = driveMetadata.fileId;
          googleDriveUrl = fileData.url;
          googleDriveMetadataJson = driveMetadata;
          
          console.log(`✓ Using Google Drive metadata for: ${filename} (${driveMetadata.fileId})`);
        } else {
          // Fallback: determine MIME type from filename
          if (fileData.type === 'video' || filename.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i)) {
            mimeType = 'video/mp4';
          } else if (filename.match(/\.pdf$/i)) {
            mimeType = 'application/pdf';
          } else if (filename.match(/\.(doc|docx)$/i)) {
            mimeType = 'application/msword';
          } else if (filename.match(/\.(ppt|pptx)$/i)) {
            mimeType = 'application/vnd.ms-powerpoint';
          }
        }
        
        // Create file entry with Google Drive metadata
        const [newFile] = await db
          .insert(files)
          .values({
            filename: filename,
            originalName: fileData.filename, // Keep original display name
            folderId: folderId || null,
            size: size,
            mimeType: mimeType,
            objectPath: googleDriveUrl || `/excel-import/${row.folderName}/${filename}`,
            uploadedAt: new Date(),
            userId: userId,
            processingStatus: 'completed',
            processingError: null,
            fileContent: null,
            storageType: googleDriveUrl ? 'google-drive' : 'excel-metadata',
            
            // Google Drive specific fields
            googleDriveId: googleDriveId,
            googleDriveUrl: googleDriveUrl,
            googleDriveMetadata: googleDriveMetadataJson,
            lastMetadataSync: googleDriveMetadataJson ? new Date() : null
          })
          .returning();
        
        // Create file metadata entry
        const metadataObj: Record<string, any> = {
          source: 'excel-import',
          importedAt: new Date().toISOString(),
          ...(row.metadata || {})
        };
        
        // Add Google Drive metadata to file metadata
        if (driveMetadata) {
          metadataObj.googleDrive = {
            fileId: driveMetadata.fileId,
            actualName: driveMetadata.actualName,
            mimeType: driveMetadata.mimeType,
            size: driveMetadata.size,
            owners: driveMetadata.owners,
            createdTime: driveMetadata.createdTime,
            modifiedTime: driveMetadata.modifiedTime,
            canDownload: driveMetadata.canDownload,
            thumbnailLink: driveMetadata.thumbnailLink,
            webViewLink: driveMetadata.webViewLink,
            webContentLink: driveMetadata.webContentLink
          };
          
          // If it's a video, add video metadata
          if (driveMetadata.videoMediaMetadata) {
            metadataObj.videoMetadata = driveMetadata.videoMediaMetadata;
          }
        }
        
        // Create enhanced summary
        let summary = `Imported from Excel: ${row.folderName}`;
        if (driveMetadata && driveMetadata.actualName !== 'Google Drive File') {
          summary = `Google Drive file: ${driveMetadata.actualName} (${row.folderName})`;
        }
        
        await db
          .insert(fileMetadata)
          .values({
            fileId: newFile.id,
            summary: summary,
            keywords: [
              'excel-import',
              row.folderName,
              ...(driveMetadata ? ['google-drive', `drive-${driveMetadata.fileId}`] : [])
            ],
            topics: [row.folderName],
            categories: ['Education'],
            extractedText: fileData.content || null,
            createdAt: new Date()
          });
        
        createdFiles.push(newFile);
        console.log(`Created file: ${filename} in folder ${row.folderName}`);
      }
    }
    
    console.log(`Created ${createdFiles.length} files with enhanced Google Drive metadata`);
    return createdFiles;
  }
  
  /**
   * Process Excel data and create files with Google Drive metadata
   */
  static async processExcelWithDriveMetadata(
    processedRows: any[],
    createdFolders: any[],
    userId: string
  ): Promise<{
    files: any[];
    filesWithDriveMetadata: number;
    filesWithoutDriveMetadata: number;
  }> {
    // Create folder map
    const folderMap = new Map<string, any>();
    for (const folder of createdFolders) {
      folderMap.set(folder.name, folder);
      folderMap.set(folder.path.replace(/^\//, ''), folder);
    }
    
    // Create files with Drive metadata
    const createdFiles = await this.createFilesWithDriveMetadata(
      processedRows,
      folderMap,
      userId
    );
    
    // Count files with and without Drive metadata
    const filesWithDriveMetadata = createdFiles.filter(f => f.googleDriveId).length;
    const filesWithoutDriveMetadata = createdFiles.length - filesWithDriveMetadata;
    
    return {
      files: createdFiles,
      filesWithDriveMetadata,
      filesWithoutDriveMetadata
    };
  }
}