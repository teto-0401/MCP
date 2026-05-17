import { useState } from "react";
import { useListApiKeys, getListApiKeysQueryKey, useCreateApiKey, useRevokeApiKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyRound, Plus, Trash2, Copy, Check, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const ALL_PERMISSIONS = ["read", "write", "execute", "git", "packages", "env", "admin"];

export default function Auth() {
  const [newName, setNewName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(["read", "write", "execute"]);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: keys, isLoading } = useListApiKeys({ query: { queryKey: getListApiKeysQueryKey() } });
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  function togglePermission(perm: string) {
    setSelectedPermissions(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  }

  function handleCreate() {
    if (!newName.trim()) return;
    createKey.mutate(
      { data: { name: newName, permissions: selectedPermissions } },
      {
        onSuccess: (result) => {
          setNewName("");
          setNewKeySecret(result.key);
          toast({ title: "API key created" });
          queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        },
        onError: () => toast({ title: "Failed to create key", variant: "destructive" }),
      }
    );
  }

  function handleRevoke(id: string, name: string) {
    revokeKey.mutate({ keyId: id }, {
      onSuccess: () => {
        toast({ title: `Revoked ${name}` });
        queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
      },
      onError: () => toast({ title: "Revoke failed", variant: "destructive" }),
    });
  }

  function handleCopy() {
    if (!newKeySecret) return;
    navigator.clipboard.writeText(newKeySecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground text-sm">Create and manage API keys for authenticating MCP clients.</p>
      </div>

      {newKeySecret && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">New API Key Created</span>
              <Badge variant="outline" className="text-[10px] text-yellow-600">Copy now — shown only once</Badge>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-background border border-border rounded px-3 py-2 text-foreground">{newKeySecret}</code>
              <Button variant="outline" size="icon" onClick={handleCopy} data-testid="button-copy-key">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setNewKeySecret(null)} className="text-xs">Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3 border-b">
          <CardTitle className="text-sm">Create New Key</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <Input
            data-testid="input-key-name"
            placeholder="Key name (e.g. Claude Desktop, My Agent)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="h-9"
          />
          <div>
            <div className="text-xs text-muted-foreground mb-2">Permissions</div>
            <div className="flex gap-2 flex-wrap">
              {ALL_PERMISSIONS.map(perm => (
                <button
                  key={perm}
                  data-testid={`perm-${perm}`}
                  onClick={() => togglePermission(perm)}
                  className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${selectedPermissions.includes(perm) ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                >
                  {perm}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleCreate} disabled={createKey.isPending || !newName.trim()} className="h-9" data-testid="button-create-key">
            <Plus className="w-4 h-4 mr-1.5" />
            {createKey.isPending ? "Creating..." : "Create Key"}
          </Button>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm">{keys?.length ?? 0} API keys</CardTitle>
        </CardHeader>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : keys?.length ? (
            <div className="divide-y divide-border">
              {keys.map((k) => (
                <div key={k.id} data-testid={`api-key-${k.id}`} className="p-4 hover:bg-muted/30 group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{k.name}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive" onClick={() => handleRevoke(k.id, k.name)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Revoke
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">{k.prefix}...</span>
                    <span>{k.requestCount} requests</span>
                    <span>Created {formatDistanceToNow(new Date(k.createdAt), { addSuffix: true })}</span>
                    {k.lastUsedAt && <span>Last used {formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })}</span>}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {k.permissions.map(p => (
                      <Badge key={p} variant="outline" className="text-[10px] font-mono">{p}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">No API keys created yet</div>
          )}
        </ScrollArea>
      </Card>
    </div>
  );
}
