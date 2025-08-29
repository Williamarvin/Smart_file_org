import XLSX from 'xlsx';
import { nanoid } from 'nanoid';
import { db } from './db';
import { files, folders, fileMetadata } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';
import { googleDriveService, type GoogleDriveMetadata } from './googleDriveService';
import { ExcelWithDriveMetadataService } from './excelWithDriveMetadata';

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
  async processExcelFile(filePath: string, originalFilename?: string): Promise<{
    folders: any[];
    files: any[];
    summary: string;
    foldersCreated: number;
    filesCreated: number;
  }> {
    console.log('Processing Excel file:', filePath, 'Original name:', originalFilename);
    
    // Validate file exists and is readable
    if (!fs.existsSync(filePath)) {
      throw new Error('Excel file not found');
    }

    // Check file size (prevent processing extremely large files)
    const stats = fs.statSync(filePath);
    if (stats.size > 50 * 1024 * 1024) { // 50MB limit
      throw new Error('Excel file is too large (maximum 50MB)');
    }

    let workbook: XLSX.WorkBook;
    try {
      // Read the Excel file with options to preserve hyperlinks
      workbook = XLSX.readFile(filePath, { 
        cellHTML: true,
        cellStyles: true,
        cellFormula: true,
        cellDates: true,
        WTF: true  // Preserve all features including hyperlinks
      });
    } catch (error) {
      console.error('Error reading Excel file:', error);
      throw new Error('Invalid Excel file format or corrupted file');
    }

    // Validate workbook has sheets
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel file contains no worksheets');
    }
    let allFolders: any[] = [];
    let allFiles: any[] = [];
    let totalRows = 0;
    
    // Create one main parent folder for the entire Excel file using original filename
    const excelFileName = originalFilename 
      ? path.basename(originalFilename, path.extname(originalFilename))
      : path.basename(filePath, path.extname(filePath));
    const mainParentFolder = excelFileName;
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      // Skip certain sheets
      if (sheetName.includes('Data') || sheetName.includes('temp') || 
          sheetName.includes('Estimation') || sheetName.includes('Schedule')) {
        console.log(`Skipping sheet: ${sheetName}`);
        continue;
      }
      
      const worksheet = workbook.Sheets[sheetName];
      
      // Extract hyperlinks from worksheet
      // Note: hyperlinks can be in .l property or in worksheet['!links']
      const hyperlinks: any = {};
      let hyperlinkCount = 0;
      
      // Method 1: Check .l property on cells
      Object.keys(worksheet).forEach((cell: string) => {
        if (cell[0] !== '!') { // Skip special properties
          const cellObj = worksheet[cell];
          if (cellObj && cellObj.l) { // .l property contains hyperlink info
            const coords = XLSX.utils.decode_cell(cell);
            if (!hyperlinks[coords.r]) hyperlinks[coords.r] = {};
            const url = cellObj.l.Target || cellObj.l.href || cellObj.l.Rel;
            hyperlinks[coords.r][coords.c] = url;
            hyperlinkCount++;
            console.log(`Found hyperlink in cell ${cell}: ${url}`);
          }
        }
      });
      
      // Method 2: Check worksheet['!links'] array if it exists
      if (worksheet['!links']) {
        worksheet['!links'].forEach((link: any) => {
          if (link && link.Target) {
            const ref = link.Ref || link.ref;
            if (ref) {
              const coords = XLSX.utils.decode_cell(ref);
              if (!hyperlinks[coords.r]) hyperlinks[coords.r] = {};
              hyperlinks[coords.r][coords.c] = link.Target;
              hyperlinkCount++;
              console.log(`Found hyperlink via !links in cell ${ref}: ${link.Target}`);
            }
          }
        });
      }
      
      console.log(`Sheet ${sheetName}: Found ${hyperlinkCount} hyperlinks total`);
      
      // Convert to JSON
      const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });
      
      if (!data || data.length === 0) {
        console.log(`Skipping empty sheet: ${sheetName}`);
        continue;
      }
      
      // Store hyperlinks separately for processing
      const sheetHyperlinks = hyperlinks;

      totalRows += data.length;

      // Create subject folder path: Parent/SheetName
      // Skip certain sheets that aren't subject-based
      const skipSheets = ['Overall Production Schedule', 'Data', 'Estimation', 'temp'];
      const shouldCreateSubjectFolder = !skipSheets.some(skip => 
        sheetName.toLowerCase().includes(skip.toLowerCase())
      );
      
      // If this is a subject sheet, create a subject folder under parent
      const subjectFolderName = shouldCreateSubjectFolder 
        ? `${mainParentFolder}/${sheetName}`
        : mainParentFolder;
      
      // Analyze columns to detect patterns
      const columns = Object.keys(data[0] as any);
      const analysis = this.analyzeColumns(columns, data);
      
      console.log(`Processing sheet: ${sheetName}, Subject folder: ${subjectFolderName}`);
      console.log('Column analysis:', analysis);
      
      // Process each row with hierarchical structure support
      // Pass subject folder instead of parent folder
      const processedData = await this.processRowsWithHierarchy(data, analysis, subjectFolderName, sheetName, sheetHyperlinks);
      console.log(`Processed ${processedData.length} rows with folders:`, processedData.map(r => r.folderName));
      
      // Debug: Check if we have any URLs in the processed data
      const filesWithUrls = processedData.flatMap(r => r.files.filter(f => f.url));
      console.log(`Found ${filesWithUrls.length} files with URLs/hyperlinks`);
      
      // IMPORTANT: Add the subject folder itself to be created
      if (shouldCreateSubjectFolder && processedData.length > 0) {
        // Ensure subject folder is in the processed data
        const subjectFolderEntry = {
          folderName: subjectFolderName,
          files: [],
          metadata: { isSubjectFolder: true }
        };
        // Add at the beginning to ensure it's created first
        processedData.unshift(subjectFolderEntry);
      }
      
      // Create folder structure
      const createdFolders = await this.createHierarchicalFolders(processedData, mainParentFolder);
      console.log(`Created ${createdFolders.length} folders`);
      
      // Create files with Google Drive metadata extraction
      const { files: createdFiles, filesWithDriveMetadata, filesWithoutDriveMetadata } = 
        await ExcelWithDriveMetadataService.processExcelWithDriveMetadata(
          processedData,
          createdFolders,
          this.userId
        );
      
      console.log(`Created ${createdFiles.length} files`);
      if (filesWithDriveMetadata > 0) {
        console.log(`✓ Fetched Google Drive metadata for ${filesWithDriveMetadata} files`);
      }
      if (filesWithoutDriveMetadata > 0) {
        console.log(`ℹ ${filesWithoutDriveMetadata} files without Google Drive metadata`);
      }
      
      allFolders.push(...createdFolders);
      allFiles.push(...createdFiles);
    }
    
    const summary = `Processed ${workbook.SheetNames.length} sheets with ${totalRows} total rows, created ${allFolders.length} folders and ${allFiles.length} files`;
    
    // Automatically process Google Drive files if any were imported
    // Run this asynchronously to avoid blocking the response
    let driveProcessingStarted = false;
    if (allFiles.length > 0) {
      console.log(`📥 Starting automatic Google Drive file processing in background...`);
      
      // Start Google Drive processing in the background (don't await)
      this.startBackgroundDriveProcessing().catch(error => {
        console.error('Background Drive processing error:', error);
      });
      
      driveProcessingStarted = true;
    }
    
    return {
      folders: allFolders,
      files: allFiles,
      summary: driveProcessingStarted 
        ? `${summary}. Google Drive file processing started in background.`
        : summary,
      foldersCreated: allFolders.length,
      filesCreated: allFiles.length
    };
  }

  /**
   * Start background processing of Google Drive files
   */
  private async startBackgroundDriveProcessing(): Promise<void> {
    try {
      const { storage } = await import('./storage');
      const driveFiles = await storage.getFilesByStorageType('google-drive', this.userId);
      
      if (driveFiles.length > 0) {
        console.log(`Found ${driveFiles.length} Google Drive files to process in background`);
        
        const { driveFileProcessor } = await import('./driveFileProcessor');
        const driveResult = await driveFileProcessor.processAllDriveFiles(this.userId);
        
        console.log(`✅ Background Drive processing complete: ${driveResult.processed} processed, ${driveResult.failed} failed, ${driveResult.skipped} skipped`);
      }
    } catch (error) {
      console.error('Error in background Drive processing:', error);
    }
  }

  /**
   * Process rows with hierarchical folder support
   */
  private async processRowsWithHierarchy(
    data: any[], 
    analysis: any, 
    parentFolderName: string, 
    sheetName: string,
    sheetHyperlinks?: any
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
      
      // If no folder name found, try to generate one based on row data
      if (!folderName || folderName === '') {
        // Look for lesson number in various columns
        const lessonNumber = row['Lesson Number'] || row['Lesson'] || row['Level'];
        
        // Generate a folder name based on available data
        if (lessonNumber) {
          folderName = `Lesson-${lessonNumber}`;
        } else if (sheetName.includes('LV1')) {
          // For LV1 sheets, use row index to create sequential lesson folders
          const rowNum = data.indexOf(row) + 1;
          folderName = `LV1-Lesson${rowNum}`;
        } else if (sheetName.includes('LV2')) {
          // For LV2 sheets, use row index to create sequential lesson folders
          const rowNum = data.indexOf(row) + 1;
          folderName = `LV2-Lesson${rowNum}`;
        } else {
          // Default: use sheet name and row number
          const rowNum = data.indexOf(row) + 1;
          folderName = `${sheetName}-Row${rowNum}`;
        }
      }
      
      // Always create subfolders under the main parent folder
      // This ensures all lesson folders are subfolders of the main Excel folder
      folderName = `${parentFolderName}/${folderName}`;
      
      const fileList: any[] = [];
      
      // Get hyperlinks for this row if they exist
      const rowIndex = data.indexOf(row);
      const rowHyperlinks = sheetHyperlinks && sheetHyperlinks[rowIndex] ? sheetHyperlinks[rowIndex] : {};
      
      // Debug: Show available hyperlinks for this row
      if (Object.keys(rowHyperlinks).length > 0) {
        console.log(`Row ${rowIndex} has hyperlinks in columns:`, Object.keys(rowHyperlinks));
      }
      
      // Process all columns looking for files and their hyperlinks
      Object.keys(row).forEach((colName, jsIndex) => {
        const cellValue = row[colName];
        
        // Check if this looks like a file reference (contains .mp4, .pdf, etc)
        if (cellValue && typeof cellValue === 'string' && 
            (cellValue.includes('.mp4') || cellValue.includes('.pdf') || 
             cellValue.includes('.docx') || cellValue.includes('.pptx'))) {
          
          // Check all column indices for a matching hyperlink
          // Hyperlinks are stored by Excel column index (0-based)
          let hyperlink = null;
          
          // Try to find hyperlink in any column for this row
          for (const colIdx in rowHyperlinks) {
            // If we have a hyperlink and the cell value matches or is related
            if (rowHyperlinks[colIdx]) {
              hyperlink = rowHyperlinks[colIdx];
              console.log(`Found hyperlink for ${cellValue} at column ${colIdx}: ${hyperlink}`);
              break; // Use the first hyperlink found for this row
            }
          }
          
          fileList.push({
            filename: cellValue.trim(),
            content: `File reference: ${cellValue}`,
            type: cellValue.includes('.mp4') ? 'video' : 'document',
            url: hyperlink || null
          });
          
          if (hyperlink) {
            console.log(`✓ Mapped hyperlink for ${cellValue}`);
          }
        }
      });
      
      // Note: Harry Trimmed and other file columns are already processed in the forEach loop above
      // which properly handles hyperlinks for all file references
      
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
    
    // Filter out folders that don't have any files
    const foldersWithFiles = new Set<string>();
    for (const row of processedData) {
      if (row.files && row.files.length > 0) {
        // Only add folder if it has files
        foldersWithFiles.add(row.folderName);
        // Also add parent folders in the path
        const parts = row.folderName.split('/');
        let currentPath = '';
        for (const part of parts) {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          foldersWithFiles.add(currentPath);
        }
      }
    }
    
    // First, create or get parent folder if needed
    if (parentFolderName && parentFolderName !== '' && foldersWithFiles.has(parentFolderName)) {
      // Check if parent folder already exists
      const existingParent = await db
        .select()
        .from(folders)
        .where(
          and(
            eq(folders.name, parentFolderName),
            isNull(folders.parentId),
            eq(folders.userId, this.userId)
          )
        )
        .limit(1);
      
      if (existingParent.length > 0) {
        // Use existing parent folder
        console.log(`✓ Using existing parent folder: ${parentFolderName}`);
        const parentFolder = existingParent[0];
        folderMap.set(parentFolderName, parentFolder);
      } else {
        // Create new parent folder (only if it doesn't exist)
        console.log(`Creating new parent folder: ${parentFolderName}`);
        const newParent = await db
          .insert(folders)
          .values({
            name: parentFolderName,
            path: `/${parentFolderName}`,
            parentId: null,
            userId: this.userId
          })
          .returning();
        const parentFolder = newParent[0];
        createdFolders.push(parentFolder);
        folderMap.set(parentFolderName, parentFolder);
      }
    }
    
    // Create child folders only if they have files
    const uniqueFolders = Array.from(foldersWithFiles);
    console.log(`Folders with files to create: ${uniqueFolders.length}`, uniqueFolders.slice(0, 5));
    
    for (const folderPath of uniqueFolders) {
      if (folderMap.has(folderPath)) {
        console.log(`Folder already in map, skipping: ${folderPath}`);
        continue; // Already created
      }
      
      // Skip if this folder doesn't have files
      if (!foldersWithFiles.has(folderPath)) {
        console.log(`Skipping empty folder: ${folderPath}`);
        continue;
      }
      
      const parts = folderPath.split('/');
      let currentPath = '';
      let parentId = null;
      
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        // Skip if this path level doesn't have files
        if (!foldersWithFiles.has(currentPath)) {
          continue;
        }
        
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
          const newFolderResult: any = await db
            .insert(folders)
            .values({
              name: part,
              path: `/${currentPath}`,
              parentId: parentId,
              userId: this.userId
            })
            .returning();
          const newFolder: any = newFolderResult[0];
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
   * Create files in the database from Excel data
   * Creates file entries with metadata extracted from Excel rows
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
    
    // Create file entries from Excel data
    for (const row of processedData) {
      // Get the folder ID
      const folderPath = row.folderName;
      const folderId = folderMap.get(folderPath) || folderMap.get(folderPath.split('/').pop() || '');
      
      for (const fileData of row.files) {
        if (!fileData.filename || fileData.filename.trim() === '') {
          continue; // Skip empty filenames
        }
        
        // For Excel imports, always create new files (don't check for duplicates)
        // This allows re-importing Excel files with updated data
        
        // Determine file type based on extension or content
        let mimeType = 'text/plain';
        if (fileData.type === 'video' || fileData.filename.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i)) {
          mimeType = 'video/mp4';
        } else if (fileData.filename.match(/\.pdf$/i)) {
          mimeType = 'application/pdf';
        } else if (fileData.filename.match(/\.(doc|docx)$/i)) {
          mimeType = 'application/msword';
        } else if (fileData.filename.match(/\.(ppt|pptx)$/i)) {
          mimeType = 'application/vnd.ms-powerpoint';
        }
        
        const [newFile] = await db
          .insert(files)
          .values({
            filename: fileData.filename,
            originalName: fileData.filename, // Use same as filename for Excel imports
            folderId: folderId || null,
            size: fileData.content ? Buffer.from(fileData.content).length : 100, // Default size if no content
            mimeType: mimeType,
            objectPath: fileData.url || `/excel-import/${row.folderName}/${fileData.filename}`, // Use Google Drive URL if available, otherwise virtual path
            uploadedAt: new Date(),
            userId: this.userId,
            processingStatus: 'completed', // Mark as completed since metadata is extracted
            processingError: null,
            fileContent: null, // No actual file content stored
            storageType: fileData.url ? 'google-drive' : 'excel-metadata' // Mark as google-drive if we have a URL
          })
          .returning();
        
        // Add metadata
        if (row.metadata && Object.keys(row.metadata).length > 0) {
          const metadataObj: Record<string, any> = {
            ...row.metadata,
            source: 'excel-import',
            importedAt: new Date().toISOString()
          };
          
          // Store basic content info if available
          if (fileData.content) {
            metadataObj.originalContent = fileData.content.substring(0, 500); // Store first 500 chars
          }
          
          await db
            .insert(fileMetadata)
            .values({
              fileId: newFile.id,
              summary: `Imported from Excel: ${row.folderName}`,
              keywords: ['excel-import', row.folderName],
              topics: [row.folderName],
              categories: ['Education'],
              extractedText: fileData.content || null,
              createdAt: new Date()
            });
        }
        
        createdFiles.push(newFile);
        console.log(`Created file: ${fileData.filename} in folder ${row.folderName}`);
      }
    }
    
    console.log(`Created ${createdFiles.length} file entries from Excel import`);
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