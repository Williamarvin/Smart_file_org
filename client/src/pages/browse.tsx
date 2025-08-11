import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Folder, FolderPlus, ChevronRight, Home, Search, Plus, MoreHorizontal, Trash2, Edit3, Move } from "lucide-react";
import SearchBar from "@/components/search-bar";
import FileGrid from "@/components/file-grid";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface FolderType {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  color?: string;
  description?: string;
  children: FolderType[];
  files: any[];
}

export function Browse() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get folders for current level
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["/api/folders", currentFolderId],
    queryFn: () => apiRequest(`/api/folders?parentId=${currentFolderId || 'null'}`),
  });

  // Get files in current folder
  const { data: folderFiles = [], isLoading: filesLoading } = useQuery({
    queryKey: ["/api/folders", currentFolderId, "files"],
    queryFn: () => apiRequest(`/api/folders/${currentFolderId || 'root'}/files`),
    enabled: !searchQuery, // Only load folder files when not searching
  });

  // Search files across all folders
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ["/api/search", searchQuery],
    queryFn: () => apiRequest(`/api/search?query=${encodeURIComponent(searchQuery)}`),
    enabled: !!searchQuery,
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: (folderData: { name: string; parentId?: string | null; description?: string }) =>
      apiRequest("/api/folders", "POST", folderData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setIsCreateFolderOpen(false);
      setNewFolderName("");
      setNewFolderDescription("");
      toast({
        title: "Folder created",
        description: "Your new folder has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating folder",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => apiRequest(`/api/files/${fileId}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
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

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => apiRequest(`/api/folders/${folderId}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      toast({
        title: "Folder deleted",
        description: "The folder and its contents have been moved to the root level.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting folder",
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

  const handleDeleteFolder = (folderId: string) => {
    deleteFolderMutation.mutate(folderId);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    
    createFolderMutation.mutate({
      name: newFolderName.trim(),
      parentId: currentFolderId,
      description: newFolderDescription.trim() || undefined,
    });
  };

  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSearchQuery(""); // Clear search when navigating
  };

  // Build breadcrumb path
  const buildBreadcrumb = () => {
    if (!currentFolderId) return [{ name: "Root", id: null }];
    
    // For now, just show current folder name - in a full implementation,
    // we'd build the full path from the folder hierarchy
    const currentFolder = folders.find(f => f.id === currentFolderId);
    return [
      { name: "Root", id: null },
      ...(currentFolder ? [{ name: currentFolder.name, id: currentFolder.id }] : [])
    ];
  };

  const displayFiles = searchQuery ? searchResults : folderFiles;
  const isLoading = searchQuery ? searchLoading : (foldersLoading || filesLoading);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Browse Files</h1>
        <p className="text-slate-600">Organize and search your document collection</p>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <SearchBar 
          onSearch={handleSearch} 
          isLoading={isLoading}
          hasResults={Array.isArray(displayFiles) && displayFiles.length > 0}
          query={searchQuery}
        />
      </div>

      {/* Navigation and Actions */}
      {!searchQuery && (
        <div className="mb-6 flex items-center justify-between">
          {/* Breadcrumb */}
          <div className="flex items-center space-x-2 text-sm text-slate-600">
            <Home className="h-4 w-4" />
            {buildBreadcrumb().map((item, index) => (
              <div key={item.id || 'root'} className="flex items-center space-x-2">
                {index > 0 && <ChevronRight className="h-4 w-4" />}
                <button
                  onClick={() => navigateToFolder(item.id)}
                  className="hover:text-slate-900 hover:underline"
                >
                  {item.name}
                </button>
              </div>
            ))}
          </div>

          {/* Create Folder Button */}
          <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FolderPlus className="h-4 w-4 mr-2" />
                New Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
                <DialogDescription>
                  Create a new folder to organize your files.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="folder-name">Folder Name</Label>
                  <Input
                    id="folder-name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Enter folder name..."
                  />
                </div>
                <div>
                  <Label htmlFor="folder-description">Description (optional)</Label>
                  <Textarea
                    id="folder-description"
                    value={newFolderDescription}
                    onChange={(e) => setNewFolderDescription(e.target.value)}
                    placeholder="Describe what this folder contains..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || createFolderMutation.isPending}
                >
                  Create Folder
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Folders Grid */}
      {!searchQuery && folders.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Folders</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {folders.map((folder: FolderType) => (
              <Card key={folder.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-start justify-between">
                  <div 
                    className="flex-1"
                    onClick={() => navigateToFolder(folder.id)}
                  >
                    <div className="flex items-center space-x-3 mb-2">
                      <Folder className="h-8 w-8 text-blue-500" />
                      <div>
                        <h4 className="font-medium text-slate-900">{folder.name}</h4>
                        {folder.description && (
                          <p className="text-sm text-slate-600 mt-1">{folder.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-slate-500">
                      <span>{folder.children.length} folders</span>
                      <span>{folder.files.length} files</span>
                    </div>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigateToFolder(folder.id)}>
                        <Folder className="h-4 w-4 mr-2" />
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDeleteFolder(folder.id)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Files Grid */}
      <div>
        {searchQuery && (
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            Search Results {searchResults.length > 0 && `(${searchResults.length})`}
          </h3>
        )}
        <FileGrid 
          files={Array.isArray(displayFiles) ? displayFiles : []}
          isLoading={isLoading}
          onDeleteFile={handleDeleteFile}
          isSearchResults={!!searchQuery}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}