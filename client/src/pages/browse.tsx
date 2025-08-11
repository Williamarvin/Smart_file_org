import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import SearchBar from "@/components/search-bar";
import FileGrid from "@/components/file-grid";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function Browse() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Unified endpoint: browse all files or search with query
  const { data: files = [], isLoading } = useQuery({
    queryKey: searchQuery ? ["/api/search", searchQuery] : ["/api/search"],
    refetchInterval: 5000,
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => apiRequest(`/api/files/${fileId}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "File deleted successfully",
        description: "The file has been removed from your collection.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting file",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleDeleteFile = (fileId: string) => {
    deleteFileMutation.mutate(fileId);
  };

  const displayFiles = Array.isArray(files) ? files : [];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Browse Files</h1>
        <p className="text-slate-600">Search and manage your document collection</p>
      </div>

      {/* Search Bar */}
      <div className="mb-8">
        <SearchBar 
          onSearch={handleSearch} 
          isLoading={isLoading}
          hasResults={Array.isArray(files) && files.length > 0}
          query={searchQuery}
        />
      </div>

      {/* File Grid */}
      <FileGrid 
        files={displayFiles}
        isLoading={isLoading}
        onDeleteFile={handleDeleteFile}
        isSearchResults={!!searchQuery}
        searchQuery={searchQuery}
      />
    </div>
  );
}