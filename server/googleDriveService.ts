import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import path from "path";

/**
 * Google Drive Service for extracting metadata from Drive files
 * Supports both Service Account and OAuth2 authentication
 */
export class GoogleDriveService {
  private drive: drive_v3.Drive | null = null;
  private auth: OAuth2Client | null = null;
  private initialized = false;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initialize();
  }

  public async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Initialize Google Drive API client
   */
  private async initialize(): Promise<void> {
    try {
      // Check for service account credentials first
      // Support both GOOGLE_CLOUD_CREDENTIALS and GOOGLE_SERVICE_ACCOUNT_KEY
      const credentialsJson =
        process.env.GOOGLE_CLOUD_CREDENTIALS ||
        process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      if (credentialsJson) {
        console.log("Initializing Google Drive API with Service Account...");
        const credentials = JSON.parse(credentialsJson);

        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ["https://www.googleapis.com/auth/drive.readonly"],
        });

        this.drive = google.drive({ version: "v3", auth });
        this.initialized = true;
        console.log("✓ Google Drive API initialized with Service Account");
      }
      // Fall back to OAuth2 if available
      else if (
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET
      ) {
        console.log("Initializing Google Drive API with OAuth2...");

        this.auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI ||
            "http://localhost:5000/api/auth/google/callback",
        );

        // If we have a refresh token, use it
        if (process.env.GOOGLE_REFRESH_TOKEN) {
          this.auth.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
          });

          this.drive = google.drive({ version: "v3", auth: this.auth });
          this.initialized = true;
          console.log("✓ Google Drive API initialized with OAuth2");
        }
      } else {
        console.warn(
          "⚠️ Google Drive API not configured. Please provide credentials.",
        );
        console.warn(
          "Set either GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_CLIENT_ID/SECRET",
        );
      }
    } catch (error) {
      console.error("Failed to initialize Google Drive API:", error);
      this.initialized = false;
    }
  }

  /**
   * Download file content from Google Drive
   */
  public async downloadFile(fileIdOrUrl: string): Promise<Buffer | null> {
    if (!this.initialized || !this.drive) {
      console.log("Cannot download file - Google Drive API not initialized");
      return null;
    }

    try {
      // Extract file ID if URL was provided
      const fileId = fileIdOrUrl.includes("drive.google.com")
        ? this.extractFileId(fileIdOrUrl)
        : fileIdOrUrl;

      if (!fileId) {
        console.error("Invalid Google Drive URL or file ID:", fileIdOrUrl);
        return null;
      }

      // First, try to get file metadata to check permissions
      const metadataResponse = await this.drive.files.get({
        fileId,
        fields: "id, name, capabilities, shared, ownedByMe, permissions",
        supportsAllDrives: true,
      });

      console.log(`File metadata:`, {
        name: metadataResponse.data.name,
        shared: metadataResponse.data.shared,
        ownedByMe: metadataResponse.data.ownedByMe,
        capabilities: metadataResponse.data.capabilities,
      });

      const response = await this.drive.files.get(
        {
          fileId,
          alt: "media",
          supportsAllDrives: true, // Support shared drives
          acknowledgeAbuse: true, // Allow downloading files flagged by Drive
        },
        { responseType: "arraybuffer" },
      );

      const buffer = Buffer.from(response.data as ArrayBuffer);

      // Check if we got actual content
      if (!buffer || buffer.length === 0) {
        console.error(`Downloaded empty file for ${fileId}`);
        return null;
      }

      console.log(
        `✅ Downloaded file from Google Drive (${buffer.length} bytes)`,
      );
      return buffer;
    } catch (error: any) {
      console.error(`Failed to download file:`, error.message);
      if (error.response) {
        console.error("Error details:", {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        });
      }
      return null;
    }
  }

  /**
   * Extract file ID from various Google Drive URL formats
   */
  public extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/, // https://drive.google.com/file/d/FILE_ID/view
      /id=([a-zA-Z0-9_-]+)/, // https://drive.google.com/open?id=FILE_ID
      /\/folders\/([a-zA-Z0-9_-]+)/, // Folder URLs
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Get metadata for a Google Drive file
   */
  public async getFileMetadata(
    fileIdOrUrl: string,
  ): Promise<GoogleDriveMetadata | null> {
    if (!this.initialized || !this.drive) {
      console.warn(
        "Google Drive API not initialized. Using fallback metadata.",
      );
      return this.getFallbackMetadata(fileIdOrUrl);
    }

    try {
      // Extract file ID if URL was provided
      const fileId = fileIdOrUrl.includes("drive.google.com")
        ? this.extractFileId(fileIdOrUrl)
        : fileIdOrUrl;

      if (!fileId) {
        console.error("Invalid Google Drive URL or file ID:", fileIdOrUrl);
        return null;
      }

      // Fetch comprehensive metadata from Google Drive API
      const response = await this.drive.files.get({
        fileId: fileId,
        supportsAllDrives: true, // Support shared drives
        fields:
          "id, name, mimeType, size, createdTime, modifiedTime, " +
          "owners, description, thumbnailLink, webViewLink, " +
          "webContentLink, iconLink, hasThumbnail, imageMediaMetadata, " +
          "videoMediaMetadata, capabilities, permissions, parents, " +
          "trashed, explicitlyTrashed, properties, appProperties",
      });

      const file = response.data;

      // Build comprehensive metadata object
      const metadata: GoogleDriveMetadata = {
        // Core file information
        fileId: file.id!,
        actualName: file.name || "Unknown",
        mimeType: file.mimeType || "application/octet-stream",
        size: parseInt(file.size || "0"),

        // Timestamps
        createdTime: file.createdTime || undefined,
        modifiedTime: file.modifiedTime || undefined,

        // Ownership and permissions
        owners:
          file.owners?.map((owner) => owner.emailAddress || "Unknown") || [],

        // Links and URLs
        thumbnailLink: file.thumbnailLink || undefined,
        webViewLink: file.webViewLink || undefined,
        webContentLink: file.webContentLink || undefined,
        iconLink: file.iconLink || undefined,

        // Media metadata for videos
        videoMediaMetadata: file.videoMediaMetadata
          ? {
              width: file.videoMediaMetadata.width || undefined,
              height: file.videoMediaMetadata.height || undefined,
              durationMillis: file.videoMediaMetadata.durationMillis
                ? parseInt(file.videoMediaMetadata.durationMillis)
                : undefined,
            }
          : undefined,

        // Media metadata for images
        imageMediaMetadata: file.imageMediaMetadata
          ? {
              width: file.imageMediaMetadata.width || undefined,
              height: file.imageMediaMetadata.height || undefined,
              rotation: file.imageMediaMetadata.rotation || undefined,
            }
          : undefined,

        // Additional properties
        description: file.description || undefined,
        parents: file.parents || [],
        trashed: file.trashed || false,

        // Capabilities
        canDownload: file.capabilities?.canDownload || false,
        canShare: file.capabilities?.canShare || false,
        canCopy: file.capabilities?.canCopy || false,

        // Custom properties if any
        properties: file.properties || {},
        appProperties: file.appProperties || {},
      };

      console.log(
        `✓ Retrieved metadata for: ${metadata.actualName} (${fileId})`,
      );
      return metadata;
    } catch (error: any) {
      console.error("Failed to get file metadata:", error.message);

      // Return fallback metadata if API fails
      return this.getFallbackMetadata(fileIdOrUrl);
    }
  }

  /**
   * Batch get metadata for multiple files (more efficient)
   */
  public async batchGetMetadata(
    fileIdsOrUrls: string[],
  ): Promise<Map<string, GoogleDriveMetadata | null>> {
    const results = new Map<string, GoogleDriveMetadata | null>();

    // Process in batches of 10 to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < fileIdsOrUrls.length; i += batchSize) {
      const batch = fileIdsOrUrls.slice(i, i + batchSize);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (idOrUrl) => {
          const metadata = await this.getFileMetadata(idOrUrl);
          return { idOrUrl, metadata };
        }),
      );

      // Store results
      for (const { idOrUrl, metadata } of batchResults) {
        results.set(idOrUrl, metadata);
      }

      // Small delay to avoid rate limiting
      if (i + batchSize < fileIdsOrUrls.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Get fallback metadata when API is not available
   */
  private getFallbackMetadata(fileIdOrUrl: string): GoogleDriveMetadata {
    const fileId = this.extractFileId(fileIdOrUrl) || fileIdOrUrl;

    return {
      fileId: fileId,
      actualName: "Google Drive File",
      mimeType: "application/octet-stream",
      size: 0,
      owners: [],
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      webContentLink: `https://drive.google.com/uc?export=download&id=${fileId}`,
      thumbnailLink: `https://drive.google.com/thumbnail?id=${fileId}`,
      canDownload: false,
      canShare: false,
      canCopy: false,
      trashed: false,
      parents: [],
      properties: {},
      appProperties: {},
    };
  }

  /**
   * Check if service is properly initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Generate direct download URL
   */
  public getDirectDownloadUrl(fileId: string): string {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  /**
   * Generate embed URL for preview
   */
  public getEmbedUrl(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
}

/**
 * Type definition for Google Drive file metadata
 */
export interface GoogleDriveMetadata {
  // Core file information
  fileId: string;
  actualName: string;
  mimeType: string;
  size: number;

  // Timestamps
  createdTime?: string;
  modifiedTime?: string;

  // Ownership
  owners: string[];

  // Links
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;

  // Media metadata
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: number;
  };

  imageMediaMetadata?: {
    width?: number;
    height?: number;
    rotation?: number;
  };

  // Additional properties
  description?: string;
  parents: string[];
  trashed: boolean;

  // Capabilities
  canDownload: boolean;
  canShare: boolean;
  canCopy: boolean;

  // Custom properties
  properties: Record<string, string>;
  appProperties: Record<string, string>;
}

// Export singleton instance
export const googleDriveService = new GoogleDriveService();
