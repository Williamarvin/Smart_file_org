import { useState } from "react";
import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, FileText, Brain, Copy, Download, Wand2, Volume2, Play, Pause, Folder, FolderOpen } from "lucide-react";

const CUSTOM_PROMPTS = {
  summary: [
    "Create a comprehensive executive summary highlighting the key points, main findings, and actionable insights from these documents.",
    "Summarize the most important themes and topics covered in these documents with specific examples and details.",
    "Provide a detailed overview of the content, identifying the core concepts and their relationships across all documents.",
    "Generate a structured summary with main points, supporting details, and key takeaways for quick reference."
  ],
  report: [
    "Create a professional report analyzing the key findings, trends, and patterns identified across these documents.",
    "Generate a comprehensive research report with introduction, methodology, findings, and conclusions based on the document content.",
    "Produce a detailed analytical report examining the main themes, supporting evidence, and strategic implications.",
    "Create a formal business report with executive summary, detailed analysis, and actionable recommendations."
  ],
  insights: [
    "Extract the most valuable insights and hidden patterns that emerge from analyzing these documents together.",
    "Identify key trends, correlations, and surprising discoveries that aren't immediately obvious from individual documents.",
    "Uncover strategic insights and competitive advantages that can be derived from the information in these documents.",
    "Analyze the data to reveal actionable insights that could inform decision-making and future strategy."
  ],
  recommendations: [
    "Provide specific, actionable recommendations based on the analysis of these documents, including implementation steps.",
    "Generate strategic recommendations with clear priorities, timelines, and expected outcomes based on the document content.",
    "Create a comprehensive action plan with specific recommendations, resource requirements, and success metrics.",
    "Develop tactical recommendations addressing the key challenges and opportunities identified in these documents."
  ],
  comparison: [
    "Compare and contrast the main themes, methodologies, and conclusions across these documents, highlighting similarities and differences.",
    "Analyze the different perspectives and approaches presented in these documents, identifying areas of agreement and divergence.",
    "Create a comparative analysis examining how different documents address similar topics or problems.",
    "Generate a side-by-side comparison of key concepts, strategies, and outcomes presented across the selected documents."
  ],
  creative: [
    "Create an engaging narrative or story inspired by the themes and concepts found in these documents.",
    "Generate creative content that reimagines the information in these documents through a new lens or format.",
    "Develop innovative ideas and creative solutions based on the inspiration drawn from these document themes.",
    "Craft compelling content that creatively interprets and presents the key ideas from these documents."
  ]
};

export function Generate() {
  const [prompt, setPrompt] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [generatedContent, setGeneratedContent] = useState("");
  const [generationType, setGenerationType] = useState("summary");
  const [generateAudio, setGenerateAudio] = useState(false);
  const [generateVideo, setGenerateVideo] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [selectedVideoStyle, setSelectedVideoStyle] = useState("natural");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const { toast } = useToast();

  // Restore session data on component mount
  React.useEffect(() => {
    try {
      const savedVideo = sessionStorage.getItem('lastGeneratedVideo');
      const savedContent = sessionStorage.getItem('lastGeneratedVideoContent');
      
      if (savedVideo && savedContent) {
        // Recreate video blob URL
        const videoBlob = new Blob([
          Uint8Array.from(atob(savedVideo), c => c.charCodeAt(0))
        ], { type: 'video/mp4' });
        const url = URL.createObjectURL(videoBlob);
        setVideoUrl(url);
        setGeneratedContent(savedContent);
        
        toast({
          title: "Previous Session Restored",
          description: "Your last generated video has been restored.",
        });
      }
    } catch (e) {
      console.log('Could not restore previous session');
    }
  }, [toast]);

  // Fetch all available files (with high limit to get all files)
  const { data: files = [], isLoading: filesLoading } = useQuery<any[]>({
    queryKey: ["/api/files", "all"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/files?limit=5000");
      return res.json();
    },
  });

  // Fetch all folders
  const { data: folders = [], isLoading: foldersLoading } = useQuery<any[]>({
    queryKey: ["/api/folders/all"],
  });

  // Helper function to get all files in a folder recursively
  const getAllFilesInFolderRecursively = (folderId: string, allFolders: any[], allFiles: any[]): any[] => {
    let folderFiles: any[] = [];
    
    // Get files directly in this folder
    const directFiles = allFiles.filter((f: any) => f.folderId === folderId);
    folderFiles = [...directFiles];
    
    // Get all subfolders and their files recursively
    const subfolders = allFolders.filter((f: any) => f.parentId === folderId);
    for (const subfolder of subfolders) {
      const subfolderFiles = getAllFilesInFolderRecursively(subfolder.id, allFolders, allFiles);
      folderFiles = [...folderFiles, ...subfolderFiles];
    }
    
    return folderFiles;
  };

  // Content generation mutation
  const generateMutation = useMutation({
    mutationFn: async ({ prompt, fileIds, type, generateAudio, generateVideo, voice, videoStyle }: { 
      prompt: string; 
      fileIds: string[]; 
      type: string; 
      generateAudio?: boolean; 
      generateVideo?: boolean;
      voice?: string; 
      videoStyle?: string;
    }) => {
      // Start video progress tracking if generating video
      if (generateVideo) {
        setIsGeneratingVideo(true);
        setVideoProgress(0);
        
        // Simulate progress for better UX
        const progressInterval = setInterval(() => {
          setVideoProgress(prev => {
            if (prev < 90) return prev + Math.random() * 15;
            return prev;
          });
        }, 1000);
        
        // Clear interval after 30 seconds max
        setTimeout(() => clearInterval(progressInterval), 30000);
      }
      
      const response = await apiRequest("POST", "/api/generate-content", { 
        prompt, 
        fileIds, 
        type, 
        generateAudio, 
        generateVideo,
        voice,
        videoStyle
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      setGeneratedContent(data.content);
      setIsGeneratingVideo(false);
      setVideoProgress(100);
      
      // Handle audio if generated
      if (data.audio) {
        const audioBlob = new Blob([
          Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))
        ], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      } else {
        setAudioUrl(null);
      }
      
      // Handle video if generated
      if (data.video) {
        const videoBlob = new Blob([
          Uint8Array.from(atob(data.video), c => c.charCodeAt(0))
        ], { type: 'video/mp4' });
        const url = URL.createObjectURL(videoBlob);
        setVideoUrl(url);
        
        // Store video in sessionStorage for persistence across page navigation
        try {
          sessionStorage.setItem('lastGeneratedVideo', data.video);
          sessionStorage.setItem('lastGeneratedVideoContent', data.content);
        } catch (e) {
          console.log('Could not store video in sessionStorage (too large)');
        }
      } else {
        setVideoUrl(null);
      }
      
      const mediaType = data.video ? "video" : (data.audio ? "audio" : "text");
      toast({
        title: "Content Generated",
        description: `AI has generated ${data.video ? "an animated video with audio!" : (data.audio ? "content with audio narration!" : "content!")}`,
      });
    },
    onError: (error) => {
      console.error("Generation error:", error);
      setIsGeneratingVideo(false);
      setVideoProgress(0);
      toast({
        title: "Generation Failed",
        description: "Failed to generate content. Please try again.",
        variant: "destructive",
      });
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

  const handleGenerate = async () => {
    // Collect all file IDs (directly selected + files from selected folders)
    let allFileIds = [...selectedFiles];
    
    // Add files from selected folders recursively (only completed files)
    if (selectedFolders.length > 0) {
      let folderFiles: any[] = [];
      for (const folderId of selectedFolders) {
        const recursiveFiles = getAllFilesInFolderRecursively(folderId, folders as any[], files);
        const completedFiles = recursiveFiles.filter((f: any) => f.processingStatus === "completed");
        folderFiles = [...folderFiles, ...completedFiles];
      }
      const folderFileIds = folderFiles.map((f: any) => f.id);
      allFileIds = Array.from(new Set([...allFileIds, ...folderFileIds]));
    }

    if (allFileIds.length === 0) {
      // Provide more helpful error message
      const totalFiles = files.length;
      const completedCount = files.filter((f: any) => f.processingStatus === "completed").length;
      
      let errorMessage = "Please select at least one file or folder to generate content from.";
      if (selectedFolders.length > 0 && completedCount === 0) {
        errorMessage = `The selected folder(s) contain ${totalFiles} files, but none are fully processed yet. Please wait for files to complete processing or select different folders.`;
      } else if (selectedFolders.length > 0) {
        errorMessage = `No processed files found in the selected folder(s). Try selecting folders with processed content.`;
      }
      
      toast({
        title: "Selection Required",
        description: errorMessage,
        variant: "destructive",
      });
      return;
    }

    // Use provided prompt or a default based on generation type
    const finalPrompt = prompt.trim() || `Generate a ${generationType} based on the selected content`;
    
    generateMutation.mutate({
      prompt: finalPrompt,
      fileIds: allFileIds,
      type: generationType,
      generateAudio,
      generateVideo,
      voice: selectedVoice,
      videoStyle: selectedVideoStyle,
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent);
    toast({
      title: "Copied",
      description: "Content copied to clipboard.",
    });
  };

  const downloadContent = () => {
    // Create a new window for PDF generation
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Extract title from content or generate one based on generation type
    let documentTitle = "Generated Content";
    const firstLine = generatedContent.split('\n')[0];
    
    // Check if first line looks like a title (starts with ** or is short)
    if (firstLine.startsWith('**') && firstLine.endsWith('**')) {
      documentTitle = firstLine.replace(/\*\*/g, '').trim();
    } else if (firstLine.length < 100 && !firstLine.includes('.')) {
      documentTitle = firstLine;
    } else {
      // Generate title based on generation type
      const typeMap = {
        'summary': 'Document Summary and Analysis',
        'report': 'Detailed Report',
        'insights': 'Key Insights and Findings',
        'recommendations': 'Recommendations and Action Items',
        'comparison': 'Comparative Analysis',
        'creative': 'Creative Content'
      };
      documentTitle = (typeMap as any)[generationType] || 'Generated Content';
    }

    // Process content to convert markdown-style formatting to HTML
    const processedContent = generatedContent
      // Convert **text** to <strong>text</strong>
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Convert section headers (lines starting with **)
      .replace(/^\*\*(.*?)\*\*$/gm, '<h3>$1</h3>')
      // Convert line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // Create HTML content for PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${documentTitle}</title>
        <style>
          body {
            font-family: 'Times New Roman', serif;
            line-height: 1.7;
            max-width: 8.5in;
            margin: 0.8in auto;
            color: #2c3e50;
            background: white;
            font-size: 12pt;
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #34495e;
            padding-bottom: 25px;
            margin-bottom: 40px;
            page-break-after: avoid;
          }
          .title {
            font-size: 28pt;
            font-weight: bold;
            margin-bottom: 15px;
            color: #2c3e50;
            letter-spacing: 1px;
          }
          .subtitle {
            font-size: 14pt;
            color: #7f8c8d;
            font-style: italic;
          }
          .content {
            text-align: justify;
            text-indent: 0;
          }
          .content p {
            margin-bottom: 16px;
            line-height: 1.8;
          }
          .content h3 {
            font-size: 16pt;
            font-weight: bold;
            color: #2c3e50;
            margin: 30px 0 15px 0;
            border-left: 4px solid #3498db;
            padding-left: 15px;
            page-break-after: avoid;
          }
          .content strong {
            font-weight: bold;
            color: #2c3e50;
          }
          .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 10pt;
            color: #95a5a6;
            border-top: 1px solid #ecf0f1;
            padding-top: 20px;
            page-break-inside: avoid;
          }
          @media print {
            body { 
              margin: 0.5in; 
              font-size: 11pt;
            }
            .header { 
              page-break-after: avoid;
            }
            .content h3 {
              page-break-after: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${documentTitle}</div>
          <div class="subtitle">Generated on ${new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</div>
        </div>
        <div class="content">
          <p>${processedContent}</p>
        </div>
        <div class="footer">
          Generated by SmartFile Organizer AI Content Generation System
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Wait for content to load, then trigger print dialog
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      // Close the window after a brief delay
      setTimeout(() => printWindow.close(), 100);
    }, 500);

    toast({
      title: "PDF Ready",
      description: "Professional PDF opened in print dialog. Choose 'Save as PDF' to download.",
    });
  };

  const processedFiles = Array.isArray(files) ? files.filter((file: any) => file.processingStatus === "completed") : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2 flex items-center">
            <Sparkles className="mr-3 text-purple-600" />
            Content Generation
          </h1>
          <p className="text-slate-600">Generate new content using AI based on your existing files</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            {/* Generation Type */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Wand2 className="text-purple-600" />
                  <span>Generation Type</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={generationType} onValueChange={setGenerationType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select generation type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summary">Summary & Analysis</SelectItem>
                    <SelectItem value="report">Detailed Report</SelectItem>
                    <SelectItem value="insights">Key Insights</SelectItem>
                    <SelectItem value="recommendations">Recommendations</SelectItem>
                    <SelectItem value="comparison">Comparative Analysis</SelectItem>
                    <SelectItem value="creative">Creative Content</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Media Generation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Volume2 className="text-blue-600" />
                  <span>Media Generation</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="generate-audio"
                      checked={generateAudio}
                      onCheckedChange={(checked) => {
                        setGenerateAudio(checked);
                        if (checked) setGenerateVideo(false);
                      }}
                    />
                    <label htmlFor="generate-audio" className="text-sm font-medium">
                      Generate audio narration
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="generate-video"
                      checked={generateVideo}
                      onCheckedChange={(checked) => {
                        setGenerateVideo(checked);
                        if (checked) setGenerateAudio(false);
                      }}
                    />
                    <label htmlFor="generate-video" className="text-sm font-medium">
                      Generate video presentation
                    </label>
                  </div>
                  
                  {generateAudio && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">Voice Selection</label>
                      <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select voice" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alloy">Alloy (Neutral)</SelectItem>
                          <SelectItem value="echo">Echo (Male)</SelectItem>
                          <SelectItem value="fable">Fable (British Male)</SelectItem>
                          <SelectItem value="onyx">Onyx (Deep Male)</SelectItem>
                          <SelectItem value="nova">Nova (Female)</SelectItem>
                          <SelectItem value="shimmer">Shimmer (Soft Female)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {generateVideo && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">Video Style</label>
                      <Select value={selectedVideoStyle} onValueChange={setSelectedVideoStyle}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select video style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="natural">Natural</SelectItem>
                          <SelectItem value="animated">Animated</SelectItem>
                          <SelectItem value="presentation">Presentation</SelectItem>
                          <SelectItem value="documentary">Documentary</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-blue-600 mt-2">
                        🎥 Video generation via Hugging Face (free, may take 1-2 minutes)
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Folder Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Folder className="text-green-600" />
                  <span>Select Folders ({selectedFolders.length} selected)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {foldersLoading ? (
                  <div className="animate-pulse">
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-12 bg-slate-200 rounded"></div>
                      ))}
                    </div>
                  </div>
                ) : (folders as any[]).length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Folder className="mx-auto text-4xl mb-2 text-slate-400" />
                    <p>No folders available</p>
                    <p className="text-sm">Create folders to organize your files</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(folders as any[]).map((folder: any) => {
                      // Count all files recursively in the folder and subfolders (including all nested levels)
                      const allFolderFiles = getAllFilesInFolderRecursively(folder.id, folders as any[], files);
                      const processedFolderFiles = allFolderFiles.filter((f: any) => f.processingStatus === "completed");
                      const totalFileCount = allFolderFiles.length;
                      const processedCount = processedFolderFiles.length;
                      
                      return (
                        <div
                          key={folder.id}
                          onClick={() => handleFolderToggle(folder.id)}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedFolders.includes(folder.id)
                              ? "border-green-300 bg-green-50"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 flex-1 min-w-0">
                              {selectedFolders.includes(folder.id) ? (
                                <FolderOpen className="w-5 h-5 text-green-600 flex-shrink-0" />
                              ) : (
                                <Folder className="w-5 h-5 text-slate-500 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-800 truncate">{folder.name}</p>
                                <p className="text-xs text-slate-500">
                                  {processedCount} processed / {totalFileCount} total {totalFileCount === 1 ? 'file' : 'files'}
                                </p>
                              </div>
                            </div>
                            <div className={`w-4 h-4 border-2 rounded flex-shrink-0 ${
                              selectedFolders.includes(folder.id)
                                ? "bg-green-600 border-green-600"
                                : "border-slate-300"
                            }`}>
                              {selectedFolders.includes(folder.id) && (
                                <div className="w-full h-full flex items-center justify-center">
                                  <div className="w-2 h-2 bg-white rounded-full"></div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* File Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="text-blue-600" />
                  <span>Select Individual Files ({selectedFiles.length} selected)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filesLoading ? (
                  <div className="animate-pulse">
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-12 bg-slate-200 rounded"></div>
                      ))}
                    </div>
                  </div>
                ) : processedFiles.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <FileText className="mx-auto text-4xl mb-2 text-slate-400" />
                    <p>No processed files available</p>
                    <p className="text-sm">Upload and process files first</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {processedFiles.map((file: any) => (
                      <div
                        key={file.id}
                        onClick={() => handleFileToggle(file.id)}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedFiles.includes(file.id)
                            ? "border-purple-300 bg-purple-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 truncate">{file.filename}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              {file.metadata?.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {file.metadata.category}
                                </Badge>
                              )}
                              <span className="text-xs text-slate-500">
                                {((file.size || 0) / 1024).toFixed(1)} KB
                              </span>
                            </div>
                          </div>
                          <div className={`w-4 h-4 border-2 rounded ${
                            selectedFiles.includes(file.id)
                              ? "bg-purple-600 border-purple-600"
                              : "border-slate-300"
                          }`}>
                            {selectedFiles.includes(file.id) && (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Prompt Input */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="text-green-600" />
                  <span>Content Prompt (Optional)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="(Optional) Describe what you want to generate... Leave empty to use default generation based on the type selected above"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[120px]"
                />
                
                {/* Custom Prompt Suggestions */}
                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">Quick Start Prompts:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {CUSTOM_PROMPTS[generationType as keyof typeof CUSTOM_PROMPTS]?.map((promptText, index) => (
                      <button
                        key={index}
                        onClick={() => setPrompt(promptText)}
                        className="text-left p-3 text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors group"
                      >
                        <div className="flex items-start space-x-2">
                          <Wand2 className="flex-shrink-0 w-4 h-4 text-purple-500 mt-0.5 group-hover:text-purple-600" />
                          <span className="text-slate-700 group-hover:text-slate-800">{promptText}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="mt-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending || (selectedFiles.length === 0 && selectedFolders.length === 0)}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {generateMutation.isPending ? "Generating..." : "Generate Content"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Output Section */}
          <div>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="text-purple-600" />
                    <span>Generated Content</span>
                  </div>
                  {generatedContent && (
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyToClipboard}
                        title="Copy to clipboard"
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={downloadContent}
                        title="Download as PDF"
                        className="bg-purple-50 border-purple-200 hover:bg-purple-100"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        PDF
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {generateMutation.isPending ? (
                  <div className="space-y-4">
                    {isGeneratingVideo && (
                      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                          <span className="font-medium text-purple-900">Generating Enhanced Video</span>
                        </div>
                        <div className="w-full bg-purple-200 rounded-full h-3">
                          <div 
                            className="bg-purple-600 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(videoProgress, 100)}%` }}
                          ></div>
                        </div>
                        <p className="text-sm text-purple-700 mt-2">
                          Creating animated video with music and narration... {Math.round(videoProgress)}%
                        </p>
                      </div>
                    )}
                    <div className="animate-pulse">
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} className="h-4 bg-slate-200 rounded w-full"></div>
                        ))}
                      </div>
                    </div>
                    <p className="text-center text-slate-600">
                      AI is analyzing your files and generating {generateVideo ? "video " : ""}content...
                    </p>
                  </div>
                ) : generatedContent ? (
                  <div className="prose prose-slate max-w-none space-y-4">
                    {videoUrl && (
                      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 border border-purple-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-purple-100 rounded-full">
                              <Play className="text-purple-600 h-5 w-5" />
                            </div>
                            <div>
                              <span className="font-semibold text-purple-900">Enhanced AI Video</span>
                              <p className="text-sm text-purple-700">Generated with animations and musical background</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 text-sm text-purple-600">
                            <span>🎵 Audio</span>
                            <span>🎨 Animated</span>
                            <span>📱 HD Quality</span>
                          </div>
                        </div>
                        <video 
                          controls 
                          className="w-full rounded-lg shadow-lg border border-purple-200" 
                          src={videoUrl}
                          preload="metadata"
                          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1280 720'%3E%3Crect width='1280' height='720' fill='%23f8fafc'/%3E%3Ctext x='640' y='360' text-anchor='middle' font-family='Arial' font-size='48' fill='%236366f1'%3E🎬 AI Generated Video%3C/text%3E%3C/svg%3E"
                        >
                          Your browser does not support the video element.
                        </video>
                        <div className="mt-3 flex items-center justify-between text-sm text-purple-600">
                          <span>💡 Video persists during session - won't disappear when navigating</span>
                          <span>⏱️ Up to 60 seconds with rich animations</span>
                        </div>
                      </div>
                    )}
                    
                    {audioUrl && !videoUrl && (
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center space-x-3">
                          <Volume2 className="text-blue-600 h-5 w-5" />
                          <span className="font-medium text-blue-900">Audio Narration</span>
                        </div>
                        <audio controls className="w-full mt-3" src={audioUrl}>
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}
                    
                    <div className="bg-white rounded-lg p-6 border shadow-sm">
                      <div 
                        className="text-sm text-slate-800 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: generatedContent
                            .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
                            .replace(/^\*\*(.*?)\*\*$/gm, '<h3 class="text-lg font-bold text-slate-900 mt-6 mb-3 border-l-4 border-blue-500 pl-3">$1</h3>')
                            .replace(/\n\n/g, '</p><p class="mb-4">')
                            .replace(/\n/g, '<br>')
                            .replace(/^(.)/gm, '<p class="mb-4">$1')
                            .replace(/<p class="mb-4">(<h3|<\/p>)/g, '$1')
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <Sparkles className="mx-auto text-4xl mb-4 text-slate-400" />
                    <p className="mb-2">Generated content will appear here</p>
                    <p className="text-sm">Select files and enter a prompt to get started</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}