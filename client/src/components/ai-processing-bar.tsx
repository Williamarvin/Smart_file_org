import { Brain, CheckCircle } from "lucide-react";

interface AIProcessingBarProps {
  stats: {
    processedFiles: number;
    totalFiles: number;
    processingFiles: number;
  };
  className?: string;
  showTitle?: boolean;
}

export function AIProcessingBar({
  stats,
  className = "",
  showTitle = true,
}: AIProcessingBarProps) {
  if (!stats || stats.totalFiles === 0) return null;

  const progressPercentage = (stats.processedFiles / stats.totalFiles) * 100;

  return (
    <div className={`p-4 bg-purple-50 rounded-lg border ${className}`}>
      <div className="space-y-3">
        {showTitle && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span className="font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-600" />
              AI Processing
            </span>
            <span>
              {stats.processedFiles}/{stats.totalFiles} files
            </span>
          </div>
        )}

        <div className="w-full bg-slate-200 rounded-full h-2">
          <div
            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="h-3 w-3" />
              <span>Analyzed: {stats.processedFiles}</span>
            </div>
            <div className="flex items-center gap-1 text-purple-600">
              <Brain className="h-3 w-3" />
              <span>Processing: {stats.processingFiles}</span>
            </div>
          </div>

          {stats.processedFiles === stats.totalFiles && stats.totalFiles > 0 ? (
            <p className="text-xs text-green-600 font-medium">
              🎉 All files processed! Ready for search.
            </p>
          ) : stats.processingFiles === 0 &&
            stats.processedFiles < stats.totalFiles ? (
            <p className="text-xs text-amber-600 font-medium">
              ⚠️ {stats.totalFiles - stats.processedFiles} files pending
              processing
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
