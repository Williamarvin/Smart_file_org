import { Card, CardContent } from "@/components/ui/card";
import { FileText, Tags, Clock, Database, BarChart3 } from "lucide-react";

interface QuickStatsProps {
  stats?: {
    totalFiles: number;
    processedFiles: number;
    processingFiles: number;
    errorFiles: number;
    totalSize: number;
  };
}

const formatBytes = (bytes: number) => {
  const sizes = ["B", "KB", "MB", "GB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export default function QuickStats({ stats }: QuickStatsProps) {
  if (!stats) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <BarChart3 className="text-green-500 mr-2" />
            Quick Stats
          </h3>
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
          <BarChart3 className="text-green-500 mr-2" />
          Quick Stats
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="text-blue-600 text-sm" />
              </div>
              <span className="ml-3 text-slate-700">Total Files</span>
            </div>
            <span className="font-semibold text-slate-900">
              {stats.totalFiles}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Tags className="text-green-600 text-sm" />
              </div>
              <span className="ml-3 text-slate-700">Processed</span>
            </div>
            <span className="font-semibold text-slate-900">
              {stats.processedFiles}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <Clock className="text-amber-600 text-sm" />
              </div>
              <span className="ml-3 text-slate-700">Processing</span>
            </div>
            <span className="font-semibold text-slate-900">
              {stats.processingFiles}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Database className="text-purple-600 text-sm" />
              </div>
              <span className="ml-3 text-slate-700">Storage Used</span>
            </div>
            <span className="font-semibold text-slate-900">
              {formatBytes(stats.totalSize)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
