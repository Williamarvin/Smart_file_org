import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, FileText, Calendar, Tags } from "lucide-react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  hasResults?: boolean;
  query?: string;
}

export default function SearchBar({
  onSearch,
  isLoading,
  hasResults,
  query,
}: SearchBarProps) {
  const [searchQuery, setSearchQuery] = useState(query || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Debounced search - search automatically after 500ms of no typing
    setTimeout(() => {
      if (value === searchQuery) {
        onSearch(value);
      }
    }, 500);
  };

  return (
    <div className="mb-8">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <Input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg bg-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
            placeholder="Search files by content, keywords, or metadata..."
            value={searchQuery}
            onChange={handleInputChange}
          />
          {isLoading && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            </div>
          )}
        </div>
      </form>

      {/* Advanced Search Filters */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="secondary" className="flex items-center">
          <Filter className="mr-1 h-3 w-3" />
          Filters:
        </Badge>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <FileText className="mr-1 h-3 w-3" />
          PDF Only
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <Calendar className="mr-1 h-3 w-3" />
          Last 30 days
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <Tags className="mr-1 h-3 w-3" />
          Similar content
        </Button>
      </div>
    </div>
  );
}
