import { useState } from "react";
import { useListTerminalSessions, getListTerminalSessionsQueryKey, useCreateTerminalSession, useKillTerminalSession, useTerminalExecute } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal as TermIcon, Plus, X, Send, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OutputLine { text: string; isError: boolean; }

export default function Terminal() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sessions, isLoading } = useListTerminalSessions({ query: { queryKey: getListTerminalSessionsQueryKey() } });
  const createSession = useCreateTerminalSession();
  const killSession = useKillTerminalSession();
  const executeCmd = useTerminalExecute();

  function handleCreate() {
    if (!newSessionName.trim()) return;
    createSession.mutate(
      { data: { name: newSessionName, shell: "/bin/bash" } },
      {
        onSuccess: (s) => {
          setNewSessionName("");
          setSelectedSession(s.id);
          queryClient.invalidateQueries({ queryKey: getListTerminalSessionsQueryKey() });
        },
        onError: () => toast({ title: "Failed to create session", variant: "destructive" }),
      }
    );
  }

  function handleKill(id: string) {
    killSession.mutate({ sessionId: id }, {
      onSuccess: () => {
        if (selectedSession === id) { setSelectedSession(null); setOutputLines([]); }
        queryClient.invalidateQueries({ queryKey: getListTerminalSessionsQueryKey() });
      },
    });
  }

  function handleRun() {
    if (!command.trim()) return;
    const cmd = command;
    setCommand("");
    setOutputLines((prev) => [...prev, { text: `$ ${cmd}`, isError: false }]);
    executeCmd.mutate(
      { data: { command: cmd, sessionId: selectedSession ?? undefined, timeout: 30 } },
      {
        onSuccess: (result) => {
          if (result.stdout) setOutputLines((prev) => [...prev, { text: result.stdout, isError: false }]);
          if (result.stderr) setOutputLines((prev) => [...prev, { text: result.stderr, isError: true }]);
        },
        onError: () => setOutputLines((prev) => [...prev, { text: "Command failed", isError: true }]),
      }
    );
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4 overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Terminal Sessions</h1>
        <p className="text-muted-foreground text-sm">Manage and run commands in terminal sessions.</p>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <Card className="w-64 flex-shrink-0 flex flex-col overflow-hidden">
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm">Sessions</CardTitle>
          </CardHeader>
          <div className="p-3 border-b flex gap-2">
            <Input
              data-testid="input-session-name"
              placeholder="Session name"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="text-xs h-8"
            />
            <Button size="icon" className="w-8 h-8 flex-shrink-0" onClick={handleCreate} disabled={createSession.isPending} data-testid="button-create-session">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-3 space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : sessions?.length ? (
              <div className="p-2 space-y-1">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    data-testid={`session-item-${s.id}`}
                    className={`p-3 rounded cursor-pointer flex items-center justify-between group ${selectedSession === s.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    onClick={() => setSelectedSession(s.id)}
                  >
                    <div>
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{s.shell}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="w-6 h-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); handleKill(s.id); }}>
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground text-xs">No sessions — create one above</div>
            )}
          </ScrollArea>
        </Card>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <TermIcon className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-mono">
                {selectedSession ? sessions?.find(s => s.id === selectedSession)?.name ?? "Terminal" : "No session selected"}
              </CardTitle>
            </div>
          </CardHeader>
          <ScrollArea className="flex-1 bg-black/20">
            <div className="p-4 font-mono text-xs space-y-1 min-h-[300px]">
              {outputLines.length === 0 ? (
                <span className="text-muted-foreground">
                  {selectedSession ? "Session ready. Enter a command below." : "Select or create a session to start."}
                </span>
              ) : (
                outputLines.map((line, i) => (
                  <pre key={i} className={`whitespace-pre-wrap break-all ${line.isError ? "text-destructive" : "text-foreground"}`}>{line.text}</pre>
                ))
              )}
              {executeCmd.isPending && <span className="text-muted-foreground animate-pulse">Running...</span>}
            </div>
          </ScrollArea>
          <div className="p-3 border-t flex gap-2">
            <div className="flex items-center text-muted-foreground mr-1">
              <ChevronRight className="w-4 h-4" />
            </div>
            <Input
              data-testid="input-command"
              placeholder="Enter command..."
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRun()}
              className="font-mono text-sm flex-1"
              disabled={executeCmd.isPending}
            />
            <Button size="icon" onClick={handleRun} disabled={executeCmd.isPending || !command.trim()} data-testid="button-run-command">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
