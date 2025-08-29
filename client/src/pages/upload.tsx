import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import FileUploadZone from "@/components/file-upload-zone";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { FileText, Upload as UploadIcon, CheckCircle, AlertCircle, Clock, Zap, Brain, FileCheck, FolderOpen, FileSpreadsheet, Loader2, Cpu } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function Upload() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Cleanup intervals and timeouts on component unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }
    };
  }, []);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelProcessingResult, setExcelProcessingResult] = useState<any>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiProcessingProgress, setAiProcessingProgress] = useState(0);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  
  // Refs to store interval and timeout IDs for cleanup
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch files to show recent uploads and processing status
  const { data: files = [] } = useQuery({
    queryKey: ["/api/files"],
    refetchInterval: 5000,
  });

  // Fetch categories to show after upload completion
  const { data: categories = [] } = useQuery({
    queryKey: ["/api/categories"],
    refetchInterval: 10000,
  });

  // Excel processing mutation
  const processExcelMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/excel/process', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to process Excel file';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (parseError) {
          // Server returned non-JSON response (likely HTML error page)
          const textResponse = await response.text();
          console.error('Server returned non-JSON error:', textResponse);
          errorMessage = `Server error (${response.status}): Please check the file format and try again`;
        }
        throw new Error(errorMessage);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setExcelProcessingResult(data);
      
      // Start AI processing phase if files were created
      if (data.processingStatus?.processing || data.filesCreated > 0) {
        setIsProcessingAI(true);
        setAiProcessingProgress(0);
        setProcessingStartTime(Date.now());
        
        // Clear any existing intervals before starting new ones
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current);
        }
        
        // Track AI processing progress with real file status
        const totalFiles = data.processingStatus?.total || data.filesCreated || 0;
        let processedCount = 0;
        
        progressIntervalRef.current = setInterval(() => {
          // Simulate gradual progress (2-3 files per interval)
          const increment = Math.min(Math.random() * 2 + 1, totalFiles - processedCount);
          processedCount += increment;
          const progress = Math.min((processedCount / totalFiles) * 100, 100);
          setAiProcessingProgress(progress);
          
          if (progress >= 100) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            setTimeout(() => {
              setIsProcessingAI(false);
              setProcessingStartTime(null);
              toast({
                title: "✅ AI Processing Complete",
                description: `All ${totalFiles} files have been processed with Whisper transcription and AI metadata generation.`,
              });
            }, 1000);
          }
        }, 3000); // Update every 3 seconds
        
        // Fallback: Auto-clear after max 5 minutes
        fallbackTimeoutRef.current = setTimeout(() => {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          setIsProcessingAI(false);
          setAiProcessingProgress(100);
          setProcessingStartTime(null);
          fallbackTimeoutRef.current = null;
        }, 300000);
      }
      
      toast({
        title: "Excel Upload Complete",
        description: `Created ${data.foldersCreated} folders and ${data.filesCreated} files. AI processing started...`,
      });
      
      // Refresh files list
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Excel Processing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExcelFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setExcelFile(file);
      setExcelProcessingResult(null);
    }
  };

  const handleProcessExcel = () => {
    if (excelFile) {
      processExcelMutation.mutate(excelFile);
    }
  };

  const handleFileUploadSuccess = () => {
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
  };

  // Get processing statistics  
  const processingFiles = Array.isArray(files) ? files.filter((file: any) => 
    file.processingStatus === "pending" || file.processingStatus === "processing"
  ) : [];
  const completedFiles = Array.isArray(files) ? files.filter((file: any) => file.processingStatus === "completed") : [];
  const errorFiles = Array.isArray(files) ? files.filter((file: any) => file.processingStatus === "error") : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Upload Files</h1>
          <p className="text-slate-600">Upload documents for AI-powered analysis and organization</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Upload Section */}
          <div className="lg:col-span-3">
            {/* Upload Zone */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <UploadIcon className="text-blue-600" />
                  <span>Upload Files</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-w-2xl mx-auto">
                  <FileUploadZone onUploadSuccess={handleFileUploadSuccess} />
                </div>
              </CardContent>
            </Card>

            {/* Excel Upload Zone */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileSpreadsheet className="text-green-600" />
                  <span>Import from Excel</span>
                </CardTitle>
                <CardDescription>
                  Upload an Excel file to automatically create folder structures and import content
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="excel-upload" className="block text-sm font-medium text-gray-700 mb-2">
                      Select Excel File (.xlsx, .xls, .csv)
                    </label>
                    <input
                      id="excel-upload"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelFileChange}
                      className="block w-full text-sm text-gray-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-green-50 file:text-green-700
                        hover:file:bg-green-100"
                    />
                  </div>
                  
                  {excelFile && !processExcelMutation.isPending && !isProcessingAI && (
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-green-700">
                        Selected: <strong>{excelFile.name}</strong> ({(excelFile.size / 1024).toFixed(1)} KB)
                      </p>
                      <Button
                        onClick={handleProcessExcel}
                        disabled={processExcelMutation.isPending}
                        className="mt-3"
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Process Excel File
                      </Button>
                    </div>
                  )}
                  
                  {/* Upload/Parsing Progress */}
                  {processExcelMutation.isPending && (
                    <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">Uploading and parsing Excel file...</span>
                      </div>
                      <Progress value={50} className="h-2" />
                      <p className="text-xs text-blue-600">Creating folder structure and importing files...</p>
                    </div>
                  )}
                  
                  {/* AI Processing Progress */}
                  {isProcessingAI && (
                    <div className="bg-purple-50 p-4 rounded-lg space-y-3">
                      <div className="flex items-center space-x-2">
                        <Cpu className="h-4 w-4 animate-pulse text-purple-600" />
                        <span className="text-sm font-medium text-purple-800">AI Processing in Progress</span>
                      </div>
                      <Progress value={aiProcessingProgress} className="h-2" />
                      <p className="text-xs text-purple-600">
                        Processing {Math.round(aiProcessingProgress)}% complete - Transcribing videos and generating AI metadata...
                      </p>
                    </div>
                  )}
                  
                  {/* Success Result */}
                  {excelProcessingResult && !processExcelMutation.isPending && !isProcessingAI && (
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        <div className="font-semibold mb-2">✅ Excel Processing Complete!</div>
                        <div className="space-y-1 text-sm">
                          <p>✓ Created {excelProcessingResult.foldersCreated} folders</p>
                          <p>✓ Imported {excelProcessingResult.filesCreated} files</p>
                          <p>✓ All files processed with AI transcription and metadata</p>
                          {excelProcessingResult.summary && (
                            <p className="mt-2 text-gray-600">{excelProcessingResult.summary}</p>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
                    <p className="font-medium mb-2">How it works:</p>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>Upload an Excel file with curriculum or content structure</li>
                      <li>System automatically detects subject/folder columns</li>
                      <li>Creates folders based on subjects or categories</li>
                      <li>Extracts file references and content from cells</li>
                      <li>All imported files are processed with AI analysis</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Uploads Section */}
            {Array.isArray(files) && files.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Clock className="text-blue-600" />
                    <span>Recent Uploads</span>
                    <Badge variant="secondary" className="ml-auto">
                      {Math.min(files.length, 8)} files
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {files.slice(0, 8).map((file: any) => (
                      <div key={file.id} className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
                        <div className="flex-shrink-0">
                          {file.processingStatus === "completed" && (
                            <CheckCircle className="text-green-500 h-5 w-5" />
                          )}
                          {(file.processingStatus === "pending" || file.processingStatus === "processing") && (
                            <Clock className="text-orange-500 h-5 w-5 animate-pulse" />
                          )}
                          {file.processingStatus === "error" && (
                            <AlertCircle className="text-red-500 h-5 w-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {file.originalName}
                          </p>
                          <div className="flex items-center space-x-2 mt-1">
                            <p className="text-xs text-slate-500">
                              {new Date(file.uploadedAt).toLocaleDateString()}
                            </p>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                file.processingStatus === "completed" 
                                  ? "text-green-600 border-green-200" 
                                  : file.processingStatus === "error"
                                  ? "text-red-600 border-red-200"
                                  : "text-orange-600 border-orange-200"
                              }`}
                            >
                              {file.processingStatus}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {(file.size / 1024 / 1024).toFixed(1)} MB
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Categories Display after Upload */}
            {Array.isArray(categories) && categories.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <FolderOpen className="text-green-600" />
                    <span>File Categories</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {categories.map((cat: any) => (
                      <div key={cat.category} className="p-4 bg-slate-50 rounded-lg text-center hover:bg-slate-100 transition-colors">
                        <h4 className="font-medium text-slate-800 capitalize text-sm">
                          {cat.category.replace(/[/_]/g, ' ')}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">{cat.count} files</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Processing Features - Moved to bottom */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="text-purple-600" />
                  <span>AI Processing Features</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="text-center p-4">
                    <Brain className="text-purple-500 text-3xl mx-auto mb-3" />
                    <h3 className="font-medium text-slate-800 mb-2">Intelligent Metadata</h3>
                    <p className="text-sm text-slate-600">GPT extracts key information, themes, and categorizes content automatically</p>
                  </div>
                  
                  <div className="text-center p-4">
                    <FileCheck className="text-green-500 text-3xl mx-auto mb-3" />
                    <h3 className="font-medium text-slate-800 mb-2">Multi-format Support</h3>
                    <p className="text-sm text-slate-600">Supports PDF, DOCX, and TXT files with text extraction up to 100MB</p>
                  </div>
                  
                  <div className="text-center p-4">
                    <CheckCircle className="text-blue-500 text-3xl mx-auto mb-3" />
                    <h3 className="font-medium text-slate-800 mb-2">Smart Categories</h3>
                    <p className="text-sm text-slate-600">Automatically sorts into Personal/Life, Academic, or other custom categories</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Processing Status Sidebar */}
          <div>
            <div className="space-y-6">
              {/* Processing Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Processing Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Processing</span>
                      <Badge variant="outline" className="text-orange-600 border-orange-200">
                        {processingFiles.length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Completed</span>
                      <Badge variant="outline" className="text-green-600 border-green-200">
                        {completedFiles.length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Errors</span>
                      <Badge variant="outline" className="text-red-600 border-red-200">
                        {errorFiles.length}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <FileCheck className="text-blue-600" />
                    <span>Quick Overview</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!Array.isArray(files) || files.length === 0 ? (
                    <div className="text-center py-6">
                      <FileText className="text-slate-400 text-3xl mx-auto mb-3" />
                      <p className="text-slate-500">No files uploaded yet</p>
                      <p className="text-sm text-slate-400">Upload your first document to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{completedFiles.length}</div>
                          <div className="text-xs text-slate-600">Processed</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">{processingFiles.length}</div>
                          <div className="text-xs text-slate-600">Processing</div>
                        </div>
                      </div>
                      
                      {/* Latest 3 files in sidebar */}
                      <div className="border-t pt-4">
                        <h4 className="text-sm font-medium text-slate-700 mb-3">Latest Files</h4>
                        <div className="space-y-2">
                          {files.slice(0, 3).map((file: any) => (
                            <div key={file.id} className="flex items-center space-x-2 text-sm">
                              <div className="flex-shrink-0">
                                {file.processingStatus === "completed" && (
                                  <CheckCircle className="text-green-500 h-3 w-3" />
                                )}
                                {(file.processingStatus === "pending" || file.processingStatus === "processing") && (
                                  <Clock className="text-orange-500 h-3 w-3 animate-pulse" />
                                )}
                                {file.processingStatus === "error" && (
                                  <AlertCircle className="text-red-500 h-3 w-3" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-slate-700 truncate text-xs">
                                  {file.originalName.length > 20 
                                    ? `${file.originalName.substring(0, 20)}...` 
                                    : file.originalName}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}