import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/navigation";
import { MobileNavigation } from "@/components/mobile-navigation";
import { Dashboard } from "@/pages/dashboard";
import { Browse } from "@/pages/browse";
import { Upload } from "@/pages/upload";
import { Analysis } from "@/pages/analysis";
import { Generate } from "@/pages/generate";
import { Chat } from "@/pages/chat";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <div className="min-h-screen bg-slate-50">
      <MobileNavigation />
      <div className="flex">
        <Navigation />
        <div className="flex-1 pb-16 lg:pb-0">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/browse" component={Browse} />
            <Route path="/upload" component={Upload} />
            <Route path="/analysis" component={Analysis} />
            <Route path="/generate" component={Generate} />
            <Route path="/chat" component={Chat} />
            <Route component={NotFound} />
          </Switch>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
