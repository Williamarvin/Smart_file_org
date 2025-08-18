import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, FileText, PenTool, Home, Loader2, FolderOpen } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface File {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  processingStatus: string;
  category?: string;
}

interface Folder {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
}

interface LessonPrompt {
  type: string;
  title: string;
  prompt: string;
  icon: JSX.Element;
  description: string;
}

export default function GenerateLessons() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [generatedPrompts, setGeneratedPrompts] = useState<LessonPrompt[]>([]);
  const queryClient = useQueryClient();

  // Fetch files and folders
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["/api/files"],
  });

  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["/api/folders"],
  });

  // Generate lesson prompts mutation
  const generatePromptsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/generate-lesson-prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileIds: selectedFiles,
          folderIds: selectedFolders,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate lesson prompts');
      }
      
      return response.json();
    },
    onSuccess: (data: any) => {
      const prompts: LessonPrompt[] = [
        {
          type: "introduction",
          title: "Introduction Agent",
          prompt: data.prompts.introduction,
          icon: <BookOpen className="h-5 w-5" />,
          description: "Generate engaging lesson introductions"
        },
        {
          type: "warmup",
          title: "Warm-Up Agent", 
          prompt: data.prompts.warmup,
          icon: <Clock className="h-5 w-5" />,
          description: "Create warm-up activities and icebreakers"
        },
        {
          type: "content",
          title: "Content Agent",
          prompt: data.prompts.content,
          icon: <FileText className="h-5 w-5" />,
          description: "Develop main lesson content and materials"
        },
        {
          type: "practice",
          title: "Practice Agent",
          prompt: data.prompts.practice,
          icon: <PenTool className="h-5 w-5" />,
          description: "Design practice exercises and activities"
        },
        {
          type: "homework",
          title: "Homework Agent",
          prompt: data.prompts.homework,
          icon: <Home className="h-5 w-5" />,
          description: "Create homework assignments and assessments"
        }
      ];
      setGeneratedPrompts(prompts);
    },
  });

  const handleFileToggle = (fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleFolderToggle = (folderId: string) => {
    setSelectedFolders(prev => 
      prev.includes(folderId) 
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  const handleGeneratePrompts = () => {
    if (selectedFiles.length === 0 && selectedFolders.length === 0) {
      return;
    }
    generatePromptsMutation.mutate();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (filesLoading || foldersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Generate Lessons</h1>
        <p className="text-muted-foreground">
          Select files and folders to generate structured lesson prompts for different educational agents.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* File and Folder Selection */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Content Sources</CardTitle>
              <CardDescription>
                Choose files and folders to use as reference material for lesson generation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Folders */}
                {(folders as Folder[]).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Folders ({selectedFolders.length} selected)
                    </h4>
                    <ScrollArea className="h-32 border rounded-md p-2">
                      <div className="space-y-2">
                        {(folders as Folder[]).map((folder: Folder) => (
                          <div key={folder.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`folder-${folder.id}`}
                              checked={selectedFolders.includes(folder.id)}
                              onCheckedChange={() => handleFolderToggle(folder.id)}
                            />
                            <label
                              htmlFor={`folder-${folder.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {folder.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                <Separator />

                {/* Files */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Files ({selectedFiles.length} selected)
                  </h4>
                  <ScrollArea className="h-64 border rounded-md p-2">
                    <div className="space-y-2">
                      {(files as File[]).map((file: File) => (
                        <div key={file.id} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted">
                          <Checkbox
                            id={`file-${file.id}`}
                            checked={selectedFiles.includes(file.id)}
                            onCheckedChange={() => handleFileToggle(file.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <label
                              htmlFor={`file-${file.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer block truncate"
                            >
                              {file.originalName}
                            </label>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {formatFileSize(file.size)}
                              </Badge>
                              {file.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {file.category}
                                </Badge>
                              )}
                              <Badge 
                                variant={file.processingStatus === "completed" ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {file.processingStatus}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <Button
                  onClick={handleGeneratePrompts}
                  disabled={
                    (selectedFiles.length === 0 && selectedFolders.length === 0) ||
                    generatePromptsMutation.isPending
                  }
                  className="w-full"
                >
                  {generatePromptsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Prompts...
                    </>
                  ) : (
                    "Generate Lesson Prompts"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Generated Prompts */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generated Lesson Prompts</CardTitle>
              <CardDescription>
                AI-generated prompts for different lesson agents
              </CardDescription>
            </CardHeader>
            <CardContent>
              {generatedPrompts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select files and folders, then click "Generate Lesson Prompts" to create structured prompts for lesson agents.</p>
                </div>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-4">
                    {generatedPrompts.map((prompt, index) => (
                      <Card key={prompt.type} className="border-l-4 border-l-primary">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              {prompt.icon}
                            </div>
                            <div>
                              <CardTitle className="text-lg">{prompt.title}</CardTitle>
                              <CardDescription className="text-sm">
                                {prompt.description}
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="bg-muted/50 rounded-lg p-4">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                              {prompt.prompt}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}