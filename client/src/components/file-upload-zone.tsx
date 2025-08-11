import { useState, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Plus, Upload, FileText } from "lucide-react";

interface FileUploadZoneProps {
  onUploadSuccess?: () => void;
}

export default function FileUploadZone({ onUploadSuccess }: FileUploadZoneProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        // Validate file type
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
        if (!allowedTypes.includes(file.type)) {
          toast({
            title: "Invalid File Type",
            description: `File "${file.name}" is not supported. Please upload PDF, DOCX, or TXT files only.`,
            variant: "destructive",
          });
          continue;
        }

        // Validate file size (100MB)
        if (file.size > 104857600) {
          toast({
            title: "File Too Large",
            description: `File "${file.name}" exceeds 100MB limit.`,
            variant: "destructive",
          });
          continue;
        }

        // Get upload URL
        const uploadResponse = await apiRequest("/api/objects/upload", {
          method: "POST",
        });

        // Upload file directly
        const uploadResult = await fetch(uploadResponse.uploadURL, {
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
          uploadURL: uploadResponse.uploadURL,
        };

        await apiRequest("/api/files", {
          method: "POST",
          body: fileData,
        });
      }

      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/categories"] });

      toast({
        title: "Upload Successful",
        description: `${files.length} file(s) uploaded and queued for AI processing.`,
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
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="text-center space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt"
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
        <p>Supports PDF, DOCX, and TXT files up to 100MB</p>
        <p>Click to select multiple files from your computer</p>
      </div>

      {isUploading && (
        <div className="mt-4">
          <div className="w-full bg-slate-200 rounded-full h-2 max-w-xs mx-auto">
            <div className="bg-blue-600 h-2 rounded-full animate-pulse w-full"></div>
          </div>
          <p className="text-sm text-slate-600 mt-2">Processing upload...</p>
        </div>
      )}
    </div>
  );
}