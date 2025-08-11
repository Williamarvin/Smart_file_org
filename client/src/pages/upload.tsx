import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FileUploadZone from "@/components/file-upload-zone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload as UploadIcon, CheckCircle, AlertCircle, Clock, Zap, Brain, FileCheck, FolderOpen } from "lucide-react";

export function Upload() {
  const queryClient = useQueryClient();

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

              {/* Recent Files */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Uploads</CardTitle>
                </CardHeader>
                <CardContent>
                  {!Array.isArray(files) || files.length === 0 ? (
                    <div className="text-center py-6">
                      <FileText className="text-slate-400 text-3xl mx-auto mb-3" />
                      <p className="text-slate-500">No files uploaded yet</p>
                      <p className="text-sm text-slate-400">Upload your first document to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {files.slice(0, 5).map((file: any) => (
                        <div key={file.id} className="flex items-center space-x-3 p-2 bg-slate-50 rounded-lg">
                          <div className="flex-shrink-0">
                            {file.processingStatus === "completed" && (
                              <CheckCircle className="text-green-500 h-4 w-4" />
                            )}
                            {(file.processingStatus === "pending" || file.processingStatus === "processing") && (
                              <Clock className="text-orange-500 h-4 w-4 animate-spin" />
                            )}
                            {file.processingStatus === "error" && (
                              <AlertCircle className="text-red-500 h-4 w-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {file.originalName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(file.uploadedAt).toLocaleString()}
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
      </div>
    </div>
  );
}