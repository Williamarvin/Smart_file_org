import * as XLSX from 'xlsx';
import * as path from 'path';
import { db } from './db';
import { files, folders, fileMetadata } from '@shared/schema';
import { storage } from './storage';
import { eq, and } from 'drizzle-orm';
import { googleDriveService } from './googleDriveService';

interface ProcessedRow {
  folderName: string;
  files: Array<{
    filename: string;
    content?: string;
    url?: string;
    type?: string;
    metadata?: any;
  }>;
  metadata?: Record<string, any>;
}

interface FolderHierarchy {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  children?: FolderHierarchy[];
}

/**
 * Fixed Excel processor with proper folder hierarchy and Google Drive download
 */
export class ExcelProcessorFixed {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async processExcelFile(filePath: string, originalFilename?: string): Promise<any> {
    console.log(`📊 Processing Excel file: ${originalFilename || filePath}`);
    
    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    
    // Get the parent folder name from Excel filename
    const excelFileName = originalFilename 
      ? path.basename(originalFilename, path.extname(originalFilename))
      : path.basename(filePath, path.extname(filePath));
    
    // Check if parent folder already exists
    const existingParentFolder = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.name, excelFileName),
          eq(folders.userId, this.userId),
          eq(folders.parentId, null)
        )
      )
      .limit(1);
    
    let parentFolderId: string;
    let parentFolderName = excelFileName;
    
    if (existingParentFolder.length > 0) {
      // Use existing parent folder
      parentFolderId = existingParentFolder[0].id;
      console.log(`✓ Using existing parent folder: ${parentFolderName} (${parentFolderId})`);
    } else {
      // Create new parent folder
      const [newParentFolder] = await db
        .insert(folders)
        .values({
          name: parentFolderName,
          path: `/${parentFolderName}`,
          parentId: null,
          userId: this.userId
        })
        .returning();
      
      parentFolderId = newParentFolder.id;
      console.log(`✓ Created new parent folder: ${parentFolderName} (${parentFolderId})`);
    }
    
    const processedRows: ProcessedRow[] = [];
    const allFilesData: any[] = [];
    let totalRows = 0;
    let totalFiles = 0;
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      // Skip certain sheets
      if (sheetName.includes('Data') || sheetName.includes('temp') || 
          sheetName.includes('Estimation') || sheetName.includes('Schedule')) {
        console.log(`Skipping sheet: ${sheetName}`);
        continue;
      }
      
      const worksheet = workbook.Sheets[sheetName];
      
      // Extract hyperlinks
      const hyperlinksByText: Map<string, string> = new Map();
      Object.keys(worksheet).forEach((cell: string) => {
        if (cell[0] !== '!') {
          const cellObj = worksheet[cell];
          if (cellObj && cellObj.l) {
            const url = cellObj.l.Target || cellObj.l.href || cellObj.l.Rel;
            if (cellObj.v) {
              const cellText = String(cellObj.v).trim();
              hyperlinksByText.set(cellText, url);
              console.log(`Found hyperlink: "${cellText}" -> ${url.substring(0, 80)}...`);
            }
          }
        }
      });
      
      // Convert to JSON
      const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });
      
      if (!data || data.length === 0) {
        console.log(`Skipping empty sheet: ${sheetName}`);
        continue;
      }
      
      totalRows += data.length;
      
      // Process each row as a topic subfolder
      for (const [rowIndex, row] of data.entries()) {
        // Find topic name from the row
        const columns = Object.keys(row as any);
        let topicName = '';
        
        // Try to find topic name from first column or specific columns
        const firstCol = columns[0] || '__EMPTY';
        const lessonCol = (row as any)['__EMPTY'] || (row as any)['Unnamed: 0'] || (row as any)[firstCol];
        
        if (lessonCol && typeof lessonCol === 'string') {
          topicName = lessonCol.trim();
        }
        
        // Generate topic name if not found
        if (!topicName) {
          const lessonNumber = (row as any)['Lesson Number'] || (row as any)['Lesson'] || (row as any)['Level'];
          if (lessonNumber) {
            topicName = `Lesson-${lessonNumber}`;
          } else {
            topicName = `${sheetName}-Row${rowIndex + 1}`;
          }
        }
        
        // Process files from this row
        const rowFiles: any[] = [];
        
        Object.keys(row as any).forEach((colName) => {
          const cellValue = (row as any)[colName];
          
          if (cellValue && typeof cellValue === 'string') {
            // Check if it's a file or has a hyperlink
            const hasFileExtension = cellValue.includes('.mp4') || cellValue.includes('.pdf') || 
                                   cellValue.includes('.docx') || cellValue.includes('.pptx');
            const hasHyperlink = hyperlinksByText.has(cellValue.trim());
            
            if (hasFileExtension || hasHyperlink) {
              let filename = cellValue.trim();
              let url = hyperlinksByText.get(cellValue.trim()) || null;
              
              // Add extension if missing but has hyperlink
              if (hasHyperlink && !hasFileExtension) {
                if (colName.toLowerCase().includes('lesson plan')) {
                  filename += '.docx';
                } else if (colName.toLowerCase().includes('ppt')) {
                  filename += '.pptx';
                }
              }
              
              rowFiles.push({
                filename,
                url,
                topicName,
                type: filename.includes('.mp4') ? 'video' : 'document'
              });
              
              console.log(`Found file: ${filename} in topic: ${topicName} ${url ? '(with URL)' : ''}`);
            }
          }
        });
        
        if (rowFiles.length > 0) {
          processedRows.push({
            folderName: topicName,
            files: rowFiles,
            metadata: { sheet: sheetName, rowIndex }
          });
          allFilesData.push(...rowFiles);
          totalFiles += rowFiles.length;
        }
      }
    }
    
    console.log(`📊 Found ${totalFiles} files across ${processedRows.length} topics`);
    
    // Create topic subfolders under parent folder
    const folderMap = new Map<string, string>();
    folderMap.set(parentFolderName, parentFolderId);
    
    for (const row of processedRows) {
      const topicName = row.folderName;
      
      // Check if topic folder already exists under parent
      const existingTopicFolder = await db
        .select()
        .from(folders)
        .where(
          and(
            eq(folders.name, topicName),
            eq(folders.parentId, parentFolderId),
            eq(folders.userId, this.userId)
          )
        )
        .limit(1);
      
      let topicFolderId: string;
      
      if (existingTopicFolder.length > 0) {
        topicFolderId = existingTopicFolder[0].id;
        console.log(`  ✓ Using existing topic folder: ${topicName}`);
      } else {
        // Create topic subfolder
        const [newTopicFolder] = await db
          .insert(folders)
          .values({
            name: topicName,
            path: `/${parentFolderName}/${topicName}`,
            parentId: parentFolderId,
            userId: this.userId
          })
          .returning();
        
        topicFolderId = newTopicFolder.id;
        console.log(`  ✓ Created topic folder: ${topicName}`);
      }
      
      folderMap.set(topicName, topicFolderId);
    }
    
    // Create files with Google Drive metadata
    let filesCreated = 0;
    let filesWithUrls = 0;
    
    for (const row of processedRows) {
      const topicFolderId = folderMap.get(row.folderName);
      
      for (const fileData of row.files) {
        if (!fileData.filename || !topicFolderId) continue;
        
        // Prepare file data
        let googleDriveUrl = fileData.url || null;
        let googleDriveId = null;
        let actualSize = 100; // Default placeholder size
        let downloadedBuffer: Buffer | null = null;
        
        // Extract Google Drive ID if we have a URL
        if (googleDriveUrl && googleDriveUrl.includes('drive.google.com')) {
          const match = googleDriveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (match) {
            googleDriveId = match[1];
          }
          filesWithUrls++;
          
          // Try to download immediately if Google Drive is initialized
          if (googleDriveService.isInitialized()) {
            try {
              console.log(`  📥 Downloading: ${fileData.filename}`);
              const buffer = await googleDriveService.downloadFile(googleDriveUrl);
              if (buffer && buffer.length > 0) {
                downloadedBuffer = buffer;
                actualSize = buffer.length;
                console.log(`    ✓ Downloaded ${(actualSize / 1024 / 1024).toFixed(2)} MB`);
              }
            } catch (error) {
              console.error(`    ❌ Download failed: ${error}`);
            }
          }
        }
        
        // Determine MIME type
        let mimeType = 'text/plain';
        const ext = path.extname(fileData.filename).toLowerCase();
        if (['.mp4', '.avi', '.mov'].includes(ext)) {
          mimeType = 'video/mp4';
        } else if (ext === '.pdf') {
          mimeType = 'application/pdf';
        } else if (['.doc', '.docx'].includes(ext)) {
          mimeType = 'application/msword';
        } else if (['.ppt', '.pptx'].includes(ext)) {
          mimeType = 'application/vnd.ms-powerpoint';
        }
        
        // Create file using storage.createFile with BYTEA storage for downloaded content
        const newFile = await storage.createFile({
          filename: fileData.filename,
          originalName: fileData.filename,
          folderId: topicFolderId,
          size: actualSize,
          mimeType: mimeType,
          objectPath: `/excel-import/${row.folderName}/${fileData.filename}`,
          processingStatus: downloadedBuffer ? 'pending' : 'pending', // Always mark as pending for processing
          userId: this.userId,
          googleDriveId: googleDriveId,
          googleDriveUrl: googleDriveUrl,
          googleDriveMetadata: null,
          lastMetadataSync: googleDriveUrl ? new Date() : null
        }, this.userId, downloadedBuffer);
        
        // Create basic metadata
        await db
          .insert(fileMetadata)
          .values({
            fileId: newFile.id,
            summary: `Imported from Excel: ${row.folderName}`,
            keywords: ['excel-import', row.folderName, parentFolderName],
            topics: [row.folderName],
            categories: ['Education'],
            extractedText: downloadedBuffer ? `File downloaded: ${fileData.filename}` : `File reference: ${fileData.filename}`,
            createdAt: new Date()
          });
        
        filesCreated++;
        console.log(`  ✓ Created file: ${fileData.filename} in ${row.folderName}`);
      }
    }
    
    return {
      success: true,
      summary: `Imported ${filesCreated} files (${filesWithUrls} with URLs) into ${processedRows.length} topic folders under "${parentFolderName}"`,
      filesCreated,
      foldersCreated: processedRows.length,
      parentFolder: parentFolderName,
      filesWithUrls
    };
  }
}