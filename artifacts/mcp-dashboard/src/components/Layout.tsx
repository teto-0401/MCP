import { Link, useLocation } from "wouter";
import { 
  Activity, 
  FolderTree, 
  PlaySquare, 
  Terminal, 
  GitBranch, 
  Package, 
  Settings, 
  KeyRound, 
  ListOrdered, 
  Wrench 
} from "lucide-react";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { Badge } from "./ui/badge";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/mcp", label: "MCP Tools", icon: Wrench },
  { href: "/files", label: "File Explorer", icon: FolderTree },
  { href: "/execute", label: "Code Runner", icon: PlaySquare },
  { href: "/terminal", label: "Terminal", icon: Terminal },
  { href: "/git", label: "Git", icon: GitBranch },
  { href: "/packages", label: "Packages", icon: Package },
  { href: "/env", label: "Environment", icon: Settings },
  { href: "/auth", label: "API Keys", icon: KeyRound },
  { href: "/logs", label: "Audit Logs", icon: ListOrdered },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck({ query: { refetchInterval: 10000, queryKey: getHealthCheckQueryKey() } });

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <div className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            MCP Server
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            {health?.status === "ok" ? (
              <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10">Online</Badge>
            ) : (
              <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/10">Offline</Badge>
            )}
          </div>
          {health?.version && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono">{health.version}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
