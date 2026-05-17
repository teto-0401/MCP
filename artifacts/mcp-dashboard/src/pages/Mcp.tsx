import { useListMcpTools, getListMcpToolsQueryKey, useGetMcpToolsManifest, getGetMcpToolsManifestQueryKey, useCallMcpTool } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wrench, Play, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  files: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  execution: "text-green-500 bg-green-500/10 border-green-500/20",
  terminal: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
  git: "text-purple-500 bg-purple-500/10 border-purple-500/20",
  packages: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  environment: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
};

export default function Mcp() {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [argsJson, setArgsJson] = useState("{}");
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null);
  const [filter, setFilter] = useState("");
  const queryClient = useQueryClient();

  const { data: tools, isLoading } = useListMcpTools({ query: { refetchInterval: 10000, queryKey: getListMcpToolsQueryKey() } });
  const { data: manifest } = useGetMcpToolsManifest({ query: { queryKey: getGetMcpToolsManifestQueryKey() } });
  const callTool = useCallMcpTool();

  const filtered = tools?.filter(t => t.name.includes(filter) || t.category.includes(filter)) ?? [];
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  function handleCall() {
    if (!selectedTool) return;
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(argsJson); } catch { setResult({ text: "Invalid JSON arguments", isError: true }); return; }
    setResult(null);
    callTool.mutate(
      { data: { name: selectedTool, arguments: args } },
      {
        onSuccess: (r) => {
          setResult({ text: r.content.map(c => c.text).join("\n"), isError: r.isError });
        },
        onError: () => setResult({ text: "Tool call failed", isError: true }),
      }
    );
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MCP Tools</h1>
          <p className="text-muted-foreground text-sm">All registered Model Context Protocol tools with usage statistics.</p>
        </div>
        <div className="flex items-center gap-2">
          {manifest && <Badge variant="outline" className="font-mono text-xs">{manifest.name} v{manifest.version}</Badge>}
          <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => queryClient.invalidateQueries({ queryKey: getListMcpToolsQueryKey() })}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          <input
            data-testid="input-filter-tools"
            placeholder="Filter tools..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="space-y-2">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : (
              <div className="space-y-4">
                {Object.entries(grouped).map(([cat, catTools]) => (
                  <div key={cat}>
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">{cat}</div>
                    <div className="grid gap-2 grid-cols-1">
                      {catTools.map(tool => (
                        <button
                          key={tool.name}
                          data-testid={`tool-${tool.name}`}
                          onClick={() => { setSelectedTool(tool.name); setArgsJson("{}"); setResult(null); }}
                          className={`text-left p-3 rounded-lg border transition-colors ${selectedTool === tool.name ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/50"}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="font-mono text-sm font-medium">{tool.name}</span>
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[tool.category] ?? ""}`}>{tool.category}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{tool.description}</p>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Play className="w-3 h-3" /> {tool.callCount} calls</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {tool.averageMs.toFixed(0)}ms avg</span>
                            {tool.errorRate > 0 && (
                              <span className="flex items-center gap-1 text-destructive"><XCircle className="w-3 h-3" /> {(tool.errorRate * 100).toFixed(0)}% errors</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <div className="text-center text-muted-foreground text-sm py-8">No tools found</div>}
              </div>
            )}
          </ScrollArea>
        </div>

        {selectedTool && (
          <Card className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm font-mono">{selectedTool}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3 pt-4 overflow-hidden">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Arguments (JSON)</div>
                <textarea
                  data-testid="textarea-tool-args"
                  className="w-full h-32 font-mono text-xs bg-muted/30 border border-border rounded p-2 resize-none focus:outline-none"
                  value={argsJson}
                  onChange={(e) => setArgsJson(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <Button onClick={handleCall} disabled={callTool.isPending} size="sm" data-testid="button-call-tool">
                <Play className="w-3.5 h-3.5 mr-1.5" />
                {callTool.isPending ? "Calling..." : "Call Tool"}
              </Button>
              {result && (
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2 text-xs mb-1">
                    {result.isError ? (
                      <><XCircle className="w-3.5 h-3.5 text-destructive" /> <span className="text-destructive">Error</span></>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> <span className="text-green-500">Success</span></>
                    )}
                  </div>
                  <ScrollArea className="h-48">
                    <pre className={`font-mono text-xs whitespace-pre-wrap break-all ${result.isError ? "text-destructive" : "text-foreground"}`}>{result.text}</pre>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
