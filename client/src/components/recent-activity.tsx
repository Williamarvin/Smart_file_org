import { Card, CardContent } from "@/components/ui/card";
import { Check, Upload, Bot, AlertTriangle, History } from "lucide-react";

interface FileItem {
  id: string;
  originalName: string;
  processingStatus: string;
  uploadedAt: string;
  processedAt?: string;
}

interface RecentActivityProps {
  files: FileItem[];
}

const getActivityIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return { icon: Check, color: 'text-green-600 bg-green-100' };
    case 'processing':
      return { icon: Bot, color: 'text-amber-600 bg-amber-100' };
    case 'error':
      return { icon: AlertTriangle, color: 'text-red-600 bg-red-100' };
    default:
      return { icon: Upload, color: 'text-blue-600 bg-blue-100' };
  }
};

const getActivityMessage = (file: FileItem) => {
  switch (file.processingStatus) {
    case 'completed':
      return `${file.originalName} processed`;
    case 'processing':
      return `${file.originalName} being analyzed`;
    case 'error':
      return `Failed to process ${file.originalName}`;
    case 'pending':
      return `${file.originalName} uploaded`;
    default:
      return `${file.originalName} uploaded`;
  }
};

const getTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};

export default function RecentActivity({ files }: RecentActivityProps) {
  // Sort files by most recent activity
  const sortedFiles = [...files]
    .sort((a, b) => {
      const aDate = new Date(a.processedAt || a.uploadedAt);
      const bDate = new Date(b.processedAt || b.uploadedAt);
      return bDate.getTime() - aDate.getTime();
    })
    .slice(0, 5); // Show only the 5 most recent

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
          <History className="text-purple-500 mr-2" />
          Recent Activity
        </h3>
        
        {sortedFiles.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-slate-500 text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedFiles.map((file) => {
              const { icon: IconComponent, color } = getActivityIcon(file.processingStatus);
              const message = getActivityMessage(file);
              const timeAgo = getTimeAgo(file.processedAt || file.uploadedAt);
              
              return (
                <div key={file.id} className="flex items-start space-x-3">
                  <div className={`w-8 h-8 ${color} rounded-full flex items-center justify-center mt-0.5`}>
                    <IconComponent className="text-xs h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 font-medium truncate">
                      {message}
                    </p>
                    <p className="text-xs text-slate-500">{timeAgo}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
