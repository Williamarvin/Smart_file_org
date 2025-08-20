import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Send, Mic, MicOff, Bot, User, Sparkles, Zap, Heart, Brain, Volume2, VolumeX, Play, Pause } from "lucide-react";
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
  voice: {
    rate: number;
    pitch: number;
    voiceName?: string;
    openAIVoice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  };
  expressions: {
    idle: string;
    speaking: string;
    thinking: string;
    happy: string;
    listening: string;
  };
}

const avatarOptions: AvatarOption[] = [
  {
    id: 'sage',
    name: 'Sage',
    description: 'Wise and knowledgeable mentor',
    personality: 'A thoughtful and wise mentor who provides deep insights and guidance. Speaks with wisdom and patience, using a calm and measured tone.',
    avatar: '🧙‍♂️',
    color: 'bg-purple-500',
    icon: <Brain className="h-4 w-4" />,
    animationClass: 'animate-pulse',
    voice: { rate: 0.8, pitch: 0.8, openAIVoice: 'onyx' }, // Deep, wise voice
    expressions: {
      idle: '🧙‍♂️',
      speaking: '🗣️🧙‍♂️',
      thinking: '🤔🧙‍♂️',
      happy: '😊🧙‍♂️',
      listening: '👂🧙‍♂️'
    }
  },
  {
    id: 'spark',
    name: 'Spark',
    description: 'Creative and energetic companion',
    personality: 'A naturally enthusiastic creative companion who gets excited about new ideas. Speaks with genuine energy and warmth, like a supportive friend.',
    avatar: '✨',
    color: 'bg-yellow-500',
    icon: <Sparkles className="h-4 w-4" />,
    animationClass: 'animate-bounce',
    voice: { rate: 1.2, pitch: 1.1, openAIVoice: 'nova' }, // Energetic female voice
    expressions: {
      idle: '✨😊',
      speaking: '🗣️✨',
      thinking: '💭✨',
      happy: '🎉✨',
      listening: '👂✨'
    }
  },
  {
    id: 'zen',
    name: 'Zen',
    description: 'Calm and mindful guide',
    personality: 'A peaceful guide who speaks softly and thoughtfully. Uses calming language and gentle encouragement, like a meditation instructor.',
    avatar: '🧘‍♀️',
    color: 'bg-green-500',
    icon: <Heart className="h-4 w-4" />,
    animationClass: 'animate-pulse',
    voice: { rate: 0.9, pitch: 0.9, openAIVoice: 'shimmer' }, // Soft, calming voice
    expressions: {
      idle: '🧘‍♀️',
      speaking: '🗣️🧘‍♀️',
      thinking: '💚🧘‍♀️',
      happy: '☺️🧘‍♀️',
      listening: '👂🧘‍♀️'
    }
  },
  {
    id: 'bolt',
    name: 'Bolt',
    description: 'Quick and efficient problem solver',
    personality: 'A practical problem solver who gets straight to the point without being harsh. Clear and direct like a helpful tech expert.',
    avatar: '⚡',
    color: 'bg-blue-500',
    icon: <Zap className="h-4 w-4" />,
    animationClass: 'animate-ping',
    voice: { rate: 1.3, pitch: 1.0, openAIVoice: 'echo' }, // Clear male voice
    expressions: {
      idle: '⚡😐',
      speaking: '🗣️⚡',
      thinking: '🧠⚡',
      happy: '😃⚡',
      listening: '👂⚡'
    }
  }
];

export default function AvatarPage() {
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarOption>(avatarOptions[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentExpression, setCurrentExpression] = useState<keyof AvatarOption['expressions']>('idle');
  const [voiceEnabled, setVoiceEnabled] = useState(true); // Default to voice on
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speechRecognition, setSpeechRecognition] = useState<any | null>(null);
  const [speechSynthesis, setSpeechSynthesis] = useState<SpeechSynthesis | null>(null);
  const [conversationContext, setConversationContext] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Initialize speech APIs
  useEffect(() => {
    if ('speechSynthesis' in window) {
      setSpeechSynthesis(window.speechSynthesis);
    }

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setCurrentExpression('listening');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage(transcript);
        setIsListening(false);
        setCurrentExpression('idle');
      };

      recognition.onerror = () => {
        setIsListening(false);
        setCurrentExpression('idle');
      };

      recognition.onend = () => {
        setIsListening(false);
        setCurrentExpression('idle');
      };

      setSpeechRecognition(recognition);
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Text-to-speech function
  const speakText = (text: string, avatar: AvatarOption) => {
    if (!speechSynthesis || !voiceEnabled) return;

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = avatar.voice.rate;
    utterance.pitch = avatar.voice.pitch;
    
    // Try to find a suitable voice
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Prefer female voices for Zen and Spark, male for Sage and Bolt
      const preferFemale = ['zen', 'spark'].includes(avatar.id);
      const suitableVoice = voices.find(voice => 
        voice.lang.startsWith('en') && 
        voice.name.toLowerCase().includes(preferFemale ? 'female' : 'male')
      ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];
      
      utterance.voice = suitableVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setCurrentExpression('speaking');
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentExpression('idle');
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setCurrentExpression('idle');
    };

    speechSynthesis.speak(utterance);
  };

  // Stop speech and audio playback
  const stopSpeaking = () => {
    // Stop browser TTS
    if (speechSynthesis) {
      speechSynthesis.cancel();
    }
    
    // Stop OpenAI audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    setIsSpeaking(false);
    setIsPlayingAudio(false);
    setCurrentExpression('idle');
  };

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
          chatHistory: messages.slice(-10),
          conversationContext: conversationContext,
          voiceEnabled: voiceEnabled,
          voiceModel: data.avatar.voice.openAIVoice
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
      
      // Update conversation context from oversight agent
      if (data.conversationContext) {
        setConversationContext(data.conversationContext);
      }
      
      // Play OpenAI's natural voice if available
      if (voiceEnabled && data.audioData) {
        // Create audio element and play the MP3 from base64
        const audio = new Audio(`data:audio/mp3;base64,${data.audioData}`);
        audioRef.current = audio;
        
        audio.onplay = () => {
          setIsPlayingAudio(true);
          setCurrentExpression('speaking');
        };
        
        audio.onended = () => {
          setIsPlayingAudio(false);
          setCurrentExpression('idle');
        };
        
        audio.onerror = () => {
          console.error('Error playing audio');
          setIsPlayingAudio(false);
          setCurrentExpression('idle');
          // Fallback to browser TTS if OpenAI audio fails
          speakText(data.response, selectedAvatar);
        };
        
        audio.play().catch(err => {
          console.error('Error playing audio:', err);
          // Fallback to browser TTS
          speakText(data.response, selectedAvatar);
        });
      } else if (voiceEnabled) {
        // Fallback to browser TTS if no audio data
        setTimeout(() => {
          speakText(data.response, selectedAvatar);
        }, 500);
      }
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
    setCurrentExpression('thinking');
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
    if (!speechRecognition || isListening) return;

    try {
      setCurrentExpression('listening');
      speechRecognition.start();
    } catch (error) {
      console.error('Speech recognition error:', error);
      setCurrentExpression('idle');
    }
  };

  const stopVoiceInput = () => {
    if (speechRecognition && isListening) {
      speechRecognition.stop();
      setIsListening(false);
      setCurrentExpression('idle');
    }
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
                        {selectedAvatar.id === avatar.id ? selectedAvatar.expressions[currentExpression] : avatar.avatar}
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`text-4xl ${selectedAvatar.animationClass} transition-all duration-300`}>
                      {selectedAvatar.expressions[currentExpression]}
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {selectedAvatar.name}
                        <div className={`w-2 h-2 rounded-full ${selectedAvatar.color} ${(isSpeaking || isPlayingAudio) ? 'animate-ping' : 'animate-pulse'}`}></div>
                        {(isSpeaking || isPlayingAudio) && <span className="text-xs text-green-600 font-medium">Speaking...</span>}
                        {isListening && <span className="text-xs text-blue-600 font-medium">Listening...</span>}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {selectedAvatar.description}
                      </p>
                    </div>
                  </div>
                  
                  {/* Voice Controls */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVoiceEnabled(!voiceEnabled)}
                      className="flex items-center gap-1"
                    >
                      {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                      <span className="text-xs">{voiceEnabled ? 'Voice On' : 'Voice Off'}</span>
                    </Button>
                    {(isSpeaking || isPlayingAudio) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={stopSpeaking}
                        className="flex items-center gap-1"
                      >
                        <Pause className="h-4 w-4" />
                        <span className="text-xs">Stop</span>
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <Separator />

              {/* Messages Area */}
              <CardContent className="flex-1 flex flex-col p-0">
                <ScrollArea className="flex-1 p-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
                      <div className={`text-8xl ${selectedAvatar.animationClass} transition-all duration-500`}>
                        {selectedAvatar.expressions[currentExpression]}
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold">
                          Hello! I'm {selectedAvatar.name}
                        </h3>
                        <p className="text-muted-foreground max-w-md">
                          {selectedAvatar.personality.split('.')[0]}.
                        </p>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            {voiceEnabled ? 'Click the microphone to speak or type a message!' : 'Voice is disabled - type a message to chat!'}
                          </p>
                          {speechRecognition && (
                            <p className="text-xs text-blue-600">
                              Voice recognition is available
                            </p>
                          )}
                          {speechSynthesis && (
                            <p className="text-xs text-green-600">
                              Text-to-speech is available
                            </p>
                          )}
                        </div>
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
                      onClick={isListening ? stopVoiceInput : startVoiceInput}
                      variant={isListening ? "destructive" : "outline"}
                      size="icon"
                      disabled={!speechRecognition || chatMutation.isPending}
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
                    Press Enter to send • {speechRecognition ? 'Click mic to speak' : 'Voice input not available'} • Choose different avatars for unique conversations
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