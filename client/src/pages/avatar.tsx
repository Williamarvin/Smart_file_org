import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Send, Mic, MicOff, Bot, User, Sparkles, Zap, Heart, Brain } from "lucide-react";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AvatarOption {
  id: string;
  name: string;
  description: string;
  personality: string;
  avatar: string;
  color: string;
  icon: React.ReactNode;
  animationClass: string;
}

const avatarOptions: AvatarOption[] = [
  {
    id: 'sage',
    name: 'Sage',
    description: 'Wise and knowledgeable mentor',
    personality: 'A thoughtful and wise mentor who provides deep insights and guidance. Speaks with wisdom and patience.',
    avatar: '🧙‍♂️',
    color: 'bg-purple-500',
    icon: <Brain className="h-4 w-4" />,
    animationClass: 'animate-pulse'
  },
  {
    id: 'spark',
    name: 'Spark',
    description: 'Creative and energetic companion',
    personality: 'An enthusiastic and creative companion who loves brainstorming and coming up with innovative ideas. Always upbeat and inspiring.',
    avatar: '✨',
    color: 'bg-yellow-500',
    icon: <Sparkles className="h-4 w-4" />,
    animationClass: 'animate-bounce'
  },
  {
    id: 'zen',
    name: 'Zen',
    description: 'Calm and mindful guide',
    personality: 'A peaceful and mindful guide who promotes wellness and balance. Speaks with serenity and clarity.',
    avatar: '🧘‍♀️',
    color: 'bg-green-500',
    icon: <Heart className="h-4 w-4" />,
    animationClass: 'animate-pulse'
  },
  {
    id: 'bolt',
    name: 'Bolt',
    description: 'Quick and efficient problem solver',
    personality: 'A fast-thinking problem solver who gets straight to the point. Direct, efficient, and solutions-focused.',
    avatar: '⚡',
    color: 'bg-blue-500',
    icon: <Zap className="h-4 w-4" />,
    animationClass: 'animate-ping'
  }
];

export default function AvatarPage() {
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarOption>(avatarOptions[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (data: { message: string; avatar: AvatarOption }) => {
      const response = await fetch('/api/avatar-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: data.message,
          avatarId: data.avatar.id,
          personality: data.avatar.personality,
          chatHistory: messages.slice(-10) // Send last 10 messages for context
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response from avatar');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: Date.now().toString() + '_assistant',
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
    onError: (error) => {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: Date.now().toString() + '_error',
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    chatMutation.mutate({ message: inputMessage.trim(), avatar: selectedAvatar });
    setInputMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAvatarChange = (avatar: AvatarOption) => {
    setSelectedAvatar(avatar);
    // Add a system message when switching avatars
    if (messages.length > 0) {
      const switchMessage: Message = {
        id: Date.now().toString() + '_switch',
        role: 'assistant',
        content: `Hi! I'm ${avatar.name}. ${avatar.description}. How can I help you today?`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, switchMessage]);
    }
  };

  const startVoiceInput = () => {
    // Placeholder for voice input functionality
    setIsListening(true);
    setTimeout(() => setIsListening(false), 3000);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Avatar AI Chat</h1>
          <p className="text-muted-foreground">
            Choose an AI avatar and start a conversation. Each avatar has unique personality and expertise.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Avatar Selection Panel */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Choose Your Avatar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {avatarOptions.map((avatar) => (
                  <div
                    key={avatar.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      selectedAvatar.id === avatar.id
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                    }`}
                    onClick={() => handleAvatarChange(avatar)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`text-2xl ${selectedAvatar.id === avatar.id ? avatar.animationClass : ''}`}>
                        {avatar.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm">{avatar.name}</h3>
                          <Badge variant="outline" className="text-xs">
                            {avatar.icon}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {avatar.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-3">
            <Card className="h-[700px] flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`text-3xl ${selectedAvatar.animationClass}`}>
                    {selectedAvatar.avatar}
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {selectedAvatar.name}
                      <div className={`w-2 h-2 rounded-full ${selectedAvatar.color} animate-pulse`}></div>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {selectedAvatar.description}
                    </p>
                  </div>
                </div>
              </CardHeader>
              
              <Separator />

              {/* Messages Area */}
              <CardContent className="flex-1 flex flex-col p-0">
                <ScrollArea className="flex-1 p-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
                      <div className={`text-6xl ${selectedAvatar.animationClass}`}>
                        {selectedAvatar.avatar}
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold">
                          Hello! I'm {selectedAvatar.name}
                        </h3>
                        <p className="text-muted-foreground max-w-md">
                          {selectedAvatar.personality.split('.')[0]}.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Start a conversation by typing a message below!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${
                            message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                          }`}
                        >
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            {message.role === 'user' ? (
                              <>
                                <AvatarFallback>
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </>
                            ) : (
                              <AvatarFallback className="text-lg">
                                {selectedAvatar.avatar}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div className={`flex-1 max-w-[80%] ${
                            message.role === 'user' ? 'text-right' : 'text-left'
                          }`}>
                            <div className={`inline-block px-4 py-2 rounded-lg ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}>
                              <p className="text-sm whitespace-pre-wrap">
                                {message.content}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatTime(message.timestamp)}
                            </p>
                          </div>
                        </div>
                      ))}
                      {chatMutation.isPending && (
                        <div className="flex gap-3">
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="text-lg">
                              {selectedAvatar.avatar}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="inline-block px-4 py-2 rounded-lg bg-muted">
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm text-muted-foreground">
                                  {selectedAvatar.name} is thinking...
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Input Area */}
                <div className="flex-shrink-0 p-4 border-t">
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={`Chat with ${selectedAvatar.name}...`}
                      disabled={chatMutation.isPending}
                      className="flex-1"
                    />
                    <Button
                      onClick={startVoiceInput}
                      variant="outline"
                      size="icon"
                      disabled={isListening || chatMutation.isPending}
                      className="flex-shrink-0"
                    >
                      {isListening ? (
                        <MicOff className="h-4 w-4 animate-pulse" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || chatMutation.isPending}
                      className="flex-shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Press Enter to send • Choose different avatars for unique conversations
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}