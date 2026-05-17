import { useGetServerStats, getGetServerStatsQueryKey, useListLogs, getListLogsQueryKey, useListConnections, getListConnectionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, Server, AlertTriangle, Zap, Terminal as TerminalIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetServerStats({
    query: { refetchInterval: 5000, queryKey: getGetServerStatsQueryKey() }
  });

  const { data: logsPage, isLoading: logsLoading } = useListLogs(
    { limit: 20 },
    { query: { refetchInterval: 5000, queryKey: getListLogsQueryKey({ limit: 20 }) } }
  );

  const { data: connections, isLoading: connectionsLoading } = useListConnections({
    query: { refetchInterval: 5000, queryKey: getListConnectionsQueryKey() }
  });

  const toolCallsData = stats?.toolCallsByType 
    ? Object.entries(stats.toolCallsByType).map(([name, value]) => ({ name, value }))
    : [];

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Live server metrics and activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard 
          title="Uptime" 
          value={stats ? formatUptime(stats.uptime) : ""} 
          icon={Clock} 
          loading={statsLoading} 
        />
        <MetricCard 
          title="Total Requests" 
          value={stats?.requestCount.toLocaleString()} 
          icon={Activity} 
          loading={statsLoading} 
        />
        <MetricCard 
          title="Active Connections" 
          value={stats?.activeConnections.toString()} 
          icon={Zap} 
          loading={statsLoading} 
        />
        <MetricCard 
          title="Error Rate" 
          value={stats ? `${((stats.errorCount / Math.max(stats.requestCount, 1)) * 100).toFixed(2)}%` : ""} 
          icon={AlertTriangle} 
          loading={statsLoading} 
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mb-6">
        <Card className="col-span-4 flex flex-col">
          <CardHeader>
            <CardTitle>System Resources</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-6">
            {statsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : (
              <>
                <div>
                  <div className="flex justify-between mb-2 text-sm">
                    <span className="text-muted-foreground">Memory Usage</span>
                    <span className="font-mono">{stats?.memoryUsageMb.toFixed(0)} MB</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(((stats?.memoryUsageMb || 0) / 2048) * 100, 100)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2 text-sm">
                    <span className="text-muted-foreground">CPU Usage</span>
                    <span className="font-mono">{stats?.cpuPercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-chart-2" style={{ width: `${stats?.cpuPercent || 0}%` }} />
                  </div>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <div className="text-sm text-muted-foreground mb-1">Avg Response Time</div>
                    <div className="text-2xl font-mono">{stats?.averageResponseMs?.toFixed(0) || 0}ms</div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <div className="text-sm text-muted-foreground mb-1">Active Sessions</div>
                    <div className="text-2xl font-mono">{stats?.activeSessions || 0}</div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Tool Usage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : toolCallsData.length > 0 ? (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={toolCallsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {toolCallsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                No tool calls recorded yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              {logsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : logsPage?.entries.length ? (
                <div className="space-y-3">
                  {logsPage.entries.map((log) => (
                    <div key={log.id} className="flex gap-3 text-sm pb-3 border-b last:border-0 last:pb-0">
                      <div className="w-16 flex-shrink-0 text-muted-foreground font-mono text-xs mt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={log.level === 'error' ? 'destructive' : log.level === 'warn' ? 'secondary' : 'outline'} className="h-5 px-1.5 text-[10px] uppercase">
                            {log.level}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">{log.tool}</span>
                        </div>
                        <p className="text-foreground break-all">{log.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No recent activity
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Connections</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {connectionsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : connections?.length ? (
                <div className="space-y-3">
                  {connections.map((conn) => (
                    <div key={conn.id} className="p-3 rounded-lg bg-muted/50 border text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium flex items-center gap-2">
                          <Server className="w-4 h-4 text-primary" />
                          {conn.clientType}
                        </div>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {conn.ipAddress || 'Unknown IP'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>Connected: {new Date(conn.connectedAt).toLocaleTimeString()}</div>
                        <div>Requests: {conn.requestCount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No active connections
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, loading }: { title: string, value?: string, icon: any, loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold font-mono">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / (3600*24));
  const h = Math.floor(seconds % (3600*24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
