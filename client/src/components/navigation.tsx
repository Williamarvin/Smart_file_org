import { Link, useLocation } from "wouter";
import { FolderOpen, Upload, BarChart3, Search, Home, Sparkles, MessageCircle, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Navigation() {
  const [location] = useLocation();
  
  // Mock user for display
  const user = {
    firstName: "Demo",
    lastName: "User",
    email: "demo@example.com",
    profileImageUrl: null
  };

  const navItems = [
    { path: "/", icon: Home, label: "Dashboard" },
    { path: "/browse", icon: FolderOpen, label: "Browse Files" },
    { path: "/upload", icon: Upload, label: "Upload Files" },
    { path: "/analysis", icon: BarChart3, label: "Analysis" },
    { path: "/generate", icon: Sparkles, label: "Generate Content" },
    { path: "/chat", icon: MessageCircle, label: "Chat with Files" },
  ];

  return (
    <nav className="bg-white border-r border-slate-200 w-64 min-h-screen hidden lg:flex flex-col">
      <div className="p-6 flex-1">
        <div className="flex items-center space-x-2 mb-8">
          <FolderOpen className="text-blue-500 text-2xl" />
          <h1 className="text-xl font-bold text-slate-800">SmartFile Organizer</h1>
        </div>
        
        <div className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-600 border border-blue-200"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <Icon className="text-lg" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      
      {/* User section at bottom */}
      {user && (
        <div className="p-6 border-t border-slate-200">
          <div className="flex items-center space-x-3 mb-4">
            <Avatar className="w-10 h-10">
              <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
              <AvatarFallback>
                <User className="w-5 h-5" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user.email || "User"
                }
              </p>
              {user.email && (
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              )}
            </div>
          </div>

        </div>
      )}
    </nav>
  );
}