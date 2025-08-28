import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Folder, FolderPlus, ChevronRight, Home, Search, Plus, MoreHorizontal, Trash2, Edit3, Move, CheckSquare, Square, Filter, Loader2 } from "lucide-react";
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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

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

// Recursively count all files in a folder and its subfolders using actual file data
function countAllFilesInFolder(folder: FolderType, allFolders: FolderType[], allFiles: any[]): number {
  // Count files directly in this folder by checking folderId
  let totalFiles = allFiles.filter(f => f && f.folderId === folder.id).length;
  
  // Find all subfolders and count their files recursively
  const subfolders = allFolders.filter(f => f && f.parentId === folder.id);
  for (const subfolder of subfolders) {
    totalFiles += countAllFilesInFolder(subfolder, allFolders, allFiles);
  }
  
  return totalFiles;
}

// Count total folders recursively
function countAllFoldersInFolder(folder: FolderType, allFolders: FolderType[]): number {
  // Find all direct subfolders (with null check)
  const subfolders = allFolders.filter(f => f && f.parentId === folder.id);
  let totalFolders = subfolders.length;
  
  // Count subfolders recursively
  for (const subfolder of subfolders) {
    totalFolders += countAllFoldersInFolder(subfolder, allFolders);
  }
  
  return totalFolders;
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
  const [folderFileCounts, setFolderFileCounts] = useState<Record<string, {
    totalFiles: number;
    processedFiles: number;
    errorFiles: number;
    transcribedFiles: number;
    pendingFiles: number;
    processingFiles: number;
    filteredFiles: number;
    folderName: string;
  }>>({});
  const [isProblematicDialogOpen, setIsProblematicDialogOpen] = useState(false);
  const [problematicFiles, setProblematicFiles] = useState<any>({ 
    total: 0, 
    files: [], 
    categories: {} 
  });
  const [isLoadingProblematic, setIsLoadingProblematic] = useState(false);
  const [isFixingProblematic, setIsFixingProblematic] = useState(false);
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

  // Get files in current folder with pagination
  const { data: folderFiles = [], isLoading: filesLoading } = useQuery({
    queryKey: ["/api/folders", currentFolderId, "files"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/folders/${currentFolderId || 'root'}/files`);
      return res.json();
    },
    enabled: !searchQuery, // Only load folder files when not searching
  });

  // Get all files with infinite scroll
  const {
    data: allFilesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: allFilesLoading,
  } = useInfiniteQuery({
    queryKey: ["/api/files", "infinite", activeFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await apiRequest("GET", `/api/files?limit=50&offset=${pageParam}`);
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      // If the last page has 50 items, there might be more
      if (lastPage.length === 50) {
        return allPages.length * 50;
      }
      return undefined;
    },
    initialPageParam: 0,
  });

  // Flatten all pages of files into a single array
  const allFiles = allFilesData?.pages?.flat() || [];

  // Observer for infinite scroll
  const observerTarget = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Fetch folder file counts for ALL folders
  useEffect(() => {
    const fetchFolderCounts = async () => {
      // Use allFolders if available, otherwise use current level folders
      const foldersToCount = allFolders.length > 0 ? allFolders : folders;
      if (foldersToCount.length === 0) return;
      
      try {
        const response = await fetch("/api/folders/file-counts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            folderIds: foldersToCount.map((f: any) => f.id),
            filter: activeFilter
          }),
        });
        
        if (response.ok) {
          const counts = await response.json();
          setFolderFileCounts(counts);
        }
      } catch (error) {
        console.error("Error fetching folder counts:", error);
      }
    };
    
    fetchFolderCounts();
  }, [folders, allFolders, activeFilter]);

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

  // Fetch problematic files
  const fetchProblematicFiles = async () => {
    setIsLoadingProblematic(true);
    try {
      const response = await fetch("/api/files/problematic");
      if (!response.ok) throw new Error("Failed to fetch problematic files");
      const data = await response.json();
      setProblematicFiles(data);
    } catch (error) {
      console.error("Error fetching problematic files:", error);
      toast({
        title: "Error",
        description: "Failed to fetch problematic files",
        variant: "destructive",
      });
    } finally {
      setIsLoadingProblematic(false);
    }
  };

  // Fix all problematic files
  const handleFixAllProblematic = async () => {
    setIsFixingProblematic(true);
    try {
      const response = await fetch("/api/files/fix-problematic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fixAll: true }),
      });
      
      if (!response.ok) throw new Error("Failed to fix problematic files");
      
      const result = await response.json();
      toast({
        title: "Success",
        description: result.message,
      });
      
      // Close dialog and refresh files
      setIsProblematicDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    } catch (error) {
      console.error("Error fixing problematic files:", error);
      toast({
        title: "Error",
        description: "Failed to fix problematic files",
        variant: "destructive",
      });
    } finally {
      setIsFixingProblematic(false);
    }
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
    if (!files || !Array.isArray(files)) {
      console.log("applyFilters: no files or not array", files);
      return [];
    }
    
    console.log(`applyFilters: Processing ${files.length} files with filter: ${activeFilter}`);
    
    switch (activeFilter) {
      case "transcribed":
        const transcribedFiles = files.filter(file => {
          const hasMetadata = file.metadata?.extractedText;
          const notPlaceholder = file.metadata?.extractedText && !file.metadata.extractedText.startsWith('File reference:');
          const hasLength = file.metadata?.extractedText && file.metadata.extractedText.length > 100;
          const isCompleted = file.processingStatus === 'completed';
          
          const passes = hasMetadata && notPlaceholder && hasLength && isCompleted;
          
          if (!passes) {
            console.log(`File ${file.originalName} filtered out:`, {
              hasMetadata: !!hasMetadata,
              notPlaceholder: !!notPlaceholder, 
              hasLength: !!hasLength,
              isCompleted: !!isCompleted,
              extractedTextLength: file.metadata?.extractedText?.length || 0
            });
          }
          
          return passes;
        });
        console.log(`Transcribed filter: ${transcribedFiles.length} of ${files.length} files passed`);
        return transcribedFiles;
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

  // Use allFiles when not searching and not in a specific folder
  const rawDisplayFiles = searchQuery 
    ? searchResults 
    : (currentFolderId ? folderFiles : allFiles);
  const displayFiles = applyFilters(rawDisplayFiles);
  const isLoading = searchQuery 
    ? searchLoading 
    : (currentFolderId ? (foldersLoading || filesLoading) : allFilesLoading);

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
          onClick={() => {
            console.log("Transcribed filter clicked");
            // Invalidate queries to ensure fresh data
            queryClient.invalidateQueries({ queryKey: ['/api/files'] });
            setActiveFilter("transcribed");
          }}
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
            
            {/* Fix Problematic Files Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchProblematicFiles();
                setIsProblematicDialogOpen(true);
              }}
              className="bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border-yellow-300"
            >
              <Filter className="h-4 w-4 mr-2" />
              Fix Files
            </Button>

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

      {/* Problematic Files Dialog */}
      <Dialog open={isProblematicDialogOpen} onOpenChange={setIsProblematicDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fix Problematic Files</DialogTitle>
            <DialogDescription>
              Files with incomplete or placeholder content detected. These files need to be re-processed to extract their actual content.
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingProblematic ? (
            <div className="py-8 text-center text-gray-500">
              Loading problematic files...
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {problematicFiles.total > 0 ? (
                <>
                  <Alert>
                    <AlertTitle>Found {problematicFiles.total} problematic files</AlertTitle>
                    <AlertDescription className="mt-2 space-y-1">
                      <div>• Files with placeholder text: {problematicFiles.categories?.placeholderText || 0}</div>
                      <div>• Files with empty extraction: {problematicFiles.categories?.emptyExtraction || 0}</div>
                      <div>• Google Drive files needing re-download: {problematicFiles.categories?.googleDriveFiles || 0}</div>
                    </AlertDescription>
                  </Alert>
                  
                  <div className="border rounded-lg p-4 space-y-2">
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Files to be fixed:</h4>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {problematicFiles.files?.slice(0, 20).map((file: any) => (
                        <div key={file.id} className="text-sm text-gray-600 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {file.processingStatus}
                          </Badge>
                          <span className="truncate" title={file.filename}>{file.filename}</span>
                        </div>
                      ))}
                      {problematicFiles.total > 20 && (
                        <div className="text-sm text-gray-500 italic">
                          ...and {problematicFiles.total - 20} more files
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <Alert>
                  <AlertTitle>No problematic files found</AlertTitle>
                  <AlertDescription>
                    All files appear to have been processed correctly.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProblematicDialogOpen(false)}>
              Close
            </Button>
            {problematicFiles.total > 0 && (
              <Button 
                onClick={handleFixAllProblematic}
                disabled={isFixingProblematic}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isFixingProblematic ? "Fixing Files..." : `Fix All ${problematicFiles.total} Files`}
              </Button>
            )}
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
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {folderFileCounts[folder.id] ? (
                        <>
                          {activeFilter === "all" ? (
                            // Show regular counts when no filter is active
                            <>
                              <Badge variant="outline" className="text-xs">
                                {folderFileCounts[folder.id].totalFiles} files
                              </Badge>
                              {folderFileCounts[folder.id].processedFiles > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {folderFileCounts[folder.id].processedFiles} processed
                                </Badge>
                              )}
                              {folderFileCounts[folder.id].errorFiles > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {folderFileCounts[folder.id].errorFiles} errors
                                </Badge>
                              )}
                            </>
                          ) : (
                            // Show filtered counts when a filter is active
                            <>
                              <Badge 
                                variant={activeFilter === "transcribed" ? "secondary" : 
                                        activeFilter === "pending" ? "outline" :
                                        activeFilter === "processing" ? "outline" :
                                        "destructive"}
                                className={activeFilter === "transcribed" ? "bg-green-100 text-green-800" :
                                          activeFilter === "pending" ? "bg-yellow-100 text-yellow-800" :
                                          activeFilter === "processing" ? "bg-blue-100 text-blue-800" :
                                          "bg-red-100 text-red-800"}
                              >
                                {folderFileCounts[folder.id].filteredFiles}/{folderFileCounts[folder.id].totalFiles}
                                {activeFilter === "transcribed" ? " transcribed" :
                                 activeFilter === "pending" ? " pending" :
                                 activeFilter === "processing" ? " processing" :
                                 " failed"}
                              </Badge>
                            </>
                          )}
                          <span className="text-slate-500">{Array.isArray(allFolders) ? countAllFoldersInFolder(folder, allFolders as FolderType[]) : 0} folders</span>
                        </>
                      ) : (
                        <>
                          <span className="text-slate-500">{Array.isArray(allFolders) ? countAllFoldersInFolder(folder, allFolders as FolderType[]) : 0} folders</span>
                          <span className="text-slate-500">{folderFileCounts[folder.id]?.totalFiles || 0} files</span>
                        </>
                      )}
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
        
        {/* Infinite Scroll Trigger - only show when not searching and not in a specific folder */}
        {!searchQuery && !currentFolderId && (
          <>
            {/* Loading more indicator */}
            {isFetchingNextPage && (
              <div className="mt-4 flex justify-center items-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
                <span className="text-slate-600">Loading more files...</span>
              </div>
            )}
            
            {/* Load More Button (manual trigger) */}
            {hasNextPage && !isFetchingNextPage && (
              <div className="mt-4 flex justify-center">
                <Button
                  onClick={() => fetchNextPage()}
                  variant="outline"
                  size="lg"
                  className="px-8"
                >
                  Load More Files
                </Button>
              </div>
            )}
            
            {/* Invisible scroll trigger */}
            <div ref={observerTarget} className="h-10" />
          </>
        )}
      </div>
    </div>
  );
}