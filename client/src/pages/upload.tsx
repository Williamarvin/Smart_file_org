import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import FileUploadZone from "@/components/file-upload-zone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Clock, AlertCircle, FileText, Zap, Brain } from "lucide-react";

export function Upload() {
  const queryClient = useQueryClient();
  const [recentUploads, setRecentUploads] = useState<Array<{
    id: string;
    name: string;
    status: 'uploading' | 'processing' | 'complete' | 'error';
    timestamp: Date;
  }>>([]);

  const handleFileUploadSuccess = () => {
    // Add to recent uploads - we'll get the filename from a generic source
    const newUpload = {
      id: Date.now().toString(),
      name: 'Uploaded file',
      status: 'processing' as const,
      timestamp: new Date(),
    };
    
    setRecentUploads(prev => [newUpload, ...prev.slice(0, 4)]);
    
    // Simulate processing completion after a delay
    setTimeout(() => {
      setRecentUploads(prev => 
        prev.map(upload => 
          upload.id === newUpload.id 
            ? { ...upload, status: 'complete' }
            : upload
        )
      );
    }, 3000);

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploading':
        return <Clock className="text-blue-500" />;
      case 'processing':
        return <Brain className="text-yellow-500 animate-pulse" />;
      case 'complete':
        return <CheckCircle className="text-green-500" />;
      case 'error':
        return <AlertCircle className="text-red-500" />;
      default:
        return <FileText className="text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'AI Processing...';
      case 'complete':
        return 'Ready';
      case 'error':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Upload Files</h1>
        <p className="text-slate-600">Upload documents for AI-powered analysis and organization</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Zone */}
        <div>
          <FileUploadZone onUploadSuccess={handleFileUploadSuccess} />
          
          {/* Upload Instructions */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="text-blue-500" />
                <span>AI Processing Features</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Brain className="text-purple-500 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-slate-800">Intelligent Metadata</h4>
                    <p className="text-sm text-slate-600">GPT extracts key information, themes, and categorizes content automatically</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <FileText className="text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-slate-800">Multi-format Support</h4>
                    <p className="text-sm text-slate-600">Supports PDF, DOCX, and TXT files with text extraction</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="text-blue-500 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-slate-800">Smart Categories</h4>
                    <p className="text-sm text-slate-600">Automatically sorts into Personal/Life, Academic, or other custom categories</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Uploads */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Recent Uploads</CardTitle>
            </CardHeader>
            <CardContent>
              {recentUploads.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="text-slate-400 text-4xl mx-auto mb-4" />
                  <p className="text-slate-500">No recent uploads</p>
                  <p className="text-sm text-slate-400">Upload files will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentUploads.map((upload) => (
                    <div key={upload.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(upload.status)}
                        <div>
                          <p className="font-medium text-slate-800 truncate max-w-48">{upload.name}</p>
                          <p className="text-sm text-slate-500">
                            {upload.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-600">
                          {getStatusText(upload.status)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}