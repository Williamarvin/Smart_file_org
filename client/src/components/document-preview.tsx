import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Copy, Download, Maximize2, X } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface DocumentPreviewProps {
  content: string;
  title?: string;
  className?: string;
  isEmbedded?: boolean;
}

export function DocumentPreview({ content, title, className = "", isEmbedded = false }: DocumentPreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    toast({
      title: "Copied",
      description: "Content copied to clipboard",
    });
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'document'}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const PreviewContent = () => (
    <>
      {/* Document Header */}
      <div className="flex items-center justify-between p-4 border-b bg-slate-50">
        <h3 className="font-semibold text-slate-800">
          {title || "Generated Content"}
        </h3>
        <div className="flex items-center space-x-2">
          <Button
            onClick={handleCopy}
            variant="ghost"
            size="sm"
            className="h-8 px-2"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleDownload}
            variant="ghost"
            size="sm"
            className="h-8 px-2"
          >
            <Download className="h-4 w-4" />
          </Button>
          {!isFullscreen && (
            <Button
              onClick={() => setIsFullscreen(true)}
              variant="ghost"
              size="sm"
              className="h-8 px-2"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Document Content */}
      <ScrollArea className={isFullscreen ? "h-[calc(100vh-200px)]" : "h-[400px]"}>
        <div className="p-6 bg-white">
          <div className="prose prose-sm max-w-none font-serif">
            {content.split('\n').map((paragraph, index) => {
              // Handle headers (lines starting with #)
              if (paragraph.startsWith('### ')) {
                return (
                  <h3 key={index} className="text-base font-bold text-slate-800 mt-4 mb-2 font-sans">
                    {paragraph.replace('### ', '')}
                  </h3>
                );
              } else if (paragraph.startsWith('## ')) {
                return (
                  <h2 key={index} className="text-lg font-bold text-slate-900 mt-6 mb-3 font-sans">
                    {paragraph.replace('## ', '')}
                  </h2>
                );
              } else if (paragraph.startsWith('# ')) {
                return (
                  <h1 key={index} className="text-2xl font-bold text-slate-900 mt-6 mb-4 pb-2 border-b border-slate-200 font-sans">
                    {paragraph.replace('# ', '')}
                  </h1>
                );
              }
              // Handle bullet points
              else if (paragraph.trim().startsWith('• ') || paragraph.trim().startsWith('- ') || paragraph.trim().startsWith('* ')) {
                return (
                  <li key={index} className="text-sm text-slate-700 ml-6 mb-2 list-disc">
                    {paragraph.replace(/^[•\-\*]\s*/, '')}
                  </li>
                );
              }
              // Handle numbered lists
              else if (/^\d+\.\s/.test(paragraph.trim())) {
                return (
                  <li key={index} className="text-sm text-slate-700 ml-6 mb-2 list-decimal">
                    {paragraph.replace(/^\d+\.\s*/, '')}
                  </li>
                );
              }
              // Handle bold text with **text**
              else if (paragraph.includes('**')) {
                const parts = paragraph.split(/\*\*(.*?)\*\*/g);
                return (
                  <p key={index} className="text-sm text-slate-700 mb-3">
                    {parts.map((part, i) => 
                      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                    )}
                  </p>
                );
              }
              // Regular paragraphs
              else if (paragraph.trim()) {
                return (
                  <p key={index} className="text-sm text-slate-700 mb-3 leading-relaxed">
                    {paragraph}
                  </p>
                );
              }
              // Empty lines for spacing
              return <div key={index} className="mb-2" />;
            })}
          </div>
        </div>
      </ScrollArea>
    </>
  );

  if (isEmbedded) {
    return (
      <>
        <Card className={`overflow-hidden border border-slate-200 shadow-sm bg-white ${className}`}>
          <PreviewContent />
        </Card>
        
        {/* Fullscreen Dialog */}
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="max-w-4xl h-[90vh] p-0">
            <DialogHeader className="px-6 pt-6">
              <DialogTitle>{title || "Generated Content"}</DialogTitle>
              <Button
                onClick={() => setIsFullscreen(false)}
                variant="ghost"
                size="sm"
                className="absolute right-4 top-4"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogHeader>
            <div className="px-6 pb-6">
              <PreviewContent />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return <PreviewContent />;
}