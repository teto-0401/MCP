import { useState } from "react";
import { useExecuteCode, useListExecutionSessions, getListExecutionSessionsQueryKey, useKillExecutionSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, X, Clock, CheckCircle2, XCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const SAMPLE_CODE: Record<string, string> = {
  node: `// Node.js example\nconst arr = [1, 2, 3, 4, 5];\nconst sum = arr.reduce((a, b) => a + b, 0);\nconsole.log("Sum:", sum);\nconsole.log("Node version:", process.version);`,
  python: `# Python example\nimport sys\nprint(f"Python {sys.version}")\nnums = [1, 2, 3, 4, 5]\nprint(f"Sum: {sum(nums)}")`,
  bash: `#!/bin/bash\necho "Bash version: $BASH_VERSION"\necho "Date: $(date)"\nls -la | head -10`,
};

export default function Execute() {
  const [language, setLanguage] = useState<"node" | "python" | "bash">("node");
  const [code, setCode] = useState(SAMPLE_CODE.node);
  const [timeout, setTimeout_] = useState(30);
  const [output, setOutput] = useState<{ stdout: string; stderr: string; exitCode: number; duration: number } | null>(null);
  const queryClient = useQueryClient();

  const executeCode = useExecuteCode();
  const { data: sessions, isLoading: sessionsLoading } = useListExecutionSessions({ query: { queryKey: getListExecutionSessionsQueryKey() } });
  const killSession = useKillExecutionSession();

  function handleLanguageChange(lang: "node" | "python" | "bash") {
    setLanguage(lang);
    setCode(SAMPLE_CODE[lang]);
  }

  function handleRun() {
    setOutput(null);
    executeCode.mutate(
      { data: { language, code, timeout } },
      {
        onSuccess: (result) => {
          setOutput(result);
          queryClient.invalidateQueries({ queryKey: getListExecutionSessionsQueryKey() });
        },
      }
    );
  }

  function handleKill(sessionId: string) {
    killSession.mutate({ sessionId }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListExecutionSessionsQueryKey() }),
    });
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4 overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Code Runner</h1>
        <p className="text-muted-foreground text-sm">Execute code in a sandboxed environment.</p>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <Card className="flex flex-col flex-1 overflow-hidden">
            <CardHeader className="py-3 px-4 border-b flex flex-row items-center gap-3">
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger data-testid="select-language" className="w-32 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="node">Node.js</SelectItem>
                  <SelectItem value="python">Python</SelectItem>
                  <SelectItem value="bash">Bash</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>Timeout:</span>
                <input
                  data-testid="input-timeout"
                  type="number"
                  value={timeout}
                  onChange={(e) => setTimeout_(Number(e.target.value))}
                  className="w-14 px-2 py-1 rounded border border-border bg-background font-mono text-xs"
                  min={1}
                  max={120}
                />
                <span>s</span>
              </div>
              <Button size="sm" onClick={handleRun} disabled={executeCode.isPending} className="ml-auto" data-testid="button-run">
                <Play className="w-3.5 h-3.5 mr-1.5" />
                {executeCode.isPending ? "Running..." : "Run"}
              </Button>
            </CardHeader>
            <div className="flex-1 overflow-hidden">
              <textarea
                data-testid="textarea-code"
                className="w-full h-full p-4 bg-transparent font-mono text-sm resize-none focus:outline-none text-foreground"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                placeholder="Enter code to execute..."
              />
            </div>
          </Card>

          <Card className="h-48 flex flex-col overflow-hidden">
            <CardHeader className="py-2 px-4 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Output</CardTitle>
              {output && (
                <Badge variant={output.exitCode === 0 ? "outline" : "destructive"} className="font-mono text-xs flex items-center gap-1">
                  {output.exitCode === 0 ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  exit {output.exitCode} · {output.duration.toFixed(2)}s
                </Badge>
              )}
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="p-4 font-mono text-xs">
                {executeCode.isPending ? (
                  <div className="text-muted-foreground animate-pulse">Running...</div>
                ) : output ? (
                  <>
                    {output.stdout && <pre className="text-foreground whitespace-pre-wrap">{output.stdout}</pre>}
                    {output.stderr && <pre className="text-destructive whitespace-pre-wrap mt-2">{output.stderr}</pre>}
                    {!output.stdout && !output.stderr && <span className="text-muted-foreground">(no output)</span>}
                  </>
                ) : (
                  <span className="text-muted-foreground">Run code to see output here</span>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        <Card className="w-64 flex flex-col overflow-hidden">
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm">Active Sessions</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            {sessionsLoading ? (
              <div className="p-4 space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : sessions?.length ? (
              <div className="p-2 space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} data-testid={`session-${s.id}`} className="p-3 rounded border border-border bg-muted/30 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-[10px] uppercase">{s.language}</Badge>
                      <Button variant="ghost" size="icon" className="w-5 h-5" onClick={() => handleKill(s.id)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="text-muted-foreground font-mono">{s.id.slice(0, 8)}...</div>
                    <div className="text-muted-foreground mt-1">{s.status}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground text-xs">No active sessions</div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
