import { useQuery } from "@tanstack/react-query";
import QuickStats from "@/components/quick-stats";
import RecentActivity from "@/components/recent-activity";
import { AIProcessingBar } from "@/components/ai-processing-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Zap, Clock, TrendingUp, FolderOpen, User, GraduationCap, Briefcase, Heart, MessageCircle, Sparkles, PieChart } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

export function Dashboard() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryFiles, setCategoryFiles] = useState<any[]>([]);

  // Fetch files for recent activity
  const { data: files = [] } = useQuery({
    queryKey: ["/api/files"],
    refetchInterval: 10000,
  });

  // Fetch file stats
  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: 10000,
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ["/api/categories"],
    refetchInterval: 10000,
  });

  // Fetch files by category when category is selected
  const { data: filesByCategory = [], refetch: refetchCategoryFiles } = useQuery({
    queryKey: ["/api/files/category", selectedCategory],
    enabled: !!selectedCategory,
  });

  const getCategoryIcon = (category: string) => {
    if (category.includes("personal") || category.includes("life")) return Heart;
    if (category.includes("academic") || category.includes("education")) return GraduationCap;
    if (category.includes("work") || category.includes("business")) return Briefcase;
    return FolderOpen;
  };

  const getCategoryColor = (category: string) => {
    if (category.includes("personal") || category.includes("life")) return "text-pink-600 bg-pink-100";
    if (category.includes("academic") || category.includes("education")) return "text-blue-600 bg-blue-100";
    if (category.includes("work") || category.includes("business")) return "text-green-600 bg-green-100";
    return "text-gray-600 bg-gray-100";
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Dashboard</h1>
        <p className="text-slate-600">Overview of your file management and AI processing</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Link href="/upload">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <FileText className="text-blue-600 text-xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Upload Files</h3>
                  <p className="text-sm text-slate-600">Add new documents for AI processing</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/browse">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Zap className="text-green-600 text-xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Browse Files</h3>
                  <p className="text-sm text-slate-600">Explore and search your documents</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/analysis">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-200">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <TrendingUp className="text-purple-600 text-xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Analysis</h3>
                  <p className="text-sm text-slate-600">View insights and statistics</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/chat">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200 bg-gradient-to-r from-orange-50 to-yellow-50">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <MessageCircle className="text-orange-600 text-xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Chat with Files</h3>
                  <p className="text-sm text-slate-600">Ask AI about your documents</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* AI Processing Bar */}
      {stats && (stats as any).totalFiles > 0 && (
        <div className="mb-8">
          <AIProcessingBar 
            stats={stats as any}
            className="max-w-md mx-auto"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {/* Statistics */}
        <div>
          <QuickStats stats={stats as any} />
        </div>

        {/* Category Distribution Chart */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <PieChart className="text-purple-500" />
                <span>Category Distribution</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!categories || (categories as any[]).length === 0 ? (
                <div className="text-center py-8">
                  <PieChart className="mx-auto text-4xl text-slate-400 mb-2" />
                  <p className="text-slate-500">No data to display</p>
                  <p className="text-sm text-slate-400">Upload and process files to see distribution</p>
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={(categories as any[]).map((cat: any, index: number) => ({
                          name: cat.category.replace(/[/_]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                          value: cat.count,
                          percentage: (categories as any[]).length > 0 ? ((cat.count / (categories as any[]).reduce((sum: number, c: any) => sum + c.count, 0)) * 100).toFixed(1) : 0
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percentage }: any) => `${name} (${percentage}%)`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {(categories as any[]).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16'][index % 7]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Categories */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FolderOpen className="text-blue-500" />
                <span>File Categories</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!categories || (categories as any[]).length === 0 ? (
                <div className="text-center py-6">
                  <FolderOpen className="text-slate-400 text-3xl mx-auto mb-3" />
                  <p className="text-slate-500">No categories yet</p>
                  <p className="text-sm text-slate-400">Upload files to see categories</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(categories as any[]).slice(0, 6).map((cat: any) => {
                    const Icon = getCategoryIcon(cat.category);
                    const colorClass = getCategoryColor(cat.category);
                    return (
                      <div 
                        key={cat.category}
                        onClick={() => {
                          setSelectedCategory(cat.category === selectedCategory ? null : cat.category);
                        }}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-lg ${colorClass}`}>
                            <Icon className="text-sm" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 capitalize">
                              {cat.category.replace(/[/_]/g, ' ')}
                            </p>
                            <p className="text-sm text-slate-500">{cat.count} files</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-slate-400">
                            {selectedCategory === cat.category ? 'Hide' : 'View'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category Files */}
          {selectedCategory && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">
                  Files in "{selectedCategory.replace(/[/_]/g, ' ')}"
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!filesByCategory || (filesByCategory as any[]).length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-slate-500">No files found in this category</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(filesByCategory as any[]).slice(0, 5).map((file: any) => (
                      <div key={file.id} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                        <FileText className="text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 truncate">
                            {file.originalName}
                          </p>
                          <p className="text-sm text-slate-500">
                            {new Date(file.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Link 
                          href={`/browse?search=${encodeURIComponent(file.originalName.split('.')[0])}`}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          View
                        </Link>
                      </div>
                    ))}
                    {(filesByCategory as any[]).length > 5 && (
                      <div className="text-center pt-2">
                        <Link 
                          href={`/browse?category=${selectedCategory}`}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          View all {(filesByCategory as any[]).length} files
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <RecentActivity files={Array.isArray(files) ? files : []} />
        </div>
      </div>
    </div>
  );
}