import { Link, useLocation } from "wouter";
import { FolderOpen, Upload, BarChart3, Search, Home, Menu, Sparkles, MessageCircle, User } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function MobileNavigation() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  
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
    <>
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-2">
            <FolderOpen className="text-blue-500 text-xl" />
            <h1 className="text-lg font-bold text-slate-800">SmartFile Organizer</h1>
          </div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-slate-600 hover:text-slate-800"
          >
            <Menu className="text-xl" />
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {isOpen && (
          <div className="border-t border-slate-200 bg-white">
            <div className="p-4 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setIsOpen(false)}
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
              
              {/* User section for mobile dropdown */}
              {user && (
                <div className="pt-4 border-t border-slate-200 mt-4">
                  <div className="flex items-center space-x-3 px-4 py-3 mb-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
                      <AvatarFallback>
                        <User className="w-4 h-4" />
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
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar for Mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
        <div className="grid grid-cols-6 gap-1 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "text-blue-600"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                <Icon className="text-lg" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}