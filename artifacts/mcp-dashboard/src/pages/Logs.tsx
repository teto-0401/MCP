import { useState } from "react";
import { useListLogs, getListLogsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-muted-foreground",
  info: "text-blue-500",
  warn: "text-yellow-500",
  error: "text-red-500",
};

const LEVEL_BADGES: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  debug: "outline",
  info: "secondary",
  warn: "outline",
  error: "destructive",
};

export default function Logs() {
  const [level, setLevel] = useState<string>("all");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const queryClient = useQueryClient();

  const params = {
    limit,
    offset,
    level: level === "all" ? undefined : level,
  };

  const { data, isLoading } = useListLogs(
    params,
    { query: { refetchInterval: 5000, queryKey: getListLogsQueryKey(params) } }
  );

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: getListLogsQueryKey(params) });
  }

  const totalPages = Math.ceil((data?.total ?? 0) / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="p-6 h-full flex flex-col gap-4 overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground text-sm">Complete request history and audit trail.</p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={level} onValueChange={(v) => { setLevel(v); setOffset(0); }}>
          <SelectTrigger data-testid="select-log-level" className="w-32 h-8">
            <SelectValue placeholder="All levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{data?.total ?? 0} entries</span>
        <Button variant="outline" size="icon" className="w-7 h-7" onClick={handleRefresh}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {isLoading ? (
              <div className="p-4 space-y-3">{[1,2,3,4,5,6,7].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : data?.entries.length ? (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Level</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-28">Tool</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Message</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-20">Duration</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-32">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.entries.map((log) => (
                    <tr key={log.id} data-testid={`log-${log.id}`} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <Badge variant={LEVEL_BADGES[log.level] ?? "outline"} className={`text-[10px] uppercase ${LEVEL_COLORS[log.level]}`}>
                          {log.level}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground truncate max-w-[7rem]">{log.tool}</td>
                      <td className="px-4 py-2.5 text-foreground">{log.message}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        {log.duration != null ? `${log.duration.toFixed(2)}s` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">No log entries found</div>
            )}
          </ScrollArea>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={offset + limit >= (data?.total ?? 0)} onClick={() => setOffset(offset + limit)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
