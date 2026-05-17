import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Files from "./pages/Files";
import Execute from "./pages/Execute";
import Terminal from "./pages/Terminal";
import Git from "./pages/Git";
import Packages from "./pages/Packages";
import Env from "./pages/Env";
import Auth from "./pages/Auth";
import Logs from "./pages/Logs";
import Mcp from "./pages/Mcp";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  useEffect(() => {
    // Default to dark mode
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/files" component={Files} />
              <Route path="/execute" component={Execute} />
              <Route path="/terminal" component={Terminal} />
              <Route path="/git" component={Git} />
              <Route path="/packages" component={Packages} />
              <Route path="/env" component={Env} />
              <Route path="/auth" component={Auth} />
              <Route path="/logs" component={Logs} />
              <Route path="/mcp" component={Mcp} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
