import { useState } from "react";
import { useListInstalledPackages, getListInstalledPackagesQueryKey, useInstallPackage, useUninstallPackage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Plus, Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Packages() {
  const [manager, setManager] = useState("npm");
  const [installName, setInstallName] = useState("");
  const [installVersion, setInstallVersion] = useState("");
  const [isDev, setIsDev] = useState(false);
  const [filter, setFilter] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: packages, isLoading } = useListInstalledPackages(
    { manager },
    { query: { queryKey: getListInstalledPackagesQueryKey({ manager }) } }
  );

  const installPkg = useInstallPackage();
  const uninstallPkg = useUninstallPackage();

  function handleInstall() {
    if (!installName.trim()) return;
    installPkg.mutate(
      { data: { name: installName, version: installVersion || undefined, manager, dev: isDev } },
      {
        onSuccess: () => {
          setInstallName("");
          setInstallVersion("");
          toast({ title: `Installed ${installName}` });
          queryClient.invalidateQueries({ queryKey: getListInstalledPackagesQueryKey({ manager }) });
        },
        onError: () => toast({ title: "Installation failed", variant: "destructive" }),
      }
    );
  }

  function handleUninstall(name: string) {
    uninstallPkg.mutate(
      { data: { name, manager } },
      {
        onSuccess: () => {
          toast({ title: `Removed ${name}` });
          queryClient.invalidateQueries({ queryKey: getListInstalledPackagesQueryKey({ manager }) });
        },
        onError: () => toast({ title: "Uninstall failed", variant: "destructive" }),
      }
    );
  }

  const filtered = packages?.filter(p => p.name.toLowerCase().includes(filter.toLowerCase())) ?? [];

  return (
    <div className="p-6 h-full flex flex-col gap-4 overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Package Manager</h1>
        <p className="text-muted-foreground text-sm">Install and manage project dependencies.</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3 flex-wrap">
            <Select value={manager} onValueChange={setManager}>
              <SelectTrigger data-testid="select-manager" className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="npm">npm</SelectItem>
                <SelectItem value="pnpm">pnpm</SelectItem>
                <SelectItem value="yarn">yarn</SelectItem>
                <SelectItem value="pip">pip</SelectItem>
              </SelectContent>
            </Select>
            <Input
              data-testid="input-package-name"
              placeholder="Package name"
              value={installName}
              onChange={(e) => setInstallName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInstall()}
              className="w-48 h-9"
            />
            <Input
              data-testid="input-package-version"
              placeholder="Version (optional)"
              value={installVersion}
              onChange={(e) => setInstallVersion(e.target.value)}
              className="w-36 h-9"
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={isDev} onChange={(e) => setIsDev(e.target.checked)} />
              Dev dependency
            </label>
            <Button onClick={handleInstall} disabled={installPkg.isPending || !installName.trim()} className="h-9" data-testid="button-install">
              <Plus className="w-4 h-4 mr-1.5" />
              {installPkg.isPending ? "Installing..." : "Install"}
            </Button>
          </div>
          {installPkg.isPending && (
            <div className="mt-3 text-xs text-muted-foreground animate-pulse">Installing package, this may take a moment...</div>
          )}
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="py-3 px-4 border-b flex flex-row items-center gap-3">
          <CardTitle className="text-sm">{filtered.length} packages installed</CardTitle>
          <Input
            data-testid="input-filter"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-48 h-7 ml-auto text-xs"
          />
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => queryClient.invalidateQueries({ queryKey: getListInstalledPackagesQueryKey({ manager }) })}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length ? (
            <div className="divide-y divide-border">
              {filtered.map(pkg => (
                <div key={pkg.name} data-testid={`package-${pkg.name}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 group">
                  <div className="flex items-center gap-3">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-mono font-medium">{pkg.name}</div>
                      {pkg.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{pkg.description}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{pkg.version}</span>
                    {pkg.isDev && <Badge variant="outline" className="text-[10px]">dev</Badge>}
                    <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100" onClick={() => handleUninstall(pkg.name)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {packages?.length ? "No packages match your filter" : "No packages found in package.json"}
            </div>
          )}
        </ScrollArea>
      </Card>
    </div>
  );
}
