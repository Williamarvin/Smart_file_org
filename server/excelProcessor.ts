import * as XLSX from 'xlsx';
import { nanoid } from 'nanoid';
import { db } from './db';
import { files, folders, fileMetadata } from '@shared/schema';
import { eq } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';

interface ProcessedRow {
  folderName: string;
  files: Array<{
    filename: string;
    content?: string;
    url?: string;
    type?: string;
  }>;
  metadata: Record<string, any>;
}

export class ExcelProcessor {
  private userId: string;

  constructor(userId: string = 'demo-user') {
    this.userId = userId;
  }

  /**
   * Process an Excel file and create folder/file structure
   */
  async processExcelFile(filePath: string): Promise<{
    folders: any[];
    files: any[];
    summary: string;
  }> {
    console.log('Processing Excel file:', filePath);
    
    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });
    
    if (!data || data.length === 0) {
      throw new Error('Excel file is empty or could not be parsed');
    }

    // Analyze columns to detect patterns
    const columns = Object.keys(data[0] as any);
    const analysis = this.analyzeColumns(columns, data);
    
    console.log('Column analysis:', analysis);
    
    // Process each row
    const processedData = await this.processRows(data, analysis);
    
    // Create folder structure
    const createdFolders = await this.createFolders(processedData);
    
    // Create files
    const createdFiles = await this.createFiles(processedData, createdFolders);
    
    const summary = `Processed ${data.length} rows, created ${createdFolders.length} folders and ${createdFiles.length} files`;
    
    return {
      folders: createdFolders,
      files: createdFiles,
      summary
    };
  }

  /**
   * Analyze columns to detect folder columns, file columns, etc.
   */
  private analyzeColumns(columns: string[], data: any[]): {
    folderColumn: string | null;
    fileColumns: string[];
    metadataColumns: string[];
    titleColumn: string | null;
    contentColumns: string[];
  } {
    const analysis = {
      folderColumn: null as string | null,
      fileColumns: [] as string[],
      metadataColumns: [] as string[],
      titleColumn: null as string | null,
      contentColumns: [] as string[]
    };

    // Common patterns for folder columns
    const folderPatterns = [
      /subject/i, /category/i, /folder/i, /topic/i, /module/i, 
      /unit/i, /chapter/i, /section/i, /course/i, /department/i,
      /area/i, /domain/i, /group/i, /type/i
    ];

    // Common patterns for file/document columns
    const filePatterns = [
      /file/i, /document/i, /attachment/i, /resource/i, /material/i,
      /pdf/i, /link/i, /url/i, /video/i, /presentation/i, /slide/i,
      /worksheet/i, /assignment/i, /assessment/i, /reading/i
    ];

    // Common patterns for title columns
    const titlePatterns = [
      /title/i, /name/i, /heading/i, /label/i, /description/i
    ];

    // Common patterns for content columns
    const contentPatterns = [
      /content/i, /text/i, /description/i, /notes/i, /details/i,
      /summary/i, /overview/i, /instructions/i, /objectives/i
    ];

    for (const column of columns) {
      // Check for folder column
      if (!analysis.folderColumn && folderPatterns.some(p => p.test(column))) {
        analysis.folderColumn = column;
      }
      
      // Check for file columns
      if (filePatterns.some(p => p.test(column))) {
        analysis.fileColumns.push(column);
      }
      
      // Check for title column
      if (!analysis.titleColumn && titlePatterns.some(p => p.test(column))) {
        analysis.titleColumn = column;
      }
      
      // Check for content columns
      if (contentPatterns.some(p => p.test(column))) {
        analysis.contentColumns.push(column);
      }
      
      // Everything else is metadata
      if (!analysis.folderColumn || column !== analysis.folderColumn) {
        if (!analysis.fileColumns.includes(column) && !analysis.contentColumns.includes(column)) {
          analysis.metadataColumns.push(column);
        }
      }
    }

    // If no folder column found, try to use the first suitable column
    if (!analysis.folderColumn && columns.length > 0) {
      // Look for a column with relatively few unique values (likely categories)
      const uniqueCounts = columns.map(col => ({
        column: col,
        uniqueCount: new Set(data.map((row: any) => row[col])).size
      }));
      
      // Sort by unique count and pick one with reasonable number of categories
      uniqueCounts.sort((a, b) => a.uniqueCount - b.uniqueCount);
      
      for (const { column, uniqueCount } of uniqueCounts) {
        if (uniqueCount > 1 && uniqueCount < data.length / 2) {
          analysis.folderColumn = column;
          break;
        }
      }
    }

    // If still no folder column, use a default
    if (!analysis.folderColumn) {
      analysis.folderColumn = 'General';
    }

    return analysis;
  }

  /**
   * Process rows and organize data
   */
  private async processRows(data: any[], analysis: any): Promise<ProcessedRow[]> {
    const processedRows: ProcessedRow[] = [];
    
    for (const row of data) {
      // Determine folder name
      let folderName = 'General';
      if (analysis.folderColumn && analysis.folderColumn !== 'General') {
        folderName = String(row[analysis.folderColumn] || 'General').trim();
        
        // Clean folder name
        folderName = folderName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
        if (!folderName) folderName = 'General';
      }

      // Extract files from file columns
      const extractedFiles: any[] = [];
      
      // Check file columns
      for (const fileCol of analysis.fileColumns) {
        const value = row[fileCol];
        if (value && typeof value === 'string' && value.trim()) {
          // Check if it's a URL
          if (value.match(/^https?:\/\//i)) {
            extractedFiles.push({
              filename: this.extractFilenameFromUrl(value),
              url: value,
              type: 'link'
            });
          } else {
            // Treat as filename or content
            extractedFiles.push({
              filename: this.sanitizeFilename(value),
              content: value,
              type: 'text'
            });
          }
        }
      }

      // If no files found in file columns, create a file from content columns
      if (extractedFiles.length === 0 && (analysis.contentColumns.length > 0 || analysis.titleColumn)) {
        let filename = 'document';
        let content = '';
        
        // Use title column for filename if available
        if (analysis.titleColumn && row[analysis.titleColumn]) {
          filename = this.sanitizeFilename(String(row[analysis.titleColumn]));
        }
        
        // Combine content columns
        for (const contentCol of analysis.contentColumns) {
          if (row[contentCol]) {
            content += `${contentCol}:\n${row[contentCol]}\n\n`;
          }
        }
        
        // Include all row data as content if no specific content found
        if (!content) {
          content = Object.entries(row)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        }
        
        if (content.trim()) {
          extractedFiles.push({
            filename: `${filename}.txt`,
            content: content,
            type: 'document'
          });
        }
      }

      // Collect metadata
      const metadata: Record<string, any> = {};
      for (const metaCol of analysis.metadataColumns) {
        if (row[metaCol]) {
          metadata[metaCol] = row[metaCol];
        }
      }

      processedRows.push({
        folderName,
        files: extractedFiles,
        metadata
      });
    }

    return processedRows;
  }

  /**
   * Create folders in the database
   */
  private async createFolders(processedData: ProcessedRow[]): Promise<any[]> {
    const folderNames = Array.from(new Set(processedData.map(row => row.folderName)));
    const createdFolders: any[] = [];
    
    for (const folderName of folderNames) {
      // Check if folder already exists
      const existingFolder = await db
        .select()
        .from(folders)
        .where(eq(folders.name, folderName))
        .limit(1);
      
      if (existingFolder.length > 0) {
        createdFolders.push(existingFolder[0]);
      } else {
        // Create new folder
        const newFolder = await db
          .insert(folders)
          .values({
            name: folderName,
            path: `/${folderName}`,
            parentId: null,
            userId: this.userId
          })
          .returning();
        
        createdFolders.push(newFolder[0]);
      }
    }
    
    return createdFolders;
  }

  /**
   * Create files in the database
   */
  private async createFiles(processedData: ProcessedRow[], createdFolders: any[]): Promise<any[]> {
    const createdFiles: any[] = [];
    
    // Create a map of folder names to IDs
    const folderMap = new Map(createdFolders.map(f => [f.name, f.id]));
    
    for (const row of processedData) {
      const folderId = folderMap.get(row.folderName);
      
      for (const file of row.files) {
        // Generate unique filename
        const fileId = nanoid();
        const extension = path.extname(file.filename) || '.txt';
        const storedFilename = `excel-import-${fileId}${extension}`;
        const objectPath = `/objects/excel-imports/${storedFilename}`;
        
        // Create file record
        const newFile = await db
          .insert(files)
          .values({
            filename: storedFilename,
            originalName: file.filename,
            mimeType: this.getMimeType(extension),
            size: file.content ? Buffer.from(file.content).length : 0,
            objectPath: objectPath,
            fileContent: file.content ? Buffer.from(file.content) : null,
            folderId: folderId || null,
            userId: this.userId,
            processingStatus: 'pending',
            storageType: 'hybrid'
          })
          .returning();
        
        // If it has content, save it to a temporary file for processing
        if (file.content) {
          const tempPath = path.join('/tmp', storedFilename);
          fs.writeFileSync(tempPath, file.content);
        }
        
        // Create metadata record if we have additional metadata
        if (Object.keys(row.metadata).length > 0 || file.url) {
          await db
            .insert(fileMetadata)
            .values({
              fileId: newFile[0].id,
              summary: `Imported from Excel: ${row.folderName}`,
              keywords: Object.keys(row.metadata),
              topics: [row.folderName],
              categories: ['excel-import'],
              extractedText: JSON.stringify({
                source: 'excel-import',
                ...row.metadata,
                url: file.url || null
              })
            });
        }
        
        createdFiles.push(newFile[0]);
      }
    }
    
    return createdFiles;
  }

  /**
   * Extract filename from URL
   */
  private extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = path.basename(pathname) || 'link';
      return filename;
    } catch {
      return 'link';
    }
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100) || 'document';
  }

  /**
   * Get MIME type from extension
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}