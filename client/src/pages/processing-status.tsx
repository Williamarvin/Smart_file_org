import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Loader2,
  FileText,
  FolderOpen,
  Zap
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
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

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

  const processPendingBatch = async (limit: number = 10) => {
    setIsProcessingBatch(true);
    try {
      const response = await fetch('/api/files/process-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit })
      });
      if (!response.ok) throw new Error('Failed to start batch processing');
      const result = await response.json();
      toast({
        title: "Batch Processing Started",
        description: `Processing ${result.filesQueued} files in the background. This may take several minutes.`
      });
      // Refresh data after a short delay to show status changes
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/files/processing-status'] });
        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      }, 2000);
    } catch (error) {
      toast({
        title: "Batch Processing Failed",
        description: "Could not start batch processing.",
        variant: "destructive"
      });
    } finally {
      setIsProcessingBatch(false);
    }
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
  const failedFiles = files.filter(f => f.processingStatus === 'failed');
  const completedFiles = files.filter(f => f.processingStatus === 'completed');

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
            <CardTitle className="text-sm font-medium text-red-600">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {failedFiles.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overall Progress Bar and Batch Processing */}
      {pendingFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Processing Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-gray-600">
                  {stats?.processedFiles || 0} / {stats?.totalFiles || 0} files processed
                  ({stats && stats.totalFiles > 0 
                    ? Math.round((stats.processedFiles / stats.totalFiles) * 100) 
                    : 0}%)
                </span>
              </div>
              <Progress 
                value={stats && stats.totalFiles > 0 
                  ? (stats.processedFiles / stats.totalFiles) * 100 
                  : 0} 
                className="h-3"
              />
              <div className="mt-2 text-sm text-gray-500">
                {pendingFiles.length} files pending • {processingFiles.length} currently processing
              </div>
            </div>
            
            <div className="flex gap-2 items-center">
              <Button
                onClick={() => processPendingBatch(10)}
                disabled={isProcessingBatch || pendingFiles.length === 0}
                variant="default"
                size="sm"
              >
                {isProcessingBatch ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Process Next 10 Files
                  </>
                )}
              </Button>
              
              <Button
                onClick={() => processPendingBatch(50)}
                disabled={isProcessingBatch || pendingFiles.length === 0}
                variant="outline"
                size="sm"
              >
                Process 50 Files
              </Button>
              
              <Button
                onClick={() => processPendingBatch(100)}
                disabled={isProcessingBatch || pendingFiles.length === 0}
                variant="outline"
                size="sm"
              >
                Process 100 Files
              </Button>
              
              {pendingFiles.length > 0 && (
                <span className="ml-auto text-sm text-yellow-600">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  {pendingFiles.length} files waiting to be processed
                </span>
              )}
            </div>
            
            <Alert className="border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Files imported from Excel need to be processed manually. Click the buttons above to start processing in batches. Processing uses AI to extract metadata and may take 10-30 seconds per file.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'processing', 'stuck', 'failed', 'completed'].map(status => (
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
            {status === 'failed' && ` (${failedFiles.length})`}
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
                      {(file.processingStatus === 'failed' || isStuck) && (
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
    </div>
  );
}