import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BookOpen, Clock, FileText, PenTool, Home, Loader2, FolderOpen, Play, Pause, CheckCircle, Circle, MessageSquare, Volume2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
  generatedContent?: string;
}

export default function GenerateLessons() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [additionalContext, setAdditionalContext] = useState<string>("");
  const [generatedPrompts, setGeneratedPrompts] = useState<LessonPrompt[]>([]);
  const [executingPrompts, setExecutingPrompts] = useState<string[]>([]);
  const [autoExecutionMode, setAutoExecutionMode] = useState<'manual' | 'timed'>('manual');
  const [autoExecutionDelay, setAutoExecutionDelay] = useState<number>(2);
  const [currentExecutingIndex, setCurrentExecutingIndex] = useState<number>(-1);
  const [autoExecutionActive, setAutoExecutionActive] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(0);
  
  // Teacher Agent states
  const [teacherMode, setTeacherMode] = useState<boolean>(false);
  const [courseTitle, setCourseTitle] = useState<string>("");
  const [targetAudience, setTargetAudience] = useState<string>("");
  const [teacherPrompt, setTeacherPrompt] = useState<string>(""); // Display version
  const [teacherPromptWithContent, setTeacherPromptWithContent] = useState<string>(""); // Execution version
  const [teacherContent, setTeacherContent] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<Array<{role: string, content: string}>>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  
  const queryClient = useQueryClient();
  
  // Auto-speak teacher responses
  const speakTeacherResponse = async (text: string) => {
    try {
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      
      const response = await apiRequest("POST", "/api/teacher-speak", {
        text,
        voice: "alloy" // Can be changed to echo, fable, onyx, nova, or shimmer
      });
      
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      
      setCurrentAudio(audio);
      
      audio.onended = () => {
        setCurrentAudio(null);
      };
      
      await audio.play();
    } catch (error) {
      console.error("Error playing speech:", error);
      setCurrentAudio(null);
    }
  };

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
          additionalContext: additionalContext.trim() || undefined,
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

  // Execute individual prompt against database
  const executePrompt = async (promptType: string, prompt: string) => {
    try {
      setExecutingPrompts(prev => [...prev, promptType]);
      
      const response = await fetch("/api/execute-lesson-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          promptType,
          fileIds: selectedFiles,
          folderIds: selectedFolders,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to execute prompt');
      }
      
      const data = await response.json();
      
      // Update the specific prompt with generated content
      setGeneratedPrompts(prev => 
        prev.map(p => 
          p.type === promptType 
            ? { ...p, generatedContent: data.content }
            : p
        )
      );
    } catch (error) {
      console.error('Error executing prompt:', error);
    } finally {
      setExecutingPrompts(prev => prev.filter(type => type !== promptType));
    }
  };

  // Generate teacher prompt mutation
  const generateTeacherPromptMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/generate-teacher-prompt", {
        fileIds: selectedFiles,
        folderIds: selectedFolders,
        additionalContext,
        courseTitle,
        targetAudience
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      setTeacherPrompt(data.teacherPrompt); // Display version
      setTeacherPromptWithContent(data.teacherPromptWithContent); // Execution version
    },
  });

  // Execute teacher prompt mutation
  const executeTeacherPromptMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/execute-teacher-prompt", {
        teacherPrompt: teacherPromptWithContent // Use the version with full content
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      setTeacherContent(data.content);
    },
  });

  // Chat with teacher agent mutation
  const chatTeacherMutation = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const response = await apiRequest("POST", "/api/chat-teacher-agent", {
        message,
        chatHistory: chatMessages,
        teacherContext: teacherContent
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      setChatMessages(prev => [
        ...prev,
        { role: "user", content: chatInput },
        { role: "assistant", content: data.response }
      ]);
      setChatInput("");
      
      // Automatically speak the teacher's response
      await speakTeacherResponse(data.response);
    },
  });

  // Execute all prompts with manual control
  const executeAllPromptsManual = () => {
    const firstUnexecuted = generatedPrompts.findIndex(p => !p.generatedContent);
    if (firstUnexecuted !== -1) {
      setCurrentExecutingIndex(firstUnexecuted);
      setAutoExecutionActive(true);
      executePrompt(generatedPrompts[firstUnexecuted].type, generatedPrompts[firstUnexecuted].prompt);
    }
  };

  // Continue to next prompt (manual mode)
  const continueToNextPrompt = () => {
    const nextUnexecuted = generatedPrompts.findIndex((p, index) => 
      index > currentExecutingIndex && !p.generatedContent
    );
    
    if (nextUnexecuted !== -1) {
      setCurrentExecutingIndex(nextUnexecuted);
      executePrompt(generatedPrompts[nextUnexecuted].type, generatedPrompts[nextUnexecuted].prompt);
    } else {
      setAutoExecutionActive(false);
      setCurrentExecutingIndex(-1);
    }
  };

  // Execute all prompts with timed delays
  const executeAllPromptsTimed = async () => {
    setAutoExecutionActive(true);
    
    const unexecutedPrompts = generatedPrompts
      .map((prompt, index) => ({ prompt, index }))
      .filter(({ prompt }) => !prompt.generatedContent);

    for (let i = 0; i < unexecutedPrompts.length; i++) {
      const { prompt, index } = unexecutedPrompts[i];
      setCurrentExecutingIndex(index);
      await executePrompt(prompt.type, prompt.prompt);
      
      // If not the last prompt, start countdown
      if (i < unexecutedPrompts.length - 1) {
        setCountdown(autoExecutionDelay * 60); // Set countdown in seconds
        
        await new Promise((resolve) => {
          const interval = setInterval(() => {
            setCountdown(prev => {
              if (prev <= 1) {
                clearInterval(interval);
                resolve(undefined);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        });
      }
    }
    
    setAutoExecutionActive(false);
    setCurrentExecutingIndex(-1);
    setCountdown(0);
  };

  // Skip to next prompt in timed mode
  const skipToNext = () => {
    setCountdown(0);
  };

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
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Generate Lessons</h1>
          <p className="text-muted-foreground">
            Select files and folders to generate structured lesson prompts for different educational agents.
          </p>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex items-center space-x-4 p-4 border rounded-lg bg-muted/20">
          <span className="text-sm font-medium">Mode:</span>
          <RadioGroup
            value={teacherMode ? 'teacher' : 'agents'}
            onValueChange={(value) => setTeacherMode(value === 'teacher')}
            className="flex space-x-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="agents" id="agents" />
              <Label htmlFor="agents" className="text-sm">Individual Agents</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="teacher" id="teacher" />
              <Label htmlFor="teacher" className="text-sm">Master Teacher Agent</Label>
            </div>
          </RadioGroup>
        </div>
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

                {/* Additional Context Section */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Additional Context (Optional)
                  </h4>
                  <div className="space-y-2">
                    <Label htmlFor="additional-context" className="text-sm text-muted-foreground">
                      Provide any additional information, requirements, or context for the lesson generation
                    </Label>
                    <Textarea
                      id="additional-context"
                      placeholder="Example: Focus on beginner level, include practical examples, emphasize hands-on activities, target audience is high school students, etc."
                      value={additionalContext}
                      onChange={(e) => setAdditionalContext(e.target.value)}
                      rows={4}
                      className="resize-none"
                    />
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>This context will be included in all generated lesson prompts</span>
                      <span>{additionalContext.length} characters</span>
                    </div>
                  </div>
                </div>

                {/* Teacher Agent Configuration */}
                {teacherMode && (
                  <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
                    <h4 className="font-medium text-blue-900">Teacher Agent Configuration</h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="course-title" className="text-sm">Course Title</Label>
                        <Input
                          id="course-title"
                          placeholder="Enter course title (e.g., Introduction to Machine Learning)"
                          value={courseTitle}
                          onChange={(e) => setCourseTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="target-audience" className="text-sm">Target Audience</Label>
                        <Input
                          id="target-audience"
                          placeholder="Enter target audience (e.g., High school students, College freshmen)"
                          value={targetAudience}
                          onChange={(e) => setTargetAudience(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <Button
                    onClick={teacherMode ? () => generateTeacherPromptMutation.mutate() : handleGeneratePrompts}
                    disabled={
                      (selectedFiles.length === 0 && selectedFolders.length === 0 && !additionalContext.trim()) ||
                      (teacherMode ? generateTeacherPromptMutation.isPending : generatePromptsMutation.isPending)
                    }
                    className="w-full"
                  >
                    {(teacherMode ? generateTeacherPromptMutation.isPending : generatePromptsMutation.isPending) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {teacherMode ? 'Generating Teacher Prompt...' : 'Generating Prompts...'}
                      </>
                    ) : (
                      teacherMode ? "Generate Teacher Prompt" : "Generate Lesson Prompts"
                    )}
                  </Button>
                  
                  {generatedPrompts.length > 0 && (
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                      <h4 className="font-medium text-sm">Execute All Prompts</h4>
                      
                      {/* Progress Indicator */}
                      {autoExecutionActive && (
                        <div className="space-y-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-blue-800">
                              Execution Progress
                            </span>
                            <span className="text-xs text-blue-600">
                              {generatedPrompts.filter(p => p.generatedContent).length}/{generatedPrompts.length} completed
                            </span>
                          </div>
                          
                          <div className="space-y-2">
                            {generatedPrompts.map((prompt, index) => {
                              const isCompleted = prompt.generatedContent;
                              const isCurrent = index === currentExecutingIndex;
                              const isExecuting = isCurrent && executingPrompts.includes(prompt.type);
                              
                              return (
                                <div key={prompt.type} className={`flex items-center gap-3 p-2 rounded ${
                                  isCurrent ? 'bg-blue-100 border border-blue-300' : 
                                  isCompleted ? 'bg-green-50' : 'bg-white'
                                }`}>
                                  <div className="flex-shrink-0">
                                    {isExecuting ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                    ) : isCompleted ? (
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <Circle className="h-4 w-4 text-gray-400" />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-1">
                                    {prompt.icon}
                                    <span className={`text-sm font-medium ${
                                      isCurrent ? 'text-blue-800' : 
                                      isCompleted ? 'text-green-800' : 'text-gray-600'
                                    }`}>
                                      {prompt.title}
                                    </span>
                                  </div>
                                  <div className="text-xs">
                                    {isExecuting ? (
                                      <span className="text-blue-600 font-medium">Executing...</span>
                                    ) : isCompleted ? (
                                      <span className="text-green-600">✓ Done</span>
                                    ) : isCurrent ? (
                                      <span className="text-blue-600">← Current</span>
                                    ) : (
                                      <span className="text-gray-400">Pending</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          
                          {countdown > 0 && autoExecutionMode === 'timed' && (
                            <div className="text-center p-2 bg-white rounded border">
                              <span className="text-sm text-gray-600">
                                Next prompt starts in: <span className="font-mono font-bold text-blue-600">
                                  {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                                </span>
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <RadioGroup 
                        value={autoExecutionMode} 
                        onValueChange={(value: 'manual' | 'timed') => setAutoExecutionMode(value)}
                        className="space-y-3"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="manual" id="manual" />
                          <Label htmlFor="manual" className="text-sm">
                            Manual Control - Continue after reviewing each result
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="timed" id="timed" />
                          <Label htmlFor="timed" className="text-sm">
                            Timed Auto-execution - Continue automatically after delay
                          </Label>
                        </div>
                      </RadioGroup>

                      {autoExecutionMode === 'timed' && (
                        <div className="space-y-2">
                          <Label htmlFor="delay" className="text-sm">
                            Delay between prompts (minutes):
                          </Label>
                          <Input
                            id="delay"
                            type="number"
                            min="0.5"
                            max="10"
                            step="0.5"
                            value={autoExecutionDelay}
                            onChange={(e) => setAutoExecutionDelay(parseFloat(e.target.value) || 2)}
                            className="w-full"
                            placeholder="2"
                          />
                        </div>
                      )}

                      <Button
                        onClick={autoExecutionMode === 'manual' ? executeAllPromptsManual : executeAllPromptsTimed}
                        disabled={autoExecutionActive || executingPrompts.length > 0}
                        className="w-full"
                      >
                        {autoExecutionActive ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {autoExecutionMode === 'manual' ? 'Executing...' : `Auto-Executing... ${countdown > 0 ? `(${Math.floor(countdown / 60)}:${(countdown % 60).toString().padStart(2, '0')})` : ''}`}
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            {autoExecutionMode === 'manual' ? 'Start Manual Execution' : 'Start Timed Execution'}
                          </>
                        )}
                      </Button>

                      {countdown > 0 && autoExecutionMode === 'timed' && (
                        <Button
                          variant="outline"
                          onClick={skipToNext}
                          className="w-full"
                        >
                          Skip to Next Prompt ({Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')})
                        </Button>
                      )}

                      {autoExecutionActive && autoExecutionMode === 'manual' && currentExecutingIndex >= 0 && !executingPrompts.includes(generatedPrompts[currentExecutingIndex]?.type) && generatedPrompts.some((p, i) => i > currentExecutingIndex && !p.generatedContent) && (
                        <Button
                          onClick={continueToNextPrompt}
                          className="w-full"
                          variant="default"
                        >
                          Continue to Next Prompt ({generatedPrompts.find((p, i) => i > currentExecutingIndex && !p.generatedContent)?.title})
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Generated Prompts / Teacher Agent Content */}
        <div className="space-y-4">
          {!teacherMode ? (
            <Card>
              <CardHeader>
                <CardTitle>Generated Lesson Prompts</CardTitle>
                <CardDescription>
                  AI-generated prompts for different lesson agents. Click "Execute Prompt" to generate actual lesson content.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {generatedPrompts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select files and folders, then click "Generate Lesson Prompts" to create structured prompts for lesson agents.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
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
                            <div className="space-y-4">
                              <div className="bg-muted/50 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h5 className="font-medium text-sm">Agent Prompt:</h5>
                                  <Button
                                    size="sm"
                                    onClick={() => executePrompt(prompt.type, prompt.prompt)}
                                    disabled={executingPrompts.includes(prompt.type)}
                                    className="h-8"
                                  >
                                    {executingPrompts.includes(prompt.type) ? (
                                      <>
                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                        Generating...
                                      </>
                                    ) : (
                                      "Execute Prompt"
                                    )}
                                  </Button>
                                </div>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                                  {prompt.prompt}
                                </p>
                              </div>
                              
                              {prompt.generatedContent && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <h5 className="font-medium text-sm text-green-800">Generated Content:</h5>
                                  </div>
                                  <div className="prose prose-sm max-w-none">
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-green-700">
                                      {prompt.generatedContent}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Teacher Agent Interface */
            <div className="space-y-4">
              {/* Initial state - no prompt generated yet */}
              {!teacherPrompt && !teacherContent && (
                <Card>
                  <CardHeader>
                    <CardTitle>Master Teacher Agent</CardTitle>
                    <CardDescription>
                      Select files and folders, then generate a consolidated teacher prompt to create a comprehensive course.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="mb-2">No teacher prompt generated yet.</p>
                      <p className="text-sm">
                        1. Select your content sources (files/folders) on the left<br/>
                        2. Enter course title and target audience<br/>
                        3. Click "Generate Teacher Prompt" to create the consolidated prompt
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Teacher Prompt Preview */}
              {teacherPrompt && !teacherContent && (
                <Card>
                  <CardHeader>
                    <CardTitle>Teacher Prompt</CardTitle>
                    <CardDescription>
                      This is the complete prompt that will be sent to the teacher agent to generate your course content.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <ScrollArea className="h-64">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap text-blue-800">
                            {teacherPrompt}
                          </p>
                        </ScrollArea>
                      </div>
                      <Button
                        onClick={() => executeTeacherPromptMutation.mutate()}
                        disabled={executeTeacherPromptMutation.isPending}
                        className="w-full"
                      >
                        {executeTeacherPromptMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending to Teacher Agent...
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Send to Teacher Agent
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Generated Teacher Content */}
              {teacherContent && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Generated Course Content</CardTitle>
                      <CardDescription>
                        Complete course structure with 5 sections created by the master teacher agent.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <ScrollArea className="h-96">
                          <div className="prose prose-sm max-w-none">
                            <div className="whitespace-pre-wrap text-green-800 text-sm leading-relaxed">
                              {teacherContent}
                            </div>
                          </div>
                        </ScrollArea>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Chat Interface - Only available after content is generated */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        Chat with Teacher
                        {currentAudio && (
                          <Volume2 className="h-4 w-4 text-blue-500 animate-pulse" />
                        )}
                      </CardTitle>
                      <CardDescription>
                        Now you can chat with the teacher agent to refine or modify the generated course content. Teacher responses are automatically read aloud.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Chat Messages */}
                        <ScrollArea className="h-96 border rounded-lg p-4">
                          <div className="space-y-3">
                            {chatMessages.length > 0 ? (
                              chatMessages.map((msg, index) => (
                                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[80%] p-3 rounded-lg ${
                                    msg.role === 'user' 
                                      ? 'bg-blue-500 text-white' 
                                      : 'bg-muted text-foreground'
                                  }`}>
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                      {msg.content}
                                    </p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-center text-muted-foreground text-sm">
                                Start a conversation with the teacher agent to refine your course content
                              </div>
                            )}
                          </div>
                        </ScrollArea>

                        {/* Chat Input */}
                        <div className="flex gap-2">
                          <Textarea
                            placeholder="Ask about modifications, request changes, or get teaching advice..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            rows={3}
                            className="resize-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (chatInput.trim()) {
                                  chatTeacherMutation.mutate({ message: chatInput.trim() });
                                }
                              }
                            }}
                          />
                          <Button
                            onClick={() => {
                              if (chatInput.trim()) {
                                chatTeacherMutation.mutate({ message: chatInput.trim() });
                              }
                            }}
                            disabled={!chatInput.trim() || chatTeacherMutation.isPending}
                            size="sm"
                            className="shrink-0"
                          >
                            {chatTeacherMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Send"
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}