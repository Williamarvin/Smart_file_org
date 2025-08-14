import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, FileText, Brain, Copy, Download, Wand2 } from "lucide-react";

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
  const [generatedContent, setGeneratedContent] = useState("");
  const [generationType, setGenerationType] = useState("summary");
  const { toast } = useToast();

  // Fetch available files
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["/api/files"],
  });

  // Content generation mutation
  const generateMutation = useMutation({
    mutationFn: async ({ prompt, fileIds, type }: { prompt: string; fileIds: string[]; type: string }) => {
      const response = await apiRequest("POST", "/api/generate-content", { prompt, fileIds, type });
      return response.json();
    },
    onSuccess: (data: any) => {
      setGeneratedContent(data.content);
      toast({
        title: "Content Generated",
        description: "AI has successfully generated new content based on your files.",
      });
    },
    onError: (error) => {
      console.error("Generation error:", error);
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

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt Required",
        description: "Please enter a prompt for content generation.",
        variant: "destructive",
      });
      return;
    }

    if (selectedFiles.length === 0) {
      toast({
        title: "Files Required",
        description: "Please select at least one file to generate content from.",
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({
      prompt: prompt.trim(),
      fileIds: selectedFiles,
      type: generationType,
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

            {/* File Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="text-blue-600" />
                  <span>Select Files ({selectedFiles.length} selected)</span>
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
                  <span>Content Prompt</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Describe what you want to generate based on your selected files... For example: 'Create a comprehensive summary of the main points' or 'Generate action items and recommendations'"
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
                    disabled={generateMutation.isPending || !prompt.trim() || selectedFiles.length === 0}
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
                    <div className="animate-pulse">
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} className="h-4 bg-slate-200 rounded w-full"></div>
                        ))}
                      </div>
                    </div>
                    <p className="text-center text-slate-600">AI is analyzing your files and generating content...</p>
                  </div>
                ) : generatedContent ? (
                  <div className="prose prose-slate max-w-none">
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