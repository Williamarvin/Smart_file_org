import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ObjectUploader } from "./ObjectUploader";
import { CloudUploadIcon, Plus, Check, Bot } from "lucide-react";
import type { UploadResult } from "@uppy/core";

interface FileUploadZoneProps {
  onUploadSuccess: () => void;
}

export default function FileUploadZone({ onUploadSuccess }: FileUploadZoneProps) {
  const [uploadProgress, setUploadProgress] = useState<{
    fileName: string;
    percentage: number;
    status: string;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get upload URL mutation
  const getUploadUrlMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/files/upload-url");
      return response.json();
    },
  });

  // Create file record mutation
  const createFileMutation = useMutation({
    mutationFn: async (fileData: {
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      uploadURL: string;
    }) => {
      const response = await apiRequest("POST", "/api/files", fileData);
      return response.json();
    },
    onSuccess: () => {
      onUploadSuccess();
      setUploadProgress(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to process uploaded file.",
        variant: "destructive",
      });
      setUploadProgress(null);
    },
  });

  const handleGetUploadParameters = async () => {
    try {
      const { uploadURL } = await getUploadUrlMutation.mutateAsync();
      return {
        method: "PUT" as const,
        url: uploadURL,
      };
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get upload URL.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleUploadComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const file = result.successful[0];
      
      setUploadProgress({
        fileName: file.name || "Unknown file",
        percentage: 100,
        status: "Processing with GPT...",
      });

      try {
        await createFileMutation.mutateAsync({
          filename: file.name || "unknown",
          originalName: file.name || "unknown",
          mimeType: file.type || "application/octet-stream",
          size: file.size || 0,
          uploadURL: (file.uploadURL as string) || "",
        });
      } catch (error) {
        console.error("Error creating file record:", error);
      }
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
          <CloudUploadIcon className="text-blue-500 mr-2" />
          Upload Files
        </h2>
        
        {/* Upload Drop Zone */}
        {!uploadProgress && (
          <ObjectUploader
            maxNumberOfFiles={1}
            maxFileSize={104857600} // 100MB
            onGetUploadParameters={handleGetUploadParameters}
            onComplete={handleUploadComplete}
            buttonClassName="w-full"
          >
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer group w-full">
              <div className="space-y-4">
                <div className="text-4xl text-slate-400 group-hover:text-blue-500 transition-colors">
                  <CloudUploadIcon className="mx-auto" />
                </div>
                <div>
                  <p className="text-slate-600 font-medium">Drop files here or click to browse</p>
                  <p className="text-sm text-slate-500 mt-1">Supports PDF, DOCX, TXT files up to 100MB</p>
                </div>
                <div className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium">
                  <Plus className="mr-2 h-4 w-4" />
                  Select Files
                </div>
              </div>
            </div>
          </ObjectUploader>
        )}

        {/* Upload Progress */}
        {uploadProgress && (
          <div className="mt-4 space-y-3">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">{uploadProgress.fileName}</span>
                <span className="text-sm text-slate-500">{uploadProgress.percentage}%</span>
              </div>
              <Progress value={uploadProgress.percentage} className="mb-2" />
              <div className="flex items-center text-xs text-slate-600">
                <Bot className="mr-1 text-blue-500 h-4 w-4" />
                <span>{uploadProgress.status}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
