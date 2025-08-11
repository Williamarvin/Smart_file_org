import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Search, Bot, BarChart3 } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Smart Document Organizer
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
            Upload, organize, and chat with your documents using AI-powered analysis. 
            Get intelligent insights and find exactly what you need in seconds.
          </p>
          <Button 
            size="lg" 
            onClick={() => window.location.href = '/api/login'}
            className="px-8 py-3 text-lg"
          >
            Get Started - Sign In
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <Card className="text-center">
            <CardHeader>
              <FileText className="w-12 h-12 mx-auto text-blue-600 dark:text-blue-400 mb-4" />
              <CardTitle>Smart Upload</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Upload PDFs, Word docs, and text files. AI automatically extracts and analyzes content.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Search className="w-12 h-12 mx-auto text-green-600 dark:text-green-400 mb-4" />
              <CardTitle>Semantic Search</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Find documents by meaning, not just keywords. Search by concepts and topics.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Bot className="w-12 h-12 mx-auto text-purple-600 dark:text-purple-400 mb-4" />
              <CardTitle>AI Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Chat with your documents. Ask questions and get answers based on your content.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <BarChart3 className="w-12 h-12 mx-auto text-orange-600 dark:text-orange-400 mb-4" />
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Track usage patterns and discover insights about your document collection.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Benefits Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg">
          <h2 className="text-3xl font-bold text-center mb-8 text-gray-900 dark:text-white">
            Why Choose Smart Document Organizer?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Secure & Private
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Your documents are completely isolated. Each user has their own secure workspace 
                with no cross-user access.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                AI-Powered
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Advanced AI analyzes your documents to extract topics, categories, and key insights
                automatically.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Easy to Use
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Simple drag-and-drop interface. No complex setup required. Start organizing
                your documents immediately.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}