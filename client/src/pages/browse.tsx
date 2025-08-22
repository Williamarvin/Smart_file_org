import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Folder, FolderPlus, ChevronRight, Home, Search, Plus, MoreHorizontal, Trash2, Edit3, Move, CheckSquare, Square, Filter } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectedMoveFolder, setSelectedMoveFolder] = useState<string>("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get folders for current level
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["/api/folders", currentFolderId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/folders?parentId=${currentFolderId || 'null'}`);
      return res.json();
    },
  });

  // Get all folders for move dialog
  const { data: allFolders = [] } = useQuery({
    queryKey: ["/api/folders", "all"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/folders/all");
      return res.json();
    },
  });

  // Get files in current folder
  const { data: folderFiles = [], isLoading: filesLoading } = useQuery({
    queryKey: ["/api/folders", currentFolderId, "files"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/folders/${currentFolderId || 'root'}/files`);
      return res.json();
    },
    enabled: !searchQuery, // Only load folder files when not searching
  });

  // Get all files for global select all functionality
  const { data: allFiles = [] } = useQuery({
    queryKey: ["/api/files"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/files");
      return res.json();
    },
  });

  // Search files across all folders
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ["/api/search", searchQuery],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/search/${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: !!searchQuery,
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: (folderData: { name: string; parentId?: string | null; description?: string }) =>
      apiRequest("POST", "/api/folders", folderData),
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
    mutationFn: (fileId: string) => apiRequest("DELETE", `/api/files/${fileId}`),
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

  // Retry processing mutation
  const retryProcessingMutation = useMutation({
    mutationFn: (fileId: string) => apiRequest("POST", `/api/files/${fileId}/retry-processing`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Processing restarted",
        description: "The file will be processed again. This may take a few minutes.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error retrying processing",
        description: error.message || "Could not restart processing",
        variant: "destructive",
      });
    },
  });

  // Mark file as failed mutation
  const markFailedMutation = useMutation({
    mutationFn: (fileId: string) => apiRequest("POST", `/api/files/${fileId}/mark-failed`, {
      reason: "Processing timeout - marked as failed by user"
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "File marked as failed",
        description: "The file has been marked as failed and won't be processed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error marking file as failed",
        description: error.message || "Could not mark file as failed",
        variant: "destructive",
      });
    },
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => apiRequest("DELETE", `/api/folders/${folderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Folder deleted",
        description: "The folder and all its contents have been permanently removed.",
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

  // Move files mutation (supports multiple files)
  const moveFilesMutation = useMutation({
    mutationFn: async ({ fileIds, folderId }: { fileIds: string[]; folderId: string | null }) => {
      // Move files one by one
      const results = await Promise.all(
        fileIds.map(fileId => 
          apiRequest("PUT", `/api/files/${fileId}/move`, { folderId })
        )
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      setIsMoveDialogOpen(false);
      setSelectedFileIds(new Set());
      setSelectedMoveFolder("");
      setIsSelectionMode(false);
      toast({
        title: "Files moved",
        description: `Successfully moved ${selectedFileIds.size} file${selectedFileIds.size > 1 ? 's' : ''}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error moving files",
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

  const handleRetryProcessing = (fileId: string) => {
    retryProcessingMutation.mutate(fileId);
  };

  const handleMarkFailed = (fileId: string) => {
    markFailedMutation.mutate(fileId);
  };

  const handleDeleteFolder = (folderId: string) => {
    deleteFolderMutation.mutate(folderId);
  };

  const handleMoveFile = (fileId: string) => {
    setSelectedFileIds(new Set([fileId]));
    setIsMoveDialogOpen(true);
  };

  const handleMoveSelectedFiles = () => {
    if (selectedFileIds.size === 0) return;
    setIsMoveDialogOpen(true);
  };

  const handleConfirmMove = () => {
    if (selectedFileIds.size === 0 || selectedMoveFolder === "") return;
    
    moveFilesMutation.mutate({
      fileIds: Array.from(selectedFileIds),
      folderId: selectedMoveFolder === "root" ? null : selectedMoveFolder,
    });
  };

  const handleSelectFile = (fileId: string) => {
    const newSelected = new Set(selectedFileIds);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFileIds(newSelected);
  };

  const handleSelectAll = () => {
    const allFileIds = Array.isArray(displayFiles) ? displayFiles.map(f => f.id) : [];
    setSelectedFileIds(new Set(allFileIds));
  };

  const handleSelectAllGlobal = () => {
    const allGlobalFileIds = Array.isArray(allFiles) ? allFiles.map(f => f.id) : [];
    setSelectedFileIds(new Set(allGlobalFileIds));
  };

  const handleClearSelection = () => {
    setSelectedFileIds(new Set());
    setIsSelectionMode(false);
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
    setActiveFilter("all"); // Reset filter when navigating
  };

  // Build breadcrumb path
  const buildBreadcrumb = () => {
    if (!currentFolderId) return [{ name: "Root", id: null }];
    
    // For now, just show current folder name - in a full implementation,
    // we'd build the full path from the folder hierarchy
    const foldersArray = Array.isArray(folders) ? folders : [];
    const currentFolder = foldersArray.find((f: FolderType) => f.id === currentFolderId);
    return [
      { name: "Root", id: null },
      ...(currentFolder ? [{ name: currentFolder.name, id: currentFolder.id }] : [])
    ];
  };

  // Apply filters to the files
  const applyFilters = (files: any[]) => {
    if (!files || !Array.isArray(files)) return [];
    
    switch (activeFilter) {
      case "transcribed":
        return files.filter(file => 
          file.metadata?.extractedText && 
          !file.metadata.extractedText.startsWith('File reference:') &&
          file.metadata.extractedText.length > 100 &&
          file.processingStatus === 'completed'
        );
      case "pending":
        return files.filter(file => file.processingStatus === 'pending');
      case "processing":
        return files.filter(file => file.processingStatus === 'processing');
      case "failed":
        return files.filter(file => file.processingStatus === 'error' || file.processingStatus === 'failed');
      case "all":
      default:
        return files;
    }
  };

  const rawDisplayFiles = searchQuery ? searchResults : folderFiles;
  const displayFiles = applyFilters(rawDisplayFiles);
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

      {/* Filter Buttons */}
      <div className="mb-6 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-600" />
          <span className="text-sm text-slate-600 font-medium">Filter:</span>
        </div>
        <Button
          variant={activeFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveFilter("all")}
        >
          All Files
        </Button>
        <Button
          variant={activeFilter === "transcribed" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveFilter("transcribed")}
          className="bg-green-50 hover:bg-green-100 text-green-800 border-green-300 data-[state=on]:bg-green-600 data-[state=on]:text-white"
        >
          ✓ Transcribed
        </Button>
        <Button
          variant={activeFilter === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveFilter("pending")}
          className="bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border-yellow-300 data-[state=on]:bg-yellow-600 data-[state=on]:text-white"
        >
          ⏳ Pending
        </Button>
        <Button
          variant={activeFilter === "processing" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveFilter("processing")}
          className="bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-300 data-[state=on]:bg-blue-600 data-[state=on]:text-white"
        >
          🔄 Processing
        </Button>
        <Button
          variant={activeFilter === "failed" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveFilter("failed")}
          className="bg-red-50 hover:bg-red-100 text-red-800 border-red-300 data-[state=on]:bg-red-600 data-[state=on]:text-white"
        >
          ❌ Failed
        </Button>
        
        {activeFilter !== "all" && (
          <Badge variant="secondary" className="ml-2">
            {Array.isArray(displayFiles) ? displayFiles.length : 0} files
          </Badge>
        )}
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

          {/* Action Controls */}
          <div className="flex gap-2">
            {/* Selection Mode Controls */}
            {isSelectionMode ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!displayFiles || displayFiles.length === 0}
                    >
                      Select All ▼
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={handleSelectAll}>
                      Select in Current View ({displayFiles?.length || 0})
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSelectAllGlobal}>
                      Select All Files ({allFiles?.length || 0})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline" 
                  size="sm"
                  onClick={handleClearSelection}
                >
                  Clear ({selectedFileIds.size})
                </Button>
                <Button
                  onClick={handleMoveSelectedFiles}
                  disabled={selectedFileIds.size === 0}
                  size="sm"
                >
                  <Move className="w-4 h-4 mr-2" />
                  Move Selected
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsSelectionMode(true)}
                  size="sm"
                  disabled={!displayFiles || displayFiles.length === 0}
                >
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Select Files
                </Button>
              </>
            )}
            
            {/* Delete All Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const confirm = window.confirm(
                  "⚠️ DELETE EVERYTHING?\n\n" +
                  "This will permanently delete ALL files and folders.\n" +
                  "This action cannot be undone!"
                );
                
                if (confirm) {
                  const doubleConfirm = window.confirm(
                    "Are you absolutely sure?\n\n" +
                    "All your files and folders will be permanently deleted."
                  );
                  
                  if (doubleConfirm) {
                    try {
                      const res = await apiRequest("DELETE", "/api/reset-all");
                      const result = await res.json();
                      
                      toast({
                        title: "All Data Deleted",
                        description: `Deleted ${result.filesDeleted} files and ${result.foldersDeleted} folders`,
                      });
                      
                      // Refresh everything
                      queryClient.invalidateQueries();
                      setCurrentFolderId(null);
                      setSelectedFileIds(new Set());
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to delete all data",
                        variant: "destructive",
                      });
                    }
                  }
                }
              }}
              className="bg-red-50 hover:bg-red-100 text-red-800 border-red-300"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All
            </Button>
            
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
        </div>
      )}

      {/* Move File Dialog */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedFileIds.size} File{selectedFileIds.size > 1 ? 's' : ''} to Folder</DialogTitle>
            <DialogDescription>
              Choose a destination folder for the selected file{selectedFileIds.size > 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="moveFolder">Destination Folder</Label>
            <Select value={selectedMoveFolder} onValueChange={setSelectedMoveFolder}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select a folder..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Root (No folder)</SelectItem>
                {Array.isArray(allFolders) && allFolders.map((folder: FolderType) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    📁 {folder.path || folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmMove}
              disabled={!selectedMoveFolder || moveFilesMutation.isPending}
            >
              {moveFilesMutation.isPending ? "Moving..." : `Move ${selectedFileIds.size} File${selectedFileIds.size > 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folders Grid */}
      {!searchQuery && Array.isArray(folders) && folders.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Folders</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {(Array.isArray(folders) ? folders : []).map((folder: FolderType) => (
              <Card key={folder.id} className="p-4 hover:shadow-md transition-shadow group relative overflow-visible">
                <div className="flex items-start justify-between">
                  <div 
                    className="flex-1 cursor-pointer min-w-0 pr-2"
                    onClick={() => navigateToFolder(folder.id)}
                  >
                    <div className="flex items-center space-x-3 mb-2">
                      <Folder className="h-8 w-8 text-blue-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-slate-900 truncate" title={folder.name}>{folder.name}</h4>
                        {folder.description && (
                          <p className="text-sm text-slate-600 mt-1 line-clamp-2">{folder.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-slate-500">
                      <span>{folder.children.length} folders</span>
                      <span>{folder.files.length} files</span>
                    </div>
                  </div>
                  
                  <div className="flex-shrink-0 ml-2 relative z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" side="bottom" className="z-50">
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
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Files Grid */}
      <div>
        {searchQuery ? (
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            Search Results {Array.isArray(displayFiles) && displayFiles.length > 0 && `(${displayFiles.length})`}
          </h3>
        ) : activeFilter !== "all" ? (
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            {activeFilter === "transcribed" && "Transcribed Files"}
            {activeFilter === "pending" && "Pending Files"}
            {activeFilter === "processing" && "Processing Files"}
            {activeFilter === "failed" && "Failed Files"}
            {Array.isArray(displayFiles) && displayFiles.length > 0 && ` (${displayFiles.length})`}
          </h3>
        ) : null}
        <FileGrid 
          files={Array.isArray(displayFiles) ? displayFiles : []}
          isLoading={isLoading}
          onDeleteFile={handleDeleteFile}
          onMoveFile={handleMoveFile}
          onRetryProcessing={handleRetryProcessing}
          onMarkFailed={handleMarkFailed}
          isSearchResults={!!searchQuery}
          searchQuery={searchQuery}
          isSelectionMode={isSelectionMode}
          selectedFileIds={selectedFileIds}
          onSelectFile={handleSelectFile}
        />
      </div>
    </div>
  );
}