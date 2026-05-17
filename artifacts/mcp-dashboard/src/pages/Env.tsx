import { useState } from "react";
import { useListEnvVars, getListEnvVarsQueryKey, useSetEnvVar, useDeleteEnvVar } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, EyeOff, Trash2, Plus, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Env() {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newRedacted, setNewRedacted] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: vars, isLoading } = useListEnvVars({ query: { queryKey: getListEnvVarsQueryKey() } });
  const setVar = useSetEnvVar();
  const deleteVar = useDeleteEnvVar();

  function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) return;
    setVar.mutate(
      { key: newKey, data: { value: newValue, redacted: newRedacted } },
      {
        onSuccess: () => {
          setNewKey("");
          setNewValue("");
          setNewRedacted(false);
          toast({ title: `Set ${newKey}` });
          queryClient.invalidateQueries({ queryKey: getListEnvVarsQueryKey() });
        },
        onError: () => toast({ title: "Failed to set variable", variant: "destructive" }),
      }
    );
  }

  function handleDelete(key: string) {
    deleteVar.mutate({ key }, {
      onSuccess: () => {
        toast({ title: `Deleted ${key}` });
        queryClient.invalidateQueries({ queryKey: getListEnvVarsQueryKey() });
      },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    });
  }

  function toggleVisible(key: string) {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4 overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Environment Variables</h1>
        <p className="text-muted-foreground text-sm">Manage project environment variables. Values marked as redacted are hidden by default.</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3 flex-wrap">
            <Input
              data-testid="input-env-key"
              placeholder="KEY_NAME"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/\s/g, "_"))}
              className="w-48 h-9 font-mono text-sm"
            />
            <Input
              data-testid="input-env-value"
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              type={newRedacted ? "password" : "text"}
              className="flex-1 h-9 font-mono text-sm min-w-32"
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={newRedacted} onChange={(e) => setNewRedacted(e.target.checked)} />
              Redact value
            </label>
            <Button onClick={handleAdd} disabled={setVar.isPending || !newKey.trim() || !newValue.trim()} className="h-9" data-testid="button-add-env">
              <Plus className="w-4 h-4 mr-1.5" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm">{vars?.length ?? 0} variables</CardTitle>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => queryClient.invalidateQueries({ queryKey: getListEnvVarsQueryKey() })}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : vars?.length ? (
            <div className="divide-y divide-border">
              {vars.map((v) => (
                <div key={v.key} data-testid={`env-var-${v.key}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm font-medium text-primary">{v.key}</span>
                    {v.redacted && <Badge variant="outline" className="text-[10px]">redacted</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                      {v.redacted && !visibleKeys.has(v.key) ? "••••••••" : v.value ?? "(hidden)"}
                    </span>
                    {v.redacted && (
                      <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => toggleVisible(v.key)}>
                        {visibleKeys.has(v.key) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100" onClick={() => handleDelete(v.key)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">No environment variables set</div>
          )}
        </ScrollArea>
      </Card>
    </div>
  );
}
