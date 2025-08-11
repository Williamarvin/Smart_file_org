import { Link, useLocation } from "wouter";
import { FolderOpen, Upload, BarChart3, Search, Home, Sparkles, MessageCircle } from "lucide-react";

export function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { path: "/", icon: Home, label: "Dashboard" },
    { path: "/browse", icon: FolderOpen, label: "Browse Files" },
    { path: "/upload", icon: Upload, label: "Upload Files" },
    { path: "/analysis", icon: BarChart3, label: "Analysis" },
    { path: "/generate", icon: Sparkles, label: "Generate Content" },
    { path: "/chat", icon: MessageCircle, label: "Chat with Files" },
  ];

  return (
    <nav className="bg-white border-r border-slate-200 w-64 min-h-screen hidden lg:block">
      <div className="p-6">
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
    </nav>
  );
}