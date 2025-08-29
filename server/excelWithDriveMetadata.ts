import { db } from './db';
import { files, folders, fileMetadata } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { googleDriveService, type GoogleDriveMetadata } from './googleDriveService';
import { nanoid } from 'nanoid';
import { storage } from './storage';

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
      // Try multiple strategies to find the correct folder
      let folderId = folderMap.get(row.folderName)?.id;
      
      // If not found, try alternative lookup strategies
      if (!folderId) {
        // Try without leading/trailing slashes
        const cleanFolderName = row.folderName.replace(/^\/+|\/+$/g, '');
        folderId = folderMap.get(cleanFolderName)?.id;
        
        // If still not found, try just the leaf folder name
        if (!folderId) {
          const leafFolderName = cleanFolderName.split('/').pop();
          if (leafFolderName) {
            folderId = folderMap.get(leafFolderName)?.id;
          }
        }
        
        // If still not found, log debug info
        if (!folderId) {
          console.warn(`🔍 Folder lookup failed for "${row.folderName}". Available keys:`, Array.from(folderMap.keys()).slice(0, 10));
        } else {
          console.log(`✓ Found folder via alternative lookup: "${row.folderName}" -> ${folderId}`);
        }
      } else {
        console.log(`✓ Found folder via direct lookup: "${row.folderName}" -> ${folderId}`);
      }
      
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
        
        // Create file entry with Google Drive metadata and immediately download if it's a Google Drive file
        let actualFileContent = fileData.content || '';
        let actualSize = size;
        let actualProcessingStatus: 'pending' | 'completed' | 'error' = 'pending'; // Always set to pending so files get processed
        let actualObjectPath = `/excel-import/${row.folderName}/${filename}`;
        let actualStorageType: 'hybrid' | 'bytea' = 'hybrid';
        let downloadedFileBuffer: Buffer | null = null;
        
        // If it's a Google Drive file, try to download it immediately
        if (googleDriveUrl && googleDriveService.isInitialized()) {
          console.log(`⬇️ Downloading Google Drive file immediately: ${filename}`);
          try {
            const fileBuffer = await googleDriveService.downloadFile(googleDriveUrl);
            if (fileBuffer && fileBuffer.length > 0) {
              // Store the downloaded buffer for BYTEA storage
              downloadedFileBuffer = fileBuffer;
              
              // Extract content based on file type
              let extractedContent = '';
              const fileExt = filename.toLowerCase().substring(filename.lastIndexOf('.'));
              
              if (fileExt === '.pdf') {
                // For PDF, store basic info (full processing will happen later)
                extractedContent = `PDF Document: ${filename}\nSize: ${fileBuffer.length} bytes\nDownloaded from Google Drive`;
              } else if (fileExt === '.docx') {
                // For DOCX, store basic info (full processing will happen later)
                extractedContent = `Word Document: ${filename}\nSize: ${fileBuffer.length} bytes\nDownloaded from Google Drive`;
              } else if (['.mp4', '.avi', '.mov', '.mkv'].includes(fileExt)) {
                // For videos, store basic info (transcription will happen later)
                extractedContent = `Video File: ${filename}\nSize: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB\nDownloaded from Google Drive`;
              } else if (['.pptx', '.ppt'].includes(fileExt)) {
                extractedContent = `PowerPoint Presentation: ${filename}\nSize: ${fileBuffer.length} bytes\nDownloaded from Google Drive`;
              } else {
                extractedContent = `File: ${filename}\nSize: ${fileBuffer.length} bytes\nDownloaded from Google Drive`;
              }
              
              // Don't set extracted content here - let the file processor handle it
              actualFileContent = ''; // Empty content so processor will extract it
              actualSize = fileBuffer.length;
              actualProcessingStatus = 'pending'; // Needs full processing
              // Use BYTEA storage for small files, hybrid for large files
              if (fileBuffer.length <= 10 * 1024 * 1024) {
                actualStorageType = 'bytea';
                actualObjectPath = `/bytea/${filename}`; // Special path indicating BYTEA storage
                console.log(`✅ Downloaded ${filename}: ${fileBuffer.length} bytes - will use BYTEA storage`);
              } else {
                actualStorageType = 'hybrid';  
                actualObjectPath = `/excel-import/${row.folderName}/${filename}`; // Use regular path for large files
                console.log(`✅ Downloaded ${filename}: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB - will use hybrid storage`);
              }
            } else {
              console.warn(`❌ Failed to download ${filename} from Google Drive - empty or no data received`);
              actualProcessingStatus = 'error';
              actualFileContent = `Error: Could not download ${filename} from Google Drive - no data received`;
            }
          } catch (error) {
            console.error(`❌ Error downloading ${filename}:`, error);
            actualProcessingStatus = 'error';
            actualFileContent = `Error: Failed to download ${filename} from Google Drive - ${error}`;
            // Don't set /bytea/ path for failed downloads
            actualObjectPath = `/excel-import/${row.folderName}/${filename}`;
          }
        }

        // Create file using storage.createFile to handle BYTEA storage properly
        const newFile = await storage.createFile({
          filename: filename,
          originalName: fileData.filename, // Keep original display name
          folderId: folderId || null,
          size: actualSize,
          mimeType: mimeType,
          objectPath: actualObjectPath,
          processingStatus: actualProcessingStatus,
          userId: userId,
          
          // Google Drive specific fields
          googleDriveId: googleDriveId,
          googleDriveUrl: googleDriveUrl,
          googleDriveMetadata: googleDriveMetadataJson,
          lastMetadataSync: googleDriveMetadataJson ? new Date() : null
        }, userId, downloadedFileBuffer); // Pass the downloaded buffer for BYTEA storage

        if (downloadedFileBuffer) {
          console.log(`💾 Stored file data for ${filename} in BYTEA storage (${downloadedFileBuffer.length} bytes)`);
        }
        
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
    // Create comprehensive folder map with all possible lookups
    const folderMap = new Map<string, any>();
    
    // First, get ALL folders for this user to build a complete map
    const { storage } = await import('./storage');
    const allUserFolders = await storage.getFolders(userId);
    
    console.log(`Building folder map from ${allUserFolders.length} total folders and ${createdFolders.length} newly created folders`);
    
    // Add all existing folders to the map
    for (const folder of allUserFolders) {
      folderMap.set(folder.name, folder);
      folderMap.set(folder.path.replace(/^\//, ''), folder);
      
      // Also add path segments for hierarchical matching
      const pathParts = folder.path.replace(/^\//, '').split('/');
      if (pathParts.length > 1) {
        // For paths like "test_fixed_excel/LV1(UP)/Released", also map "LV1(UP)/Released" 
        for (let i = 1; i < pathParts.length; i++) {
          const subPath = pathParts.slice(i).join('/');
          folderMap.set(subPath, folder);
        }
        
        // Also map the full path without the root
        const pathWithoutRoot = pathParts.slice(1).join('/');
        if (pathWithoutRoot) {
          folderMap.set(pathWithoutRoot, folder);
        }
      }
    }
    
    // Add newly created folders to the map (in case they're not in allUserFolders yet)
    for (const folder of createdFolders) {
      folderMap.set(folder.name, folder);
      folderMap.set(folder.path.replace(/^\//, ''), folder);
      
      // Also add path segments for hierarchical matching
      const pathParts = folder.path.replace(/^\//, '').split('/');
      if (pathParts.length > 1) {
        for (let i = 1; i < pathParts.length; i++) {
          const subPath = pathParts.slice(i).join('/');
          folderMap.set(subPath, folder);
        }
        
        const pathWithoutRoot = pathParts.slice(1).join('/');
        if (pathWithoutRoot) {
          folderMap.set(pathWithoutRoot, folder);
        }
      }
    }
    
    console.log(`Folder map contains ${folderMap.size} entries for folder lookup`);
    
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