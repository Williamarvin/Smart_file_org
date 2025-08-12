import { useState, useRef, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Plus, Upload, FileText, Video, Brain, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface FileUploadZoneProps {
  onUploadSuccess?: () => void;
}

export default function FileUploadZone({ onUploadSuccess }: FileUploadZoneProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, processed: 0, current: "" });
  const [showAiProcessing, setShowAiProcessing] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Query to track AI processing stats
  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: showAiProcessing ? 2000 : false, // Poll every 2 seconds when showing AI progress
  });

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const fileArray = Array.from(files);
    setUploadProgress({ total: fileArray.length, processed: 0, current: "" });

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setUploadProgress({ total: fileArray.length, processed: i, current: file.name });
        // Validate file type
        const allowedTypes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          // Video formats
          'video/mp4',
          'video/avi',
          'video/mov',
          'video/wmv',
          'video/flv',
          'video/webm',
          'video/mkv'
        ];
        if (!allowedTypes.includes(file.type)) {
          toast({
            title: "Invalid File Type",
            description: `File "${file.name}" is not supported. Please upload PDF, DOCX, TXT, or video files (MP4, AVI, MOV, WMV, FLV, WebM, MKV).`,
            variant: "destructive",
          });
          continue;
        }

        // Validate file size (100MB for documents, 500MB for videos)
        const maxSize = file.type.startsWith('video/') ? 524288000 : 104857600; // 500MB for videos, 100MB for documents
        const maxSizeLabel = file.type.startsWith('video/') ? '500MB' : '100MB';
        if (file.size > maxSize) {
          toast({
            title: "File Too Large",
            description: `File "${file.name}" exceeds ${maxSizeLabel} limit.`,
            variant: "destructive",
          });
          continue;
        }

        // Get upload URL
        const uploadResponse = await apiRequest("POST", "/api/files/upload-url", {});
        const uploadData = await uploadResponse.json();

        // Upload file directly
        const uploadResult = await fetch(uploadData.uploadURL, {
          method: "PUT",
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });

        if (!uploadResult.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        // Create file record
        const fileData = {
          filename: file.name,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          uploadURL: uploadData.uploadURL,
        };

        await apiRequest("POST", "/api/files", fileData);
        setUploadProgress({ total: fileArray.length, processed: i + 1, current: "" });
      }

      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/categories"] });

      // Show AI processing progress
      setShowAiProcessing(true);

      toast({
        title: "Upload Successful",
        description: `${fileArray.length} file(s) uploaded and queued for AI processing.`,
      });

      onUploadSuccess?.();
    } catch (error) {
      console.error("Error uploading files:", error);
      toast({
        title: "Upload Error", 
        description: "Failed to upload files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress({ total: 0, processed: 0, current: "" });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Auto-hide AI processing when all files are processed
  useEffect(() => {
    if (stats && showAiProcessing && stats.processingFiles === 0) {
      const timer = setTimeout(() => {
        setShowAiProcessing(false);
      }, 3000); // Hide after 3 seconds when processing is complete
      return () => clearTimeout(timer);
    }
  }, [stats, showAiProcessing]);

  return (
    <div className="text-center space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.mp4,.avi,.mov,.wmv,.flv,.webm,.mkv"
        onChange={handleFileChange}
        className="hidden"
      />
      
      <Button
        onClick={handleFileSelect}
        disabled={isUploading}
        className="px-8 py-6 text-lg font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400"
      >
        <Plus className="mr-2 h-5 w-5" />
        {isUploading ? "Uploading..." : "Add Files"}
      </Button>

      <div className="text-sm text-slate-500">
        <p>Supports PDF, DOCX, TXT files (up to 100MB) and video files (up to 500MB)</p>
        <p>Video files will be processed using AI transcription for searchable content</p>
        <p>Click to select multiple files from your computer</p>
      </div>

      {isUploading && (
        <div className="mt-6 p-4 bg-slate-50 rounded-lg border max-w-md mx-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="font-medium">Upload Progress</span>
              <span>{uploadProgress.processed}/{uploadProgress.total} files</span>
            </div>
            
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.processed / uploadProgress.total) * 100}%` }}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1 text-green-600">
                  <FileText className="h-3 w-3" />
                  <span>Processed: {uploadProgress.processed}</span>
                </div>
                <div className="flex items-center gap-1 text-blue-600">
                  <Upload className="h-3 w-3" />
                  <span>Processing: {uploadProgress.total - uploadProgress.processed}</span>
                </div>
              </div>
              
              {uploadProgress.current && (
                <p className="text-xs text-slate-500 truncate">
                  Currently uploading: {uploadProgress.current}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showAiProcessing && stats && (
        <div className="mt-6 p-4 bg-purple-50 rounded-lg border max-w-md mx-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="font-medium flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-600" />
                AI Processing
              </span>
              <span>{stats.processedFiles}/{stats.totalFiles} files</span>
            </div>
            
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(stats.processedFiles / stats.totalFiles) * 100}%` }}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-3 w-3" />
                  <span>Analyzed: {stats.processedFiles}</span>
                </div>
                <div className="flex items-center gap-1 text-purple-600">
                  <Brain className="h-3 w-3" />
                  <span>Processing: {stats.processingFiles}</span>
                </div>
              </div>
              
              {stats.processingFiles === 0 && stats.processedFiles > 0 && (
                <p className="text-xs text-green-600 font-medium">
                  🎉 All files processed! Ready for search.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}