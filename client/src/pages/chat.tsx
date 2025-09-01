import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Send,
  Bot,
  User,
  FileText,
  Sparkles,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AIProviderToggle,
  AIProviderInfo,
} from "@/components/ai-provider-toggle";
import { DocumentPreview } from "@/components/document-preview";

interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "thinking";
  content: string;
  timestamp: Date;
  relatedFiles?: string[];
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      type: "assistant",
      content:
        "Hello! I'm your AI assistant. I can help you with questions about your uploaded files, search for specific information, or provide insights based on your documents. What would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [conversationContext, setConversationContext] = useState<any>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(
    undefined,
  );
  const currentProviderRef = useRef<"openai" | "dify">("dify");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Fetch available files
  const { data: files = [] } = useQuery({
    queryKey: ["/api/files"],
    refetchInterval: 10000,
  });

  const processedFiles = Array.isArray(files)
    ? files.filter((file: any) => file.processingStatus === "completed")
    : [];

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async ({
      message,
      fileIds,
    }: {
      message: string;
      fileIds: string[];
    }) => {
      const chatHistory = messages.map((m) => ({
        role: m.type === "user" ? "user" : "assistant",
        content: m.content,
      }));
      const response = await apiRequest("POST", "/api/chat", {
        message,
        fileIds,
        chatHistory: chatHistory.slice(-10), // Send last 10 messages for context
        conversationContext: conversationContext,
        conversationId:
          conversationId && conversationId !== "null"
            ? conversationId
            : undefined, // Pass conversation ID for Dify MCP memory
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      // Remove thinking message and add assistant message
      setMessages((prev) => {
        const filteredMessages = prev.filter((msg) => msg.type !== "thinking");
        const assistantMessage: ChatMessage = {
          id: Date.now().toString(),
          type: "assistant",
          content: data.response,
          timestamp: new Date(),
          relatedFiles: data.relatedFiles || [],
        };
        return [...filteredMessages, assistantMessage];
      });

      // Update conversation context from oversight agent
      if (data.conversationContext) {
        setConversationContext(data.conversationContext);
      }

      // Store conversation ID for Dify MCP memory
      if (data.conversationId && data.conversationId !== "null") {
        setConversationId(data.conversationId);
      }

      // Store current provider
      if (data.provider) {
        currentProviderRef.current = data.provider;
      }
    },
    onError: (error: any) => {
      console.error("Chat error:", error);
      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to get response. Please try again.";
      const errorDetails = error?.response?.data?.details || "";

      toast({
        title: "Chat Error",
        description: errorMessage + (errorDetails ? ` (${errorDetails})` : ""),
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    // Add thinking message
    const thinkingMessage: ChatMessage = {
      id: `thinking-${Date.now()}`,
      type: "thinking",
      content: "Thinking",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, thinkingMessage]);

    // Send to AI
    chatMutation.mutate({
      message: inputMessage,
      fileIds: selectedFiles,
    });

    setInputMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId],
    );
  };

  // Removed auto-scroll to prevent unwanted scrolling behavior

  // Helper function to detect if content should be shown in document preview
  const shouldShowAsDocument = (content: string): boolean => {
    // Check for document-like patterns
    const hasBulletPoints = /^[•\-\*]\s/m.test(content);
    const hasNumberedList = /^\d+\.\s/m.test(content);
    const hasMultipleLines = content.split("\n").length > 5;
    const isLongContent = content.length > 400;

    // Check for specific keywords that indicate structured content
    const hasDocumentKeywords =
      /summary|overview|analysis|report|course|design|framework|components|structure|key|main|points|section/i.test(
        content,
      );

    // Show as document if it has structure and is substantial
    return (
      (hasBulletPoints || hasNumberedList || hasDocumentKeywords) &&
      (hasMultipleLines || isLongContent)
    );
  };

  // Helper to extract title from content
  const extractTitle = (content: string): string | undefined => {
    // Try to detect title from first line if it looks like a title
    const firstLine = content.split("\n")[0].trim();
    if (firstLine && firstLine.length < 100) {
      // If first line looks like a title (short, possibly ends with colon, or is a header-like phrase)
      if (
        firstLine.includes("Summary") ||
        firstLine.includes("Overview") ||
        firstLine.includes("Analysis") ||
        firstLine.includes("Report")
      ) {
        return firstLine.replace(/[:#]/g, "").trim();
      }
    }

    return undefined;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            Chat with Your Files
          </h1>
          <p className="text-slate-600">
            Ask questions about your documents and get AI-powered insights
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 h-[calc(100vh-200px)]">
          {/* File Selection Sidebar */}
          <div className="lg:col-span-1">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="text-blue-600" />
                  <span>Available Files</span>
                </CardTitle>
                <p className="text-sm text-slate-600">
                  Select files to include in your conversation
                </p>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100%-100px)]">
                  <div className="space-y-3">
                    {processedFiles.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-8">
                        No processed files available. Upload some documents
                        first!
                      </p>
                    ) : (
                      processedFiles.map((file: any) => (
                        <div
                          key={file.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedFiles.includes(file.id)
                              ? "border-blue-500 bg-blue-50"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                          onClick={() => toggleFileSelection(file.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {file.originalName}
                              </p>
                              {file.metadata?.summary && (
                                <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                                  {file.metadata.summary}
                                </p>
                              )}
                              {file.metadata?.categories && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {file.metadata.categories
                                    .slice(0, 2)
                                    .map((category: string) => (
                                      <Badge
                                        key={category}
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        {category}
                                      </Badge>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                {selectedFiles.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium text-slate-700 mb-2">
                      Selected: {selectedFiles.length} file
                      {selectedFiles.length !== 1 ? "s" : ""}
                    </p>
                    <Button
                      onClick={() => setSelectedFiles([])}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      Clear Selection
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-3">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <MessageCircle className="text-green-600" />
                    <span>AI Assistant</span>
                    {chatMutation.isPending && (
                      <div className="flex items-center space-x-2 text-blue-600">
                        <Clock className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    )}
                  </CardTitle>
                  <AIProviderToggle />
                </div>
                <div className="mt-3">
                  <AIProviderInfo />
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col p-0">
                {/* Input - Moved to top */}
                <div className="p-6 border-b bg-white">
                  <div className="flex space-x-3">
                    <Input
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask a question about your files..."
                      disabled={chatMutation.isPending}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || chatMutation.isPending}
                      className="px-6"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>

                  {selectedFiles.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-600 mb-2">
                        Context: {selectedFiles.length} file
                        {selectedFiles.length !== 1 ? "s" : ""} selected
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {selectedFiles.map((fileId) => {
                          const file = processedFiles.find(
                            (f: any) => f.id === fileId,
                          );
                          return file ? (
                            <Badge
                              key={fileId}
                              variant="secondary"
                              className="text-xs"
                            >
                              {file.originalName}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {message.type === "thinking" ? (
                          // Thinking animation
                          <div className="flex items-start space-x-3 max-w-[80%]">
                            <div className="p-2 rounded-full bg-green-600 text-white">
                              <Bot className="h-4 w-4" />
                            </div>
                            <div className="p-4 rounded-lg bg-slate-100 text-slate-800">
                              <div className="flex items-center space-x-1">
                                <span className="text-sm">
                                  {message.content}
                                </span>
                                <span className="inline-flex space-x-1">
                                  <span
                                    className="animate-bounce inline-block"
                                    style={{ animationDelay: "0ms" }}
                                  >
                                    .
                                  </span>
                                  <span
                                    className="animate-bounce inline-block"
                                    style={{ animationDelay: "150ms" }}
                                  >
                                    .
                                  </span>
                                  <span
                                    className="animate-bounce inline-block"
                                    style={{ animationDelay: "300ms" }}
                                  >
                                    .
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Regular user or assistant message
                          <div
                            className={`flex items-start space-x-3 max-w-[80%] ${
                              message.type === "user"
                                ? "flex-row-reverse space-x-reverse"
                                : ""
                            }`}
                          >
                            <div
                              className={`p-2 rounded-full ${
                                message.type === "user"
                                  ? "bg-blue-600 text-white"
                                  : "bg-green-600 text-white"
                              }`}
                            >
                              {message.type === "user" ? (
                                <User className="h-4 w-4" />
                              ) : (
                                <Bot className="h-4 w-4" />
                              )}
                            </div>

                            {/* Check if assistant message should be shown as document */}
                            {message.type === "assistant" &&
                            shouldShowAsDocument(message.content) ? (
                              <div className="flex-1 max-w-full">
                                <DocumentPreview
                                  content={message.content}
                                  title={extractTitle(message.content)}
                                  isEmbedded={true}
                                  className="shadow-md"
                                />
                                {message.relatedFiles &&
                                  message.relatedFiles.length > 0 && (
                                    <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                                      <p className="text-xs text-slate-600 mb-1">
                                        Source files:
                                      </p>
                                      <div className="flex flex-wrap gap-1">
                                        {message.relatedFiles.map((fileId) => {
                                          const file = processedFiles.find(
                                            (f: any) => f.id === fileId,
                                          );
                                          return file ? (
                                            <Badge
                                              key={fileId}
                                              variant="secondary"
                                              className="text-xs"
                                            >
                                              {file.originalName}
                                            </Badge>
                                          ) : null;
                                        })}
                                      </div>
                                    </div>
                                  )}
                                <p className="text-xs mt-2 text-slate-500">
                                  {message.timestamp.toLocaleTimeString()}
                                </p>
                              </div>
                            ) : (
                              // Regular message display
                              <div
                                className={`p-4 rounded-lg ${
                                  message.type === "user"
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-100 text-slate-800"
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap">
                                  {message.content}
                                </p>
                                {message.relatedFiles &&
                                  message.relatedFiles.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                      <p className="text-xs text-slate-600 mb-1">
                                        Related files:
                                      </p>
                                      <div className="flex flex-wrap gap-1">
                                        {message.relatedFiles.map((fileId) => {
                                          const file = processedFiles.find(
                                            (f: any) => f.id === fileId,
                                          );
                                          return file ? (
                                            <Badge
                                              key={fileId}
                                              variant="outline"
                                              className="text-xs"
                                            >
                                              {file.originalName}
                                            </Badge>
                                          ) : null;
                                        })}
                                      </div>
                                    </div>
                                  )}
                                <p className="text-xs mt-2 opacity-70">
                                  {message.timestamp.toLocaleTimeString()}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
