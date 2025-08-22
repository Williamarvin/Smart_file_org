import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, AlertCircle, Bot, Loader2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export function FilePreview() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [pdfLoadError, setPdfLoadError] = useState(false);

  // Fetch file details
  const { data: file, isLoading, error } = useQuery({
    queryKey: ["/api/files", id],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-slate-600" />
            <p className="text-slate-600">Loading file details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/browse")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Browse
          </Button>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            File not found or failed to load.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDownload = () => {
    // Use the API download endpoint to get the actual file content
    const fileId = (file as any)?.id;
    if (fileId) {
      // Create a hidden link and trigger download
      const downloadUrl = `/api/files/${fileId}/download`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = (file as any)?.originalName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/browse")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Browse
        </Button>
        
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-800 mb-2 break-words">
              {(file as any)?.originalName}
            </h1>
            <div className="flex items-center gap-4 text-slate-600">
              <span className="flex items-center">
                <FileText className="mr-1 h-4 w-4" />
                {(file as any)?.mimeType?.split('/')[1]?.toUpperCase()}
              </span>
              <span>{formatFileSize((file as any)?.size || 0)}</span>
              <span>Uploaded {formatDate((file as any)?.uploadedAt)}</span>
            </div>
          </div>
          
          <Button onClick={handleDownload} className="ml-4">
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* File Content Preview */}
        <div className="lg:col-span-2 space-y-6">
          {/* Processing Status */}
          {(file as any)?.processingStatus === 'pending' && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                File is being processed. AI analysis will be available shortly.
              </AlertDescription>
            </Alert>
          )}
          
          {(file as any)?.processingStatus === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to process file: {(file as any)?.processingError || 'Unknown error'}
              </AlertDescription>
            </Alert>
          )}

          {/* PDF Viewer */}
          {(file as any)?.mimeType === 'application/pdf' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Document Preview
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => window.open((file as any)?.objectPath, '_blank')}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Open in New Tab
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-slate-100">
                  {(file as any)?.objectPath && !pdfLoadError ? (
                    <iframe
                      src={`${(file as any)?.objectPath}#view=FitH`}
                      className="w-full h-full"
                      title={(file as any)?.originalName}
                      allow="fullscreen"
                      onLoad={() => {
                        console.log('PDF loaded successfully');
                        setPdfLoadError(false);
                      }}
                      onError={() => {
                        console.error('Failed to load PDF in iframe');
                        setPdfLoadError(true);
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-center text-slate-500">
                      <div>
                        <FileText className="h-12 w-12 mx-auto mb-2 text-slate-400" />
                        <p className="font-medium mb-2">
                          {pdfLoadError ? 'PDF preview unavailable in browser' : 'PDF preview not available'}
                        </p>
                        <p className="text-sm mb-4">
                          {pdfLoadError 
                            ? 'Your browser blocked the PDF preview for security reasons.' 
                            : 'Use the buttons above to view the file.'
                          }
                        </p>
                        <div className="space-y-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => window.open((file as any)?.objectPath, '_blank')}
                            className="w-full"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open PDF in New Tab
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleDownload}
                            className="w-full"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download PDF
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Text Content */}
          {(file as any)?.metadata?.extractedText && (
            <Card>
              <CardHeader>
                <CardTitle>Extracted Text</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto bg-slate-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm font-mono">
                    {(file as any)?.metadata?.extractedText?.trim() || 'No text content extracted'}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Metadata Sidebar */}
        <div className="space-y-6">
          {/* AI Analysis */}
          {(file as any)?.metadata && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bot className="mr-2 h-5 w-5" />
                  AI Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary */}
                {(file as any)?.metadata?.summary && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Summary</h4>
                    <p className="text-sm text-slate-600">{(file as any)?.metadata?.summary}</p>
                  </div>
                )}

                <Separator />

                {/* Keywords */}
                {(file as any)?.metadata?.keywords && (file as any)?.metadata?.keywords.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Keywords</h4>
                    <div className="flex flex-wrap gap-1">
                      {(file as any)?.metadata?.keywords.map((keyword: string, index: number) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Topics */}
                {(file as any)?.metadata?.topics && (file as any)?.metadata?.topics.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Topics</h4>
                    <div className="flex flex-wrap gap-1">
                      {(file as any)?.metadata?.topics.map((topic: string, index: number) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Categories */}
                {(file as any)?.metadata?.categories && (file as any)?.metadata?.categories.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Categories</h4>
                    <div className="flex flex-wrap gap-1">
                      {(file as any)?.metadata?.categories.map((category: string, index: number) => (
                        <Badge key={index} variant="default" className="text-xs">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confidence */}
                {(file as any)?.metadata?.confidence && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Analysis Confidence</h4>
                    <div className="flex items-center">
                      <div className="flex-1 bg-slate-200 rounded-full h-2 mr-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ width: `${(file as any)?.metadata?.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600">
                        {Math.round((file as any)?.metadata?.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* File Details */}
          <Card>
            <CardHeader>
              <CardTitle>File Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h4 className="font-semibold text-sm mb-1">File Name</h4>
                <p className="text-sm text-slate-600 break-words">{(file as any)?.originalName}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-sm mb-1">Size</h4>
                <p className="text-sm text-slate-600">{formatFileSize((file as any)?.size)}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-sm mb-1">Type</h4>
                <p className="text-sm text-slate-600">{(file as any)?.mimeType}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-sm mb-1">Uploaded</h4>
                <p className="text-sm text-slate-600">{formatDate((file as any)?.uploadedAt)}</p>
              </div>
              
              {(file as any)?.processedAt && (
                <div>
                  <h4 className="font-semibold text-sm mb-1">Processed</h4>
                  <p className="text-sm text-slate-600">{formatDate((file as any)?.processedAt)}</p>
                </div>
              )}
              
              <div>
                <h4 className="font-semibold text-sm mb-1">Status</h4>
                <Badge 
                  variant={(file as any)?.processingStatus === 'completed' ? 'default' : 
                          (file as any)?.processingStatus === 'error' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {(file as any)?.processingStatus}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}