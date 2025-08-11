import { useQuery } from "@tanstack/react-query";
import QuickStats from "@/components/quick-stats";
import RecentActivity from "@/components/recent-activity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Zap, Clock, TrendingUp } from "lucide-react";
import { Link } from "wouter";

export function Dashboard() {
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

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Dashboard</h1>
        <p className="text-slate-600">Overview of your file management and AI processing</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Statistics */}
        <div>
          <QuickStats stats={stats as any} />
        </div>

        {/* Recent Activity */}
        <div>
          <RecentActivity files={Array.isArray(files) ? files.slice(0, 5) : []} />
        </div>
      </div>
    </div>
  );
}