import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  FileSpreadsheet, 
  FileImage, 
  File as FileIcon,
  MoreVertical,
  Star,
  Trash2,
  Download,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Bot,
  Grid3X3,
  List,
  ChevronDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FileItem {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  objectPath: string;
  uploadedAt: string;
  processedAt?: string;
  processingStatus: string;
  processingError?: string;
  metadata?: {
    summary?: string;
    keywords?: string[];
    topics?: string[];
    categories?: string[];
    confidence?: number;
  };
}

interface FileGridProps {
  files: FileItem[];
  isLoading: boolean;
  onDeleteFile: (fileId: string) => void;
  isSearchResults?: boolean;
  searchQuery?: string;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.includes('pdf')) return FileText;
  if (mimeType.includes('word') || mimeType.includes('document')) return FileText;
  if (mimeType.includes('text')) return FileText;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('image')) return FileImage;
  return FileIcon;
};

const getFileIconColor = (mimeType: string) => {
  if (mimeType.includes('pdf')) return 'text-red-600 bg-red-100';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-600 bg-blue-100';
  if (mimeType.includes('text')) return 'text-gray-600 bg-gray-100';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'text-green-600 bg-green-100';
  if (mimeType.includes('image')) return 'text-purple-600 bg-purple-100';
  return 'text-slate-600 bg-slate-100';
};

const formatFileSize = (bytes: number) => {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
  return `${Math.ceil(diffDays / 30)} months ago`;
};

// Removed similarity scoring system as requested

export default function FileGrid({ 
  files, 
  isLoading, 
  onDeleteFile, 
  isSearchResults = false, 
  searchQuery 
}: FileGridProps) {
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-slate-600">Loading files...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {/* Header with View Controls */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center">
            <FileIcon className="text-blue-500 mr-2" />
            My Files
            <Badge variant="secondary" className="ml-2">
              {files.length}
            </Badge>
          </h2>
          
          <div className="flex items-center space-x-3">
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <Button variant="ghost" size="sm" className="bg-white shadow-sm">
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-500">
                <List className="h-4 w-4" />
              </Button>
            </div>
            
            <Select defaultValue="relevance">
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Sort by relevance</SelectItem>
                <SelectItem value="date">Sort by date</SelectItem>
                <SelectItem value="name">Sort by name</SelectItem>
                <SelectItem value="size">Sort by size</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <CardContent className="p-6">
        {/* Search Results Header */}
        {isSearchResults && files.length > 0 && (
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <AlertDescription className="flex items-center text-blue-800">
              <FileIcon className="mr-2 h-4 w-4" />
              <span className="font-medium">Search Results</span>
              <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-700">
                {files.length}
              </Badge>
              <span className="ml-2">Found files similar to: "{searchQuery}"</span>
            </AlertDescription>
          </Alert>
        )}

        {files.length === 0 ? (
          <div className="text-center py-12">
            <FileIcon className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {isSearchResults ? 'No files found' : 'No files uploaded yet'}
            </h3>
            <p className="text-slate-500">
              {isSearchResults 
                ? 'Try adjusting your search terms or upload more files.'
                : 'Upload your first file to get started with intelligent organization.'
              }
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {files.map((file) => {
                const FileIconComponent = getFileIcon(file.mimeType);
                const iconColors = getFileIconColor(file.mimeType);
                
                return (
                  <div
                    key={file.id}
                    className="group border border-slate-200 rounded-lg p-4 hover:shadow-md transition-all duration-200 hover:border-blue-300"
                  >
                    <div className="flex items-start space-x-3">
                      {/* File Icon */}
                      <div className={`w-12 h-12 ${iconColors} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        {file.processingStatus === 'processing' ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <FileIconComponent className="h-6 w-6" />
                        )}
                      </div>
                      
                      {/* File Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-slate-900 truncate group-hover:text-blue-600">
                            {file.originalName}
                          </h3>
                          {/* Show relevance indicator for search results */}
                          {isSearchResults && file.processingStatus === 'completed' && (
                            <div className="text-xs text-blue-600 font-medium">
                              Relevant match
                            </div>
                          )}
                        </div>
                        
                        {/* Processing Status */}
                        {file.processingStatus === 'processing' && (
                          <div className="mt-2">
                            <div className="flex items-center text-sm text-amber-700 mb-2">
                              <Bot className="mr-2 h-4 w-4" />
                              <span>AI is extracting metadata and generating keywords...</span>
                            </div>
                            <Progress value={60} className="h-2" />
                          </div>
                        )}

                        {/* Error Status */}
                        {file.processingStatus === 'error' && (
                          <div className="mt-2">
                            <div className="flex items-center text-sm text-red-700">
                              <AlertTriangle className="mr-2 h-4 w-4" />
                              <span>Failed to process: {file.processingError || 'Unknown error'}</span>
                            </div>
                            <div className="mt-3 flex space-x-2">
                              <Button variant="link" size="sm" className="text-blue-600 hover:text-blue-800 p-0">
                                Retry Processing
                              </Button>
                              <Button 
                                variant="link" 
                                size="sm" 
                                className="text-red-600 hover:text-red-800 p-0"
                                onClick={() => onDeleteFile(file.id)}
                              >
                                Remove File
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* AI-Generated Metadata */}
                        {file.metadata && file.processingStatus === 'completed' && (
                          <div className="mt-2 space-y-2">
                            <p className="text-sm text-slate-600 line-clamp-2">
                              {file.metadata.summary}
                            </p>
                            
                            {/* Keywords Tags */}
                            {file.metadata.keywords && file.metadata.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {file.metadata.keywords.slice(0, 3).map((keyword, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {keyword}
                                  </Badge>
                                ))}
                                {file.metadata.keywords.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{file.metadata.keywords.length - 3} more
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* File Metadata */}
                        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                          <span>{formatFileSize(file.size)} • {file.mimeType.split('/')[1].toUpperCase()}</span>
                          <span>{formatDate(file.uploadedAt)}</span>
                        </div>
                      </div>
                      
                      {/* Actions Menu */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => onDeleteFile(file.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load More */}
            <div className="mt-6 text-center">
              <Button variant="outline">
                <ChevronDown className="mr-2 h-4 w-4" />
                Load more files
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
