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

  const formatContent = (text: string) => {
    const lines = text.split('\n');
    const formattedContent = [];
    let inList = false;
    let listItems = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Check if this line is a bullet point or numbered item
      const isBullet = trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*');
      const isNumbered = /^\d+\./.test(trimmedLine);
      const isListItem = isBullet || isNumbered;
      
      // If we were in a list and this isn't a list item, render the accumulated list
      if (inList && !isListItem && trimmedLine !== '') {
        if (listItems.length > 0) {
          formattedContent.push(
            <ul key={`list-${i}`} className="mb-4 ml-2">
              {listItems}
            </ul>
          );
          listItems = [];
        }
        inList = false;
      }
      
      if (isListItem) {
        inList = true;
        let itemText = trimmedLine;
        
        // Remove bullet markers and number prefixes
        if (isBullet) {
          itemText = trimmedLine.replace(/^[•\-\*]\s*/, '');
        } else if (isNumbered) {
          itemText = trimmedLine.replace(/^\d+\.\s*/, '');
        }
        
        listItems.push(
          <li key={`item-${i}`} className="flex items-start mb-2">
            <span className="text-gray-500 mr-3 mt-1">•</span>
            <span className="text-base text-gray-800 leading-relaxed">{itemText}</span>
          </li>
        );
      } else if (trimmedLine === '') {
        // Empty line - add spacing
        if (inList && listItems.length > 0) {
          formattedContent.push(
            <ul key={`list-${i}`} className="mb-4 ml-2">
              {listItems}
            </ul>
          );
          listItems = [];
          inList = false;
        }
        formattedContent.push(<div key={`space-${i}`} className="mb-3" />);
      } else {
        // Regular paragraph - check if it looks like a header or title
        const isTitle = i === 0 || (trimmedLine.length < 100 && trimmedLine === trimmedLine.toUpperCase());
        const isSection = trimmedLine.endsWith(':') && trimmedLine.length < 100;
        
        if (isTitle && i === 0) {
          formattedContent.push(
            <h1 key={`title-${i}`} className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-gray-200">
              {trimmedLine}
            </h1>
          );
        } else if (isSection) {
          formattedContent.push(
            <h2 key={`section-${i}`} className="text-lg font-semibold text-gray-800 mt-6 mb-3">
              {trimmedLine}
            </h2>
          );
        } else {
          formattedContent.push(
            <p key={`para-${i}`} className="text-base text-gray-800 mb-4 leading-relaxed">
              {trimmedLine}
            </p>
          );
        }
      }
    }
    
    // Handle any remaining list items
    if (listItems.length > 0) {
      formattedContent.push(
        <ul key="list-final" className="mb-4 ml-2">
          {listItems}
        </ul>
      );
    }
    
    return formattedContent;
  };

  const PreviewContent = () => (
    <>
      {/* Document Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-800 text-lg">
          {title || "Document Preview"}
        </h3>
        <div className="flex items-center space-x-2">
          <Button
            onClick={handleCopy}
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-gray-600 hover:text-gray-900"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleDownload}
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-gray-600 hover:text-gray-900"
          >
            <Download className="h-4 w-4" />
          </Button>
          {!isFullscreen && (
            <Button
              onClick={() => setIsFullscreen(true)}
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-gray-600 hover:text-gray-900"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Document Content - PDF-like styling */}
      <ScrollArea className={isFullscreen ? "h-[calc(100vh-200px)]" : "h-[500px]"}>
        <div className="px-12 py-10 bg-white" style={{ minHeight: '600px' }}>
          <div className="max-w-4xl mx-auto">
            {formatContent(content)}
          </div>
        </div>
      </ScrollArea>
    </>
  );

  if (isEmbedded) {
    return (
      <>
        <Card className={`overflow-hidden border border-gray-300 shadow-lg bg-white ${className}`} 
              style={{ boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
          <PreviewContent />
        </Card>
        
        {/* Fullscreen Dialog */}
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="max-w-5xl h-[90vh] p-0">
            <DialogHeader className="px-6 pt-6">
              <DialogTitle className="text-xl">{title || "Document Preview"}</DialogTitle>
              <Button
                onClick={() => setIsFullscreen(false)}
                variant="ghost"
                size="sm"
                className="absolute right-4 top-4"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogHeader>
            <div className="pb-6">
              <PreviewContent />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return <PreviewContent />;
}