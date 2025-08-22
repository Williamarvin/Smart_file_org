import XLSX from 'xlsx';
import { nanoid } from 'nanoid';
import { db } from './db';
import { files, folders, fileMetadata } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
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
    foldersCreated: number;
    filesCreated: number;
  }> {
    console.log('Processing Excel file:', filePath);
    
    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    let allFolders: any[] = [];
    let allFiles: any[] = [];
    let totalRows = 0;
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      // Skip certain sheets
      if (sheetName.includes('Data') || sheetName.includes('temp') || 
          sheetName.includes('Estimation') || sheetName.includes('Schedule')) {
        console.log(`Skipping sheet: ${sheetName}`);
        continue;
      }
      
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });
      
      if (!data || data.length === 0) {
        console.log(`Skipping empty sheet: ${sheetName}`);
        continue;
      }

      totalRows += data.length;

      // Determine parent folder based on sheet name
      let parentFolderName = sheetName;
      
      // Special handling for Video Production sheets
      if (sheetName.includes('LV') || sheetName.includes('Public Speaking')) {
        parentFolderName = 'Video Production';
      }
      
      // Analyze columns to detect patterns
      const columns = Object.keys(data[0] as any);
      const analysis = this.analyzeColumns(columns, data);
      
      console.log(`Processing sheet: ${sheetName}, Parent folder: ${parentFolderName}`);
      console.log('Column analysis:', analysis);
      
      // Process each row with hierarchical structure support
      const processedData = await this.processRowsWithHierarchy(data, analysis, parentFolderName, sheetName);
      console.log(`Processed ${processedData.length} rows with folders:`, processedData.map(r => r.folderName));
      
      // Create folder structure
      const createdFolders = await this.createHierarchicalFolders(processedData, parentFolderName);
      console.log(`Created ${createdFolders.length} folders`);
      
      // Create files
      const createdFiles = await this.createFiles(processedData, createdFolders);
      console.log(`Created ${createdFiles.length} files`);
      
      allFolders.push(...createdFolders);
      allFiles.push(...createdFiles);
    }
    
    const summary = `Processed ${workbook.SheetNames.length} sheets with ${totalRows} total rows, created ${allFolders.length} folders and ${allFiles.length} files`;
    
    return {
      folders: allFolders,
      files: allFiles,
      summary,
      foldersCreated: allFolders.length,
      filesCreated: allFiles.length
    };
  }

  /**
   * Process rows with hierarchical folder support
   */
  private async processRowsWithHierarchy(
    data: any[], 
    analysis: any, 
    parentFolderName: string, 
    sheetName: string
  ): Promise<ProcessedRow[]> {
    const processedRows: ProcessedRow[] = [];
    
    for (const row of data) {
      // Get the lesson/folder name from the first column or use fallback
      let folderName = '';
      
      // Check for first column with lesson names (like "__EMPTY" or "Unnamed: 0" column)
      const columns = Object.keys(row);
      const firstCol = columns[0] || '__EMPTY';
      
      // Special handling for __EMPTY or Unnamed: 0 column (first unnamed column in Excel)
      const lessonCol = row['__EMPTY'] || row['Unnamed: 0'] || row[firstCol];
      if (lessonCol && typeof lessonCol === 'string') {
        // This is likely a lesson name like "LV1-Lesson1"
        const lessonName = lessonCol.trim();
        // Only use if it looks like a lesson name (contains LV, Lesson, Roadmap, etc)
        if (lessonName && (lessonName.includes('LV') || lessonName.includes('Lesson') || 
            lessonName.includes('lesson') || lessonName.includes('Level') ||
            lessonName.includes('Roadmap'))) {
          folderName = lessonName;
        }
      } 
      
      // If no folder name yet, try other approaches
      if (!folderName) {
        if (row[firstCol] && typeof row[firstCol] === 'string' && 
            firstCol !== 'Program' && firstCol !== 'Level' && 
            firstCol !== 'Lesson Number' && firstCol !== 'Think and Speak (Debate level 2)') {
          // Use first column if it's not a header-like column
          const val = row[firstCol].trim();
          if (val && val.length < 50) { // Avoid using long text as folder names
            folderName = val;
          }
        } else if (analysis.folderColumn && row[analysis.folderColumn]) {
          folderName = row[analysis.folderColumn];
        }
      }
      
      // Skip empty folder names or use parent folder
      if (!folderName || folderName === '') {
        // Don't create a folder, just add files to parent
        folderName = parentFolderName;
      }
      
      // Create hierarchical folder path only if not the same as parent
      if (folderName !== parentFolderName) {
        // Create child folder under parent
        folderName = `${parentFolderName}/${folderName}`;
      }
      
      const fileList: any[] = [];
      
      // Extract files from Video Link column
      if (row['Video Link']) {
        const videoLink = row['Video Link'].toString().trim();
        if (videoLink && videoLink !== '') {
          fileList.push({
            filename: videoLink,
            content: `Video file: ${videoLink}`,
            type: 'video'
          });
        }
      }
      
      // Extract files from Harry Trimmed column
      if (row['Harry Trimmed']) {
        const harryFile = row['Harry Trimmed'].toString().trim();
        if (harryFile && harryFile !== '') {
          fileList.push({
            filename: harryFile,
            content: `Trimmed video: ${harryFile}`,
            type: 'video'
          });
        }
      }
      
      // Extract files from other file columns
      for (const fileCol of analysis.fileColumns) {
        if (row[fileCol]) {
          const fileValue = row[fileCol].toString().trim();
          if (fileValue && fileValue !== '') {
            // Check if it's a URL
            if (fileValue.startsWith('http://') || fileValue.startsWith('https://')) {
              fileList.push({
                filename: path.basename(fileValue) || 'linked-file.txt',
                url: fileValue,
                type: 'link'
              });
            } else {
              // It's a file name or content
              fileList.push({
                filename: fileValue,
                content: `File: ${fileValue}`,
                type: this.getFileType(fileValue)
              });
            }
          }
        }
      }
      
      // Extract content from content columns
      for (const contentCol of analysis.contentColumns) {
        if (row[contentCol]) {
          const content = row[contentCol].toString().trim();
          if (content && content !== '') {
            fileList.push({
              filename: `${contentCol.replace(/\s+/g, '-').toLowerCase()}-content.txt`,
              content: content,
              type: 'text'
            });
          }
        }
      }
      
      // If we have files or need to create the folder
      if (fileList.length > 0 || folderName !== parentFolderName) {
        // Collect metadata
        const metadata: Record<string, any> = {};
        for (const metaCol of analysis.metadataColumns) {
          if (row[metaCol]) {
            metadata[metaCol] = row[metaCol];
          }
        }
        
        processedRows.push({
          folderName,
          files: fileList,
          metadata
        });
      }
    }
    
    return processedRows;
  }
  
  /**
   * Create hierarchical folders
   */
  private async createHierarchicalFolders(processedData: ProcessedRow[], parentFolderName: string): Promise<any[]> {
    const createdFolders: any[] = [];
    const folderMap = new Map<string, any>();
    
    console.log(`Creating folders for ${processedData.length} rows...`);
    
    // First, create parent folder if needed
    if (parentFolderName && parentFolderName !== '') {
      const existingParent = await db
        .select()
        .from(folders)
        .where(and(eq(folders.name, parentFolderName), isNull(folders.parentId)))
        .limit(1);
      
      let parentFolder;
      if (existingParent.length === 0) {
        console.log(`Creating parent folder: ${parentFolderName}`);
        const newParent = await db
          .insert(folders)
          .values({
            name: parentFolderName,
            path: `/${parentFolderName}`,
            parentId: null,
            userId: this.userId
          })
          .returning();
        parentFolder = newParent[0];
        createdFolders.push(parentFolder);
      } else {
        console.log(`Parent folder already exists: ${parentFolderName}`);
        parentFolder = existingParent[0];
      }
      
      folderMap.set(parentFolderName, parentFolder);
    }
    
    // Create child folders
    const uniqueFolders = Array.from(new Set(processedData.map(row => row.folderName)));
    console.log(`Unique folders to create: ${uniqueFolders.length}`, uniqueFolders.slice(0, 5));
    
    for (const folderPath of uniqueFolders) {
      if (folderMap.has(folderPath)) {
        console.log(`Folder already in map, skipping: ${folderPath}`);
        continue; // Already created
      }
      
      const parts = folderPath.split('/');
      let currentPath = '';
      let parentId = null;
      
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        if (folderMap.has(currentPath)) {
          parentId = folderMap.get(currentPath).id;
          continue;
        }
        
        // Check if folder exists with this name and parent
        const existing = await db
          .select()
          .from(folders)
          .where(
            parentId 
              ? and(eq(folders.name, part), eq(folders.parentId, parentId))
              : and(eq(folders.name, part), isNull(folders.parentId))
          )
          .limit(1);
        
        if (existing.length > 0) {
          console.log(`Folder exists in DB: ${currentPath}`);
          folderMap.set(currentPath, existing[0]);
          parentId = existing[0].id;
        } else {
          console.log(`Creating new folder: ${currentPath} with parent ${parentId}`);
          // Create new folder
          const [newFolder] = await db
            .insert(folders)
            .values({
              name: part,
              path: `/${currentPath}`,
              parentId: parentId,
              userId: this.userId
            })
            .returning();
          folderMap.set(currentPath, newFolder);
          createdFolders.push(newFolder);
          parentId = newFolder.id;
        }
      }
    }
    
    return createdFolders;
  }
  
  /**
   * Get file type based on extension
   */
  private getFileType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'].includes(ext)) {
      return 'video';
    } else if (['.pdf'].includes(ext)) {
      return 'pdf';
    } else if (['.doc', '.docx'].includes(ext)) {
      return 'document';
    } else if (['.ppt', '.pptx'].includes(ext)) {
      return 'presentation';
    } else if (['.xls', '.xlsx'].includes(ext)) {
      return 'spreadsheet';
    } else {
      return 'text';
    }
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

    // Common patterns for folder columns - define outside if block
    const folderPatterns = [
      /subject/i, /category/i, /folder/i, /topic/i, /module/i, 
      /unit/i, /chapter/i, /section/i, /course/i, /department/i,
      /area/i, /domain/i, /group/i, /type/i, /theme/i, /program/i
    ];

    // Special handling for Video Production files - use first column for lesson names
    // Don't use "Production Status" as folder column, skip it
    if (columns.includes('__EMPTY') || columns[0] === '__EMPTY' || columns[0] === 'Unnamed: 0') {
      // Don't set folderColumn for Video Production files, we'll use __EMPTY column directly
      analysis.folderColumn = null;
    } else {
      // Check for folder column, but exclude "Production Status" and "Produciton Status" (typo)
      for (const column of columns) {
        // Skip "Production Status" column and its typo variant - it's not a folder column
        if (column.toLowerCase().includes('produc') || column.toLowerCase().includes('status')) {
          continue;
        }
        if (!analysis.folderColumn && folderPatterns.some(p => p.test(column))) {
          analysis.folderColumn = column;
          break;
        }
      }
    }

    // Common patterns for file/document columns
    const filePatterns = [
      /file/i, /document/i, /attachment/i, /resource/i, /material/i,
      /pdf/i, /link/i, /url/i, /video/i, /presentation/i, /slide/i,
      /worksheet/i, /assignment/i, /assessment/i, /reading/i, /ppt/i,
      /lesson\s*plan/i, /harry/i  // Added Harry for "Harry Trimmed" column
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
      // Check for folder column, but skip "Production Status" and its typo variant
      if (!analysis.folderColumn && 
          !column.toLowerCase().includes('produc') && 
          !column.toLowerCase().includes('status') &&
          folderPatterns.some(p => p.test(column))) {
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
   * Only creates reference records for tracking, not actual file entries that need processing
   */
  private async createFiles(processedData: ProcessedRow[], createdFolders: any[]): Promise<any[]> {
    const createdFiles: any[] = [];
    
    // Create a map of folder paths to IDs
    const folderMap = new Map<string, string>();
    
    // Map all folders by their full path
    for (const folder of createdFolders) {
      // Map by name and by path
      folderMap.set(folder.name, folder.id);
      folderMap.set(folder.path.replace(/^\//, ''), folder.id);
    }
    
    // Also get existing folders from DB to map them
    const allFolders = await db.select().from(folders).where(eq(folders.userId, this.userId));
    for (const folder of allFolders) {
      folderMap.set(folder.name, folder.id);
      folderMap.set(folder.path.replace(/^\//, ''), folder.id);
    }
    
    // NOTE: We're not creating file entries anymore for Excel imports
    // Excel imports only create folder structures and metadata references
    // Actual video/document files should be uploaded separately through the normal upload flow
    
    console.log(`Skipped creating ${processedData.reduce((sum, row) => sum + row.files.length, 0)} file references from Excel import`);
    console.log('Excel import now only creates folder structures. Upload actual files through the upload interface.');
    
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