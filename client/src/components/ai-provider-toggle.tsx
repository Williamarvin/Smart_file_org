import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, Bot, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProviderStatus {
  currentProvider: 'openai' | 'dify';
  providers: {
    openai: {
      available: boolean;
      configured: boolean;
    };
    dify: {
      available: boolean;
      configured: boolean;
      status?: {
        configured: boolean;
        baseUrl?: string;
      };
    };
  };
}

export function AIProviderToggle({ className = "" }: { className?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current provider status
  const { data: providerStatus, isLoading } = useQuery<ProviderStatus>({
    queryKey: ['/api/providers/status'],
    queryFn: async () => {
      const response = await fetch('/api/providers/status');
      if (!response.ok) throw new Error('Failed to fetch provider status');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Switch provider mutation
  const switchProviderMutation = useMutation({
    mutationFn: async (provider: 'openai' | 'dify') => {
      const response = await apiRequest('POST', '/api/providers/switch', { provider });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/providers/status'] });
      toast({
        title: "Provider switched",
        description: `Successfully switched to ${providerStatus?.currentProvider === 'openai' ? 'Dify (with MCP)' : 'OpenAI'}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error switching provider",
        description: error.message || "Failed to switch AI provider",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (checked: boolean) => {
    const newProvider = checked ? 'dify' : 'openai';
    switchProviderMutation.mutate(newProvider);
  };

  if (isLoading || !providerStatus) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const isDify = providerStatus.currentProvider === 'dify';
  const isConfigured = providerStatus.providers.dify.configured;

  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg border bg-card ${className}`}>
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <Label htmlFor="ai-provider" className="text-sm font-medium cursor-pointer">
          OpenAI
        </Label>
      </div>
      
      <Switch
        id="ai-provider"
        checked={isDify}
        onCheckedChange={handleToggle}
        disabled={switchProviderMutation.isPending || !isConfigured}
      />
      
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <Label htmlFor="ai-provider" className="text-sm font-medium cursor-pointer">
          Dify
        </Label>
        {isDify && (
          <Badge variant="secondary" className="text-xs">
            MCP
          </Badge>
        )}
      </div>

      {!isConfigured && (
        <Badge variant="outline" className="text-xs text-muted-foreground ml-2">
          Dify not configured
        </Badge>
      )}
    </div>
  );
}

export function AIProviderInfo() {
  const { data: providerStatus } = useQuery<ProviderStatus>({
    queryKey: ['/api/providers/status'],
  });

  if (!providerStatus) return null;

  const isDify = providerStatus.currentProvider === 'dify';

  return (
    <Card className="p-3 bg-muted/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isDify ? <Sparkles className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          <span className="text-sm font-medium">
            {isDify ? 'Dify AI' : 'OpenAI'}
          </span>
        </div>
        {isDify && (
          <Badge variant="secondary" className="text-xs">
            MCP Tools Enabled
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {isDify 
          ? 'Using Dify with Model Context Protocol - external tools available'
          : 'Using OpenAI GPT-4 - fast direct responses'}
      </p>
    </Card>
  );
}