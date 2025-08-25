import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Loader2,
  FileText,
  FolderOpen,
  Zap,
  Eye,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';

interface ProcessingFile {
  id: string;
  filename: string;
  processingStatus: string;
  processingStartedAt: string | null;
  processingError: string | null;
  processingDuration: number;
  fileType: string;
  fileSize: number;
  folderId: string | null;
  folderName?: string;
}

interface ProcessingStats {
  totalFiles: number;
  processedFiles: number;
  processingFiles: number;
  failedFiles: number;
  stuckFiles: number;
  averageProcessingTime: number;
}

export default function ProcessingStatus() {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/files/processing-status'] });
        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const { data: stats } = useQuery<ProcessingStats>({
    queryKey: ['/api/stats'],
    refetchInterval: autoRefresh ? 5000 : false
  });

  const { data: files = [], isLoading } = useQuery<ProcessingFile[]>({
    queryKey: ['/api/files/processing-status', selectedStatus],
    queryFn: async () => {
      const response = await fetch(`/api/files/processing-status?status=${selectedStatus}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch processing status');
      return response.json();
    },
    refetchInterval: autoRefresh ? 5000 : false,
    staleTime: 0,
    gcTime: 0
  });

  const retryFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/retry-processing`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to retry');
      toast({
        title: "Processing Restarted",
        description: "The file will be processed again."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/files/processing-status'] });
    } catch (error) {
      toast({
        title: "Retry Failed",
        description: "Could not restart processing for this file.",
        variant: "destructive"
      });
    }
  };

  const markFailed = async (fileId: string, reason: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/mark-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (!response.ok) throw new Error('Failed to mark as failed');
      toast({
        title: "Marked as Failed",
        description: "The file has been marked as failed."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/files/processing-status'] });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Could not update file status.",
        variant: "destructive"
      });
    }
  };

  const viewFileDetails = async (file: ProcessingFile) => {
    setSelectedFile(file);
    
    // If completed, fetch metadata
    if (file.processingStatus === 'completed') {
      try {
        const response = await fetch(`/api/files/${file.id}`);
        if (response.ok) {
          const fullFileData = await response.json();
          setSelectedFile(fullFileData);
        }
      } catch (error) {
        console.error('Failed to fetch file metadata:', error);
      }
    }
    
    setShowDetailsModal(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'stuck':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      processing: "secondary",
      failed: "destructive",
      stuck: "outline"
    };
    return (
      <Badge variant={variants[status] || "outline"}>
        {status}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return (ms / 60000).toFixed(1) + 'min';
  };

  // Categorize files
  const pendingFiles = files.filter(f => f.processingStatus === 'pending');
  const processingFiles = files.filter(f => f.processingStatus === 'processing');
  const stuckFiles = files.filter(f => {
    if ((f.processingStatus === 'processing' || f.processingStatus === 'pending') && f.processingStartedAt) {
      const startTime = new Date(f.processingStartedAt).getTime();
      const now = Date.now();
      return (now - startTime) > 2 * 60 * 60 * 1000; // 2 hours
    }
    return false;
  });
  const errorFiles = files.filter(f => f.processingStatus === 'error' || f.processingStatus === 'failed');
  const completedFiles = files.filter(f => f.processingStatus === 'completed');
  const skippedFiles = files.filter(f => f.processingStatus === 'skipped');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Processing Status Monitor</h1>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalFiles || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.processedFiles || 0}
            </div>
            {stats && stats.totalFiles > 0 && (
              <Progress 
                value={(stats.processedFiles / stats.totalFiles) * 100} 
                className="mt-2 h-2"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">
              {pendingFiles.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 flex items-center">
              {processingFiles.length}
              {processingFiles.length > 0 && (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Stuck</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stuckFiles.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {errorFiles.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Files are now processed automatically in the background - no manual processing needed */}

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'processing', 'stuck', 'error', 'skipped', 'completed'].map(status => (
          <Button
            key={status}
            variant={selectedStatus === status ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedStatus(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
            {status === 'pending' && ` (${pendingFiles.length})`}
            {status === 'processing' && ` (${processingFiles.length})`}
            {status === 'stuck' && ` (${stuckFiles.length})`}
            {status === 'error' && ` (${errorFiles.length})`}
            {status === 'skipped' && ` (${skippedFiles.length})`}
            {status === 'completed' && ` (${completedFiles.length})`}
          </Button>
        ))}
      </div>

      {/* Stuck Files Alert */}
      {stuckFiles.length > 0 && selectedStatus !== 'completed' && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>{stuckFiles.length} files</strong> have been processing for over 2 hours and may be stuck.
            Consider retrying or marking them as failed.
          </AlertDescription>
        </Alert>
      )}

      {/* Files List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedStatus === 'all' ? 'All Files' : `${selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)} Files`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No files found with selected status
            </div>
          ) : (
            <div className="space-y-2">
              {files.map(file => {
                const isStuck = file.processingStatus === 'processing' && 
                  file.processingStartedAt && 
                  (Date.now() - new Date(file.processingStartedAt).getTime()) > 2 * 60 * 60 * 1000;
                
                return (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {getStatusIcon(isStuck ? 'stuck' : file.processingStatus)}
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{file.filename}</span>
                          {getStatusBadge(isStuck ? 'stuck' : file.processingStatus)}
                        </div>
                        
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span>{formatFileSize(file.fileSize)}</span>
                          <span>{file.fileType}</span>
                          {file.folderName && (
                            <span className="flex items-center gap-1">
                              <FolderOpen className="h-3 w-3" />
                              {file.folderName}
                            </span>
                          )}
                          {file.processingStartedAt && (
                            <span>
                              Started {formatDistanceToNow(new Date(file.processingStartedAt))} ago
                            </span>
                          )}
                          {file.processingDuration > 0 && (
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              {formatDuration(file.processingDuration)}
                            </span>
                          )}
                        </div>
                        
                        {file.processingError && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            {file.processingError}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {/* View Details button for all files */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => viewFileDetails(file)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                      
                      {(file.processingStatus === 'error' || file.processingStatus === 'failed' || isStuck) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retryFile(file.id)}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Retry
                        </Button>
                      )}
                      {isStuck && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => markFailed(file.id, 'Processing timeout - stuck for over 2 hours')}
                        >
                          Mark Failed
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              File Details: {selectedFile?.filename}
            </DialogTitle>
            <DialogDescription>
              Detailed information about the file and its processing status
            </DialogDescription>
          </DialogHeader>
          
          {selectedFile && (
            <div className="space-y-4 mt-4">
              {/* Basic Information */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-gray-700">Basic Information</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">ID:</span> {selectedFile.id}</div>
                  <div><span className="font-medium">Status:</span> {getStatusBadge(selectedFile.processingStatus)}</div>
                  <div><span className="font-medium">Type:</span> {selectedFile.fileType || selectedFile.mimeType}</div>
                  <div><span className="font-medium">Size:</span> {formatFileSize(selectedFile.fileSize || selectedFile.size || 0)}</div>
                  {selectedFile.folderName && (
                    <div><span className="font-medium">Folder:</span> {selectedFile.folderName}</div>
                  )}
                  {selectedFile.processingStartedAt && (
                    <div><span className="font-medium">Started:</span> {new Date(selectedFile.processingStartedAt).toLocaleString()}</div>
                  )}
                  {selectedFile.processingDuration > 0 && (
                    <div><span className="font-medium">Duration:</span> {formatDuration(selectedFile.processingDuration)}</div>
                  )}
                  {selectedFile.processedAt && (
                    <div><span className="font-medium">Completed:</span> {new Date(selectedFile.processedAt).toLocaleString()}</div>
                  )}
                </div>
              </div>

              {/* Error Information */}
              {selectedFile.processingError && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-red-700">Error Information</h3>
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {selectedFile.processingError}
                  </div>
                </div>
              )}

              {/* Metadata (for completed files) */}
              {selectedFile.processingStatus === 'completed' && selectedFile.metadata && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-gray-700">AI-Generated Metadata</h3>
                  <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                    {selectedFile.metadata.summary && (
                      <div>
                        <span className="font-medium text-sm">Summary:</span>
                        <p className="text-sm mt-1 text-gray-600">{selectedFile.metadata.summary}</p>
                      </div>
                    )}
                    
                    {selectedFile.metadata.keywords && selectedFile.metadata.keywords.length > 0 && (
                      <div>
                        <span className="font-medium text-sm">Keywords:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedFile.metadata.keywords.map((keyword: string, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {selectedFile.metadata.topics && selectedFile.metadata.topics.length > 0 && (
                      <div>
                        <span className="font-medium text-sm">Topics:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedFile.metadata.topics.map((topic: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {selectedFile.metadata.category && (
                      <div>
                        <span className="font-medium text-sm">Category:</span>
                        <Badge className="ml-2 text-xs">{selectedFile.metadata.category}</Badge>
                      </div>
                    )}
                    
                    {selectedFile.metadata.confidence && (
                      <div>
                        <span className="font-medium text-sm">AI Confidence:</span>
                        <span className="ml-2 text-sm">{(selectedFile.metadata.confidence * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    
                    {selectedFile.metadata.extractedText && (
                      <div>
                        <span className="font-medium text-sm">Extracted Text Preview:</span>
                        <div className="mt-1 p-2 bg-white border rounded text-xs font-mono max-h-40 overflow-y-auto">
                          {selectedFile.metadata.extractedText.slice(0, 500)}...
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* File Path */}
              {selectedFile.objectPath && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-gray-700">Storage Information</h3>
                  <div className="p-2 bg-gray-100 rounded text-xs font-mono overflow-x-auto">
                    {selectedFile.objectPath}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}