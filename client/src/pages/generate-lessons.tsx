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
import { BookOpen, Clock, FileText, PenTool, Home, Loader2, FolderOpen, Play, Pause, CheckCircle, Circle, MessageSquare, Volume2, Save, Share2, History, Edit, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface TeacherSection {
  id: string;
  title: string;
  content: string;
  actionType: 'ppt' | 'audio' | 'video' | 'flashcards' | 'quiz' | 'discussion';
  duration: number; // in minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  teachingStyle: 'visual' | 'storytelling' | 'hands-on' | 'discussion' | 'analytical';
}

export default function GenerateLessons() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [additionalContext, setAdditionalContext] = useState<string>("");
  const [generatedPrompts, setGeneratedPrompts] = useState<LessonPrompt[]>([]);
  const [executingPrompts, setExecutingPrompts] = useState<string[]>([]);
  
  // Teacher Agent states
  const [teacherMode, setTeacherMode] = useState<boolean>(false);
  const [courseTitle, setCourseTitle] = useState<string>("");
  const [targetAudience, setTargetAudience] = useState<string>("");
  const [teacherExpertiseSubject, setTeacherExpertiseSubject] = useState<string>("general");
  const [globalTeachingStyle, setGlobalTeachingStyle] = useState<string>("analytical");
  const [teacherPrompt, setTeacherPrompt] = useState<string>(""); // Display version
  const [teacherPromptWithContent, setTeacherPromptWithContent] = useState<string>(""); // Execution version
  const [teacherContent, setTeacherContent] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<Array<{role: string, content: string}>>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState<boolean>(false);
  const [savedSessions, setSavedSessions] = useState<any[]>([]);
  const [showSavedSessions, setShowSavedSessions] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  
  // Teacher sections for structured prompt
  const [teacherSections, setTeacherSections] = useState<TeacherSection[]>([
    { id: '1', title: 'Introduction', content: '', actionType: 'ppt', duration: 5, difficulty: 'beginner', teachingStyle: 'visual' },
    { id: '2', title: 'Warm-up Activities', content: '', actionType: 'flashcards', duration: 10, difficulty: 'beginner', teachingStyle: 'hands-on' },
    { id: '3', title: 'Main Content', content: '', actionType: 'ppt', duration: 20, difficulty: 'intermediate', teachingStyle: 'analytical' },
    { id: '4', title: 'Practice Activities', content: '', actionType: 'quiz', duration: 15, difficulty: 'intermediate', teachingStyle: 'hands-on' },
    { id: '5', title: 'Wrap-up & Homework', content: '', actionType: 'discussion', duration: 10, difficulty: 'intermediate', teachingStyle: 'discussion' }
  ]);
  
  const queryClient = useQueryClient();
  
  // Auto-speak teacher responses
  const speakTeacherResponse = async (text: string) => {
    try {
      console.log("=== SPEECH DEBUG START ===");
      console.log("Text to speak (first 100 chars):", text.substring(0, 100));
      
      // Stop any currently playing audio
      if (currentAudio) {
        console.log("Stopping previous audio");
        currentAudio.pause();
        currentAudio.currentTime = 0;
        setCurrentAudio(null);
      }
      
      setIsGeneratingSpeech(true);
      
      // Truncate text to avoid API timeout, but keep it reasonable
      const textToSpeak = text.substring(0, 800);
      console.log("Sending text length:", textToSpeak.length);
      
      const response = await fetch("/api/teacher-speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: textToSpeak,
          voice: "alloy" // Using alloy voice as it's most reliable
        }),
      });
      
      console.log("API Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", errorText);
        throw new Error(`Speech API failed: ${response.status} - ${errorText}`);
      }
      
      const blob = await response.blob();
      console.log("Blob size:", blob.size, "type:", blob.type);
      
      if (blob.size === 0) {
        throw new Error("Received empty audio blob");
      }
      
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      
      // Add all event handlers before attempting to play
      audio.onloadedmetadata = () => {
        console.log("Audio metadata loaded, duration:", audio.duration);
      };
      
      audio.oncanplaythrough = () => {
        console.log("Audio can play through");
      };
      
      audio.onplay = () => {
        console.log("Audio started playing");
      };
      
      audio.onerror = (e) => {
        console.error("Audio playback error:", e);
        console.error("Audio error details:", audio.error);
        setCurrentAudio(null);
        setIsGeneratingSpeech(false);
      };
      
      audio.onended = () => {
        console.log("Audio playback ended");
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      };
      
      // Set volume to ensure it's audible
      audio.volume = 1.0;
      
      setCurrentAudio(audio);
      setIsGeneratingSpeech(false);
      
      // Try to play with user interaction fallback
      console.log("Attempting to play audio...");
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Audio playback started successfully");
          })
          .catch((error) => {
            console.error("Play promise rejected:", error);
            // Try to play on next user interaction
            console.log("Will retry on next user interaction");
            document.addEventListener('click', () => {
              audio.play().catch(e => console.error("Retry play failed:", e));
            }, { once: true });
          });
      }
      
      console.log("=== SPEECH DEBUG END ===");
      
    } catch (error) {
      console.error("=== SPEECH ERROR ===");
      console.error("Error details:", error);
      setCurrentAudio(null);
      setIsGeneratingSpeech(false);
      alert("Speech generation failed. Check browser console (F12) for details.");
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

  // Helper function to parse prompt into sections
  const parsePromptIntoSections = (prompt: string): TeacherSection[] => {
    const defaultSections = [...teacherSections];
    
    // Try to extract content for each section from the prompt
    const introMatch = prompt.match(/Introduction[:\s]*(.*?)(?=Warm-up|Main Content|Practice|Wrap-up|$)/i);
    const warmupMatch = prompt.match(/Warm-up[:\s]*(.*?)(?=Main Content|Practice|Wrap-up|$)/i);
    const mainMatch = prompt.match(/Main Content[:\s]*(.*?)(?=Practice|Wrap-up|$)/i);
    const practiceMatch = prompt.match(/Practice[:\s]*(.*?)(?=Wrap-up|$)/i);
    const wrapupMatch = prompt.match(/Wrap-up[:\s]*(.*?)$/i);
    
    if (introMatch) defaultSections[0].content = introMatch[1].trim();
    if (warmupMatch) defaultSections[1].content = warmupMatch[1].trim();
    if (mainMatch) defaultSections[2].content = mainMatch[1].trim();
    if (practiceMatch) defaultSections[3].content = practiceMatch[1].trim();
    if (wrapupMatch) defaultSections[4].content = wrapupMatch[1].trim();
    
    // If no matches found, just put the entire prompt in the main content
    if (!introMatch && !warmupMatch && !mainMatch && !practiceMatch && !wrapupMatch) {
      defaultSections[2].content = prompt;
    }
    
    return defaultSections;
  };
  
  // Function to consolidate sections into a single prompt
  const consolidateSectionsIntoPrompt = (): string => {
    let consolidatedPrompt = `Course: ${courseTitle}\nTarget Audience: ${targetAudience}\n`;
    consolidatedPrompt += `Teacher Expertise: ${teacherExpertiseSubject}\nTeaching Style: ${globalTeachingStyle}\n\n`;
    let totalTime = 0;
    
    teacherSections.forEach(section => {
      totalTime += section.duration;
      consolidatedPrompt += `## ${section.title}\n`;
      consolidatedPrompt += `**Duration:** ${section.duration} minutes | **Format:** ${section.actionType.toUpperCase()} | **Difficulty:** ${section.difficulty} | **Section Style:** ${section.teachingStyle}\n\n`;
      consolidatedPrompt += `${section.content || '[Content to be added]'}\n\n`;
    });
    
    consolidatedPrompt += `\nTotal Duration: ${totalTime} minutes\n`;
    return consolidatedPrompt;
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
      // If sections are provided from server, use them directly
      if (data.sections) {
        const newSections = [...teacherSections];
        newSections[0].content = data.sections.introduction || "";
        newSections[1].content = data.sections.warmup || "";
        newSections[2].content = data.sections.mainContent || "";
        newSections[3].content = data.sections.practice || "";
        newSections[4].content = data.sections.wrapup || "";
        setTeacherSections(newSections);
      } else {
        // Otherwise, parse from the prompt
        const sections = parsePromptIntoSections(data.teacherPrompt);
        setTeacherSections(sections);
      }
      // Store the original prompt as well
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
        teacherContext: teacherContent,
        fileIds: selectedFiles,
        folderIds: selectedFolders
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      const userMessage = chatInput;
      setChatMessages(prev => [
        ...prev,
        { role: "user", content: userMessage },
        { role: "assistant", content: data.response }
      ]);
      setChatInput("");
      
      // Automatically speak the teacher's response
      console.log("Speaking teacher response:", data.response.substring(0, 50) + "...");
      await speakTeacherResponse(data.response);
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
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="teaching-style" className="text-sm">Teaching Style</Label>
                          <Select
                            value={globalTeachingStyle}
                            onValueChange={setGlobalTeachingStyle}
                          >
                            <SelectTrigger id="teaching-style">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="visual">Visual (diagrams & images)</SelectItem>
                              <SelectItem value="storytelling">Storytelling (narrative)</SelectItem>
                              <SelectItem value="hands-on">Hands-on (practical)</SelectItem>
                              <SelectItem value="discussion">Discussion (interactive)</SelectItem>
                              <SelectItem value="analytical">Analytical (detailed)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="expertise-subject" className="text-sm">Teacher Expertise Subject</Label>
                          <Select
                            value={teacherExpertiseSubject}
                            onValueChange={setTeacherExpertiseSubject}
                          >
                            <SelectTrigger id="expertise-subject">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mathematics">Mathematics</SelectItem>
                              <SelectItem value="science">Science</SelectItem>
                              <SelectItem value="language-arts">Language Arts</SelectItem>
                              <SelectItem value="social-studies">Social Studies</SelectItem>
                              <SelectItem value="computer-science">Computer Science</SelectItem>
                              <SelectItem value="arts">Arts & Music</SelectItem>
                              <SelectItem value="physical-education">Physical Education</SelectItem>
                              <SelectItem value="general">General Education</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
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

              {/* Teacher Prompt Sections Editor */}
              {teacherPrompt && !teacherContent && (
                <Card>
                  <CardHeader>
                    <CardTitle>Course Structure Editor</CardTitle>
                    <CardDescription>
                      Edit each section of your course. Customize content, select action types, and set duration for each part.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Section Editors */}
                      {teacherSections.map((section, index) => (
                        <div key={section.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-lg">{section.title}</h4>
                            <Badge variant="outline">{section.duration} min</Badge>
                          </div>
                          
                          {/* Content Editor */}
                          <div className="space-y-2">
                            <Label htmlFor={`content-${section.id}`}>Content</Label>
                            <Textarea
                              id={`content-${section.id}`}
                              value={section.content}
                              onChange={(e) => {
                                const newSections = [...teacherSections];
                                newSections[index].content = e.target.value;
                                setTeacherSections(newSections);
                              }}
                              placeholder={`Enter content for ${section.title}...`}
                              className="min-h-[100px]"
                            />
                          </div>
                          
                          {/* Action Type and Duration */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor={`action-${section.id}`}>Action Type</Label>
                              <Select
                                value={section.actionType}
                                onValueChange={(value) => {
                                  const newSections = [...teacherSections];
                                  newSections[index].actionType = value as any;
                                  setTeacherSections(newSections);
                                }}
                              >
                                <SelectTrigger id={`action-${section.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ppt">PowerPoint</SelectItem>
                                  <SelectItem value="audio">Audio</SelectItem>
                                  <SelectItem value="video">Video</SelectItem>
                                  <SelectItem value="flashcards">Flashcards</SelectItem>
                                  <SelectItem value="quiz">Quiz</SelectItem>
                                  <SelectItem value="discussion">Discussion</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor={`duration-${section.id}`}>Duration (minutes)</Label>
                              <Input
                                id={`duration-${section.id}`}
                                type="number"
                                min="1"
                                max="60"
                                value={section.duration}
                                onChange={(e) => {
                                  const newSections = [...teacherSections];
                                  newSections[index].duration = parseInt(e.target.value) || 5;
                                  setTeacherSections(newSections);
                                }}
                              />
                            </div>
                          </div>
                          
                          {/* Difficulty and Teaching Style */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor={`difficulty-${section.id}`}>Difficulty Level</Label>
                              <Select
                                value={section.difficulty}
                                onValueChange={(value) => {
                                  const newSections = [...teacherSections];
                                  newSections[index].difficulty = value as any;
                                  setTeacherSections(newSections);
                                }}
                              >
                                <SelectTrigger id={`difficulty-${section.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="beginner">Beginner</SelectItem>
                                  <SelectItem value="intermediate">Intermediate</SelectItem>
                                  <SelectItem value="advanced">Advanced</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor={`style-${section.id}`}>Teaching Style</Label>
                              <Select
                                value={section.teachingStyle}
                                onValueChange={(value) => {
                                  const newSections = [...teacherSections];
                                  newSections[index].teachingStyle = value as any;
                                  setTeacherSections(newSections);
                                }}
                              >
                                <SelectTrigger id={`style-${section.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="visual">Visual (with diagrams & images)</SelectItem>
                                  <SelectItem value="storytelling">Storytelling (narrative approach)</SelectItem>
                                  <SelectItem value="hands-on">Hands-on (practical exercises)</SelectItem>
                                  <SelectItem value="discussion">Discussion (interactive dialogue)</SelectItem>
                                  <SelectItem value="analytical">Analytical (detailed explanations)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Consolidate and Send Buttons */}
                      <div className="space-y-3">
                        <Button
                          onClick={() => {
                            const consolidated = consolidateSectionsIntoPrompt();
                            setTeacherPrompt(consolidated);
                            setTeacherPromptWithContent(consolidated);
                          }}
                          variant="outline"
                          className="w-full"
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Consolidate Sections into Prompt
                        </Button>
                        
                        {/* Show consolidated prompt preview */}
                        {teacherPromptWithContent && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h5 className="font-medium mb-2">Consolidated Prompt Preview:</h5>
                            <ScrollArea className="h-32">
                              <p className="text-sm leading-relaxed whitespace-pre-wrap text-blue-800">
                                {teacherPromptWithContent}
                              </p>
                            </ScrollArea>
                          </div>
                        )}
                        
                        <Button
                          onClick={() => {
                            // First consolidate, then execute
                            const consolidated = consolidateSectionsIntoPrompt();
                            setTeacherPromptWithContent(consolidated);
                            executeTeacherPromptMutation.mutate();
                          }}
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
                              <Send className="mr-2 h-4 w-4" />
                              Send to Teacher Agent
                            </>
                          )}
                        </Button>
                      </div>
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
                        {isGeneratingSpeech && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Generating speech...
                          </span>
                        )}
                        {currentAudio && !isGeneratingSpeech && (
                          <Volume2 className="h-4 w-4 text-blue-500 animate-pulse" />
                        )}
                      </CardTitle>
                      <CardDescription className="flex items-center justify-between">
                        <span>Now you can chat with the teacher agent. Teacher responses are automatically read aloud.</span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              // Save chat session
                              const title = prompt("Enter a title for this chat session:", `${courseTitle} - Chat Session`);
                              if (title) {
                                try {
                                  const response = await apiRequest("POST", "/api/teacher-chat-sessions", {
                                    title,
                                    courseTitle,
                                    targetAudience,
                                    teachingStyle: globalTeachingStyle,
                                    expertiseSubject: teacherExpertiseSubject,
                                    teacherPrompt,
                                    teacherContent,
                                    chatHistory: chatMessages,
                                    selectedFiles,
                                    selectedFolders
                                  });
                                  const session = await response.json();
                                  alert("Session saved successfully!");
                                  
                                  // Load saved sessions
                                  const sessionsResponse = await apiRequest("GET", "/api/teacher-chat-sessions");
                                  const sessions = await sessionsResponse.json();
                                  setSavedSessions(sessions);
                                } catch (error) {
                                  console.error("Error saving session:", error);
                                  alert("Failed to save session");
                                }
                              }
                            }}
                          >
                            <Save className="h-4 w-4 mr-1" />
                            Save Session
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              // Toggle saved sessions view
                              if (!showSavedSessions && savedSessions.length === 0) {
                                const response = await apiRequest("GET", "/api/teacher-chat-sessions");
                                const sessions = await response.json();
                                setSavedSessions(sessions);
                              }
                              setShowSavedSessions(!showSavedSessions);
                            }}
                          >
                            <History className="h-4 w-4 mr-1" />
                            History
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              console.log("Testing speech...");
                              await speakTeacherResponse("Hello! This is a test of the text to speech system. Can you hear me?");
                            }}
                          >
                            <Volume2 className="h-4 w-4 mr-1" />
                            Test Speech
                          </Button>
                        </div>
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
                  
                  {/* Saved Sessions */}
                  {showSavedSessions && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Saved Chat Sessions</CardTitle>
                        <CardDescription>Load a previous chat session or share it with others</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {savedSessions.length === 0 ? (
                          <p className="text-muted-foreground">No saved sessions yet</p>
                        ) : (
                          <div className="space-y-2">
                            {savedSessions.map((session: any) => (
                              <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex-1">
                                  <h4 className="font-medium">{session.title}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {new Date(session.createdAt).toLocaleDateString()} - {session.chatHistory?.length || 0} messages
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      // Load session
                                      setCourseTitle(session.courseTitle || "");
                                      setTargetAudience(session.targetAudience || "");
                                      setTeacherPrompt(session.teacherPrompt || "");
                                      setTeacherContent(session.teacherContent || "");
                                      setChatMessages(session.chatHistory || []);
                                      setSelectedFiles(session.selectedFiles || []);
                                      setSelectedFolders(session.selectedFolders || []);
                                      setShowSavedSessions(false);
                                    }}
                                  >
                                    Load
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      // Toggle sharing
                                      const isPublic = session.isPublic === 1;
                                      try {
                                        const response = await apiRequest("PATCH", `/api/teacher-chat-sessions/${session.id}/share`, {
                                          isPublic: !isPublic
                                        });
                                        const updated = await response.json();
                                        
                                        if (!isPublic) {
                                          const shareUrl = `${window.location.origin}/shared-chat/${updated.shareId}`;
                                          navigator.clipboard.writeText(shareUrl);
                                          alert(`Session is now public! Share URL copied to clipboard:\n${shareUrl}`);
                                        } else {
                                          alert("Session is now private");
                                        }
                                        
                                        // Refresh sessions
                                        const sessionsResponse = await apiRequest("GET", "/api/teacher-chat-sessions");
                                        const sessions = await sessionsResponse.json();
                                        setSavedSessions(sessions);
                                      } catch (error) {
                                        console.error("Error sharing session:", error);
                                        alert("Failed to update sharing status");
                                      }
                                    }}
                                  >
                                    <Share2 className="h-4 w-4 mr-1" />
                                    {session.isPublic === 1 ? "Unshare" : "Share"}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}