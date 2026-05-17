import { useState } from "react";
import { useGitStatus, getGitStatusQueryKey, useGitLog, getGitLogQueryKey, useListGitBranches, getListGitBranchesQueryKey, useGitCommit, useGitDiff, getGitDiffQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitBranch, GitCommit, CheckCircle, RefreshCw, GitPullRequest, Plus, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

export default function Git() {
  const [commitMessage, setCommitMessage] = useState("");
  const [commitAll, setCommitAll] = useState(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading: statusLoading } = useGitStatus(
    {},
    { query: { refetchInterval: 10000, queryKey: getGitStatusQueryKey({}) } }
  );
  const { data: log, isLoading: logLoading } = useGitLog(
    { limit: 20 },
    { query: { queryKey: getGitLogQueryKey({ limit: 20 }) } }
  );
  const { data: branches, isLoading: branchesLoading } = useListGitBranches(
    {},
    { query: { queryKey: getListGitBranchesQueryKey({}) } }
  );
  const { data: diff } = useGitDiff(
    {},
    { query: { queryKey: getGitDiffQueryKey({}) } }
  );

  const commitMutation = useGitCommit();

  function handleCommit() {
    if (!commitMessage.trim()) return;
    commitMutation.mutate(
      { data: { message: commitMessage, all: commitAll } },
      {
        onSuccess: () => {
          setCommitMessage("");
          toast({ title: "Committed successfully" });
          queryClient.invalidateQueries({ queryKey: getGitStatusQueryKey({}) });
          queryClient.invalidateQueries({ queryKey: getGitLogQueryKey({ limit: 20 }) });
        },
        onError: () => toast({ title: "Commit failed", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Git</h1>
        <p className="text-muted-foreground text-sm">Repository status, history, and commits.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Status */}
        <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Status</CardTitle>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => queryClient.invalidateQueries({ queryKey: getGitStatusQueryKey({}) })}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {statusLoading ? <Skeleton className="h-20 w-full" /> : status ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-primary" />
                  <span className="font-mono text-sm font-medium">{status.branch}</span>
                  {status.clean && <Badge variant="outline" className="text-xs text-green-500">clean</Badge>}
                </div>
                {status.ahead > 0 && <div className="text-xs text-muted-foreground">{status.ahead} ahead</div>}
                {status.behind > 0 && <div className="text-xs text-muted-foreground">{status.behind} behind</div>}
                {status.staged.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Staged ({status.staged.length})</div>
                    {status.staged.map(f => <div key={f} className="text-xs font-mono text-green-500 truncate">{f}</div>)}
                  </div>
                )}
                {status.unstaged.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Modified ({status.unstaged.length})</div>
                    {status.unstaged.map(f => <div key={f} className="text-xs font-mono text-yellow-500 truncate">{f}</div>)}
                  </div>
                )}
                {status.untracked.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Untracked ({status.untracked.length})</div>
                    {status.untracked.map(f => <div key={f} className="text-xs font-mono text-muted-foreground truncate">{f}</div>)}
                  </div>
                )}
              </div>
            ) : <div className="text-xs text-muted-foreground">Not a git repository</div>}
          </CardContent>
        </Card>

        {/* Branches */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Branches</CardTitle>
          </CardHeader>
          <CardContent>
            {branchesLoading ? <Skeleton className="h-20 w-full" /> : (
              <div className="space-y-1">
                {branches?.map(b => (
                  <div key={b.name} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${b.current ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                    <GitBranch className="w-3 h-3" />
                    <span className="font-mono truncate">{b.name}</span>
                    {b.current && <Badge variant="outline" className="text-[10px] ml-auto">current</Badge>}
                  </div>
                ))}
                {!branches?.length && <div className="text-xs text-muted-foreground">No branches found</div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Commit */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Quick Commit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              data-testid="input-commit-message"
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCommit()}
              className="text-sm"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={commitAll} onChange={(e) => setCommitAll(e.target.checked)} className="rounded" />
              Stage all changes
            </label>
            <Button className="w-full" size="sm" onClick={handleCommit} disabled={commitMutation.isPending || !commitMessage.trim()} data-testid="button-commit">
              <GitCommit className="w-3.5 h-3.5 mr-1.5" />
              {commitMutation.isPending ? "Committing..." : "Commit"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Diff & Log */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col" style={{ maxHeight: 400 }}>
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm">Working Tree Diff</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <pre className="p-4 font-mono text-xs whitespace-pre-wrap break-all text-foreground">
              {diff?.diff ? diff.diff : <span className="text-muted-foreground">No changes in working tree</span>}
            </pre>
          </ScrollArea>
        </Card>

        <Card className="flex flex-col" style={{ maxHeight: 400 }}>
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm">Commit History</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            {logLoading ? (
              <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : log?.length ? (
              <div className="divide-y divide-border">
                {log.map(c => (
                  <div key={c.hash} className="p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-primary">{c.hash.slice(0, 7)}</span>
                      <span className="text-muted-foreground">{formatDistanceToNow(new Date(c.date), { addSuffix: true })}</span>
                    </div>
                    <div className="font-medium truncate">{c.message}</div>
                    <div className="text-muted-foreground mt-0.5">{c.author} &lt;{c.email}&gt;</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground text-xs">No commits yet</div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
