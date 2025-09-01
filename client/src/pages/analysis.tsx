import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3,
  PieChart,
  TrendingUp,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Brain,
} from "lucide-react";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

export function Analysis() {
  // Fetch file stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: 10000,
  });

  // Fetch files for detailed analysis
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["/api/files"],
    refetchInterval: 10000,
  });

  // Fetch categories from API
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["/api/categories"],
    refetchInterval: 10000,
  });

  // Prepare pie chart data
  const pieChartData = Array.isArray(categories)
    ? categories.map((cat: any) => ({
        name: cat.category
          .replace(/[/_]/g, " ")
          .replace(/\b\w/g, (l: string) => l.toUpperCase()),
        value: cat.count,
        percentage:
          categories.length > 0
            ? (
                (cat.count /
                  categories.reduce(
                    (sum: number, c: any) => sum + c.count,
                    0,
                  )) *
                100
              ).toFixed(1)
            : 0,
      }))
    : [];

  // Colors for pie chart
  const COLORS = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#06B6D4",
    "#84CC16",
  ];

  // Calculate processing status distribution
  const processingStats = Array.isArray(files)
    ? files.reduce((acc: any, file: any) => {
        acc[file.processing_status] = (acc[file.processing_status] || 0) + 1;
        return acc;
      }, {})
    : {};

  const totalFiles = (stats as any)?.totalFiles || 0;
  const processedFiles = (stats as any)?.processedFiles || 0;
  const processingProgress =
    totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Analysis</h1>
        <p className="text-slate-600">
          Insights and statistics about your document collection
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <FileText className="text-blue-600 text-xl" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {totalFiles}
                </p>
                <p className="text-sm text-slate-600">Total Files</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="text-green-600 text-xl" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {processedFiles}
                </p>
                <p className="text-sm text-slate-600">Processed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="text-yellow-600 text-xl" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {(stats as any)?.processingFiles || 0}
                </p>
                <p className="text-sm text-slate-600">Processing</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertCircle className="text-red-600 text-xl" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {(stats as any)?.errorFiles || 0}
                </p>
                <p className="text-sm text-slate-600">Errors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Processing Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="text-purple-500" />
              <span>AI Processing Progress</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">
                    Overall Progress
                  </span>
                  <span className="text-sm text-slate-600">
                    {Math.round(processingProgress)}%
                  </span>
                </div>
                <Progress value={processingProgress} className="h-2" />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {processedFiles}
                  </p>
                  <p className="text-xs text-slate-600">Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {(stats as any)?.processingFiles || 0}
                  </p>
                  <p className="text-xs text-slate-600">Remaining</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <PieChart className="text-blue-500" />
              <span>Category Distribution</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieChartData.length === 0 ? (
              <div className="text-center py-8">
                <PieChart className="text-slate-400 text-4xl mx-auto mb-4" />
                <p className="text-slate-500">No categories yet</p>
                <p className="text-sm text-slate-400">
                  Upload and process files to see categories
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percentage }) =>
                          `${name} (${percentage}%)`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any) => [
                          `${value} files`,
                          name,
                        ]}
                      />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Category breakdown */}
                <div className="space-y-2 pt-4 border-t">
                  {pieChartData.map((item, index) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: COLORS[index % COLORS.length],
                          }}
                        />
                        <span className="text-sm font-medium text-slate-600">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-slate-800">
                          {item.percentage}%
                        </span>
                        <span className="text-xs text-slate-500 ml-2">
                          ({item.value} files)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Processing Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="text-green-500" />
              <span>Processing Status</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(processingStats).length === 0 ? (
              <div className="text-center py-8">
                <BarChart3 className="text-slate-400 text-4xl mx-auto mb-4" />
                <p className="text-slate-500">No files yet</p>
                <p className="text-sm text-slate-400">
                  Upload files to see processing status
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(processingStats).map(
                  ([status, count]: [string, any]) => {
                    const statusConfig = {
                      pending: { color: "bg-yellow-500", label: "Pending" },
                      processing: { color: "bg-blue-500", label: "Processing" },
                      completed: { color: "bg-green-500", label: "Completed" },
                      error: { color: "bg-red-500", label: "Error" },
                    };

                    const config = statusConfig[
                      status as keyof typeof statusConfig
                    ] || { color: "bg-gray-500", label: status };

                    return (
                      <div
                        key={status}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-2">
                          <div
                            className={`w-3 h-3 rounded-full ${config.color}`}
                          />
                          <span className="text-sm font-medium text-slate-600">
                            {config.label}
                          </span>
                        </div>
                        <span className="text-sm text-slate-600">{count}</span>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storage Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="text-purple-500" />
              <span>Storage Usage</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-800">
                  {(stats as any)?.totalSize
                    ? `${((stats as any).totalSize / (1024 * 1024)).toFixed(1)} MB`
                    : "0 MB"}
                </p>
                <p className="text-sm text-slate-600">Total Storage Used</p>
              </div>

              {totalFiles > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-slate-600 text-center">
                    Average file size:{" "}
                    {(
                      ((stats as any)?.totalSize || 0) /
                      (1024 * 1024) /
                      totalFiles
                    ).toFixed(1)}{" "}
                    MB
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
