import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import FileUploadZone from "@/components/file-upload-zone";
import FileGrid from "@/components/file-grid";
import SearchBar from "@/components/search-bar";
import QuickStats from "@/components/quick-stats";
import RecentActivity from "@/components/recent-activity";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, FolderOpen } from "lucide-react";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch files
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["/api/files"],
    refetchInterval: 5000, // Refresh every 5 seconds to show processing updates
  });

  // Fetch file stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Search files
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ["/api/search", searchQuery],
    enabled: !!searchQuery,
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest("DELETE", `/api/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "File deleted",
        description: "File has been successfully deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete file. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFileUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    toast({
      title: "File uploaded",
      description: "Your file has been uploaded and is being processed.",
    });
  };

  const handleDeleteFile = (fileId: string) => {
    deleteFileMutation.mutate(fileId);
  };

  const displayFiles = searchQuery
    ? Array.isArray(searchResults)
      ? searchResults
      : []
    : Array.isArray(files)
      ? files
      : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <FolderOpen className="text-blue-500 text-2xl" />
                <h1 className="text-xl font-bold text-slate-800">
                  SmartFile Organizer
                </h1>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button className="text-slate-600 hover:text-slate-800 transition-colors">
                <Bell className="text-lg" />
              </button>
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">JS</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar */}
        <SearchBar
          onSearch={handleSearch}
          isLoading={searchLoading}
          hasResults={Array.isArray(searchResults) && searchResults.length > 0}
          query={searchQuery}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: File Upload and Quick Actions */}
          <div className="lg:col-span-1 space-y-6">
            <FileUploadZone onUploadSuccess={handleFileUploadSuccess} />
            <QuickStats stats={stats as any} />
            <RecentActivity
              files={Array.isArray(files) ? files.slice(0, 5) : []}
            />
          </div>

          {/* Right Column: File Management and Search Results */}
          <div className="lg:col-span-2 space-y-6">
            <FileGrid
              files={displayFiles}
              isLoading={filesLoading || searchLoading}
              onDeleteFile={handleDeleteFile}
              isSearchResults={!!searchQuery}
              searchQuery={searchQuery}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
