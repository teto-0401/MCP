import { recordToolCall } from "./mcpTools";

export interface ConnectionInfo {
  id: string;
  clientType: string;
  connectedAt: string;
  lastActiveAt: string | null;
  requestCount: number;
  keyId: string | null;
  ipAddress: string | null;
}

interface Metrics {
  requestCount: number;
  errorCount: number;
  totalResponseMs: number;
  toolCallsToday: number;
  toolCallsByType: Record<string, number>;
  startedAt: Date;
}

const metrics: Metrics = {
  requestCount: 0,
  errorCount: 0,
  totalResponseMs: 0,
  toolCallsToday: 0,
  toolCallsByType: {},
  startedAt: new Date(),
};

const connections = new Map<string, ConnectionInfo>();

export function incrementRequest(durationMs: number, isError: boolean) {
  metrics.requestCount++;
  metrics.totalResponseMs += durationMs;
  if (isError) metrics.errorCount++;
}

export function incrementToolCall(tool: string, durationMs: number, isError: boolean) {
  metrics.toolCallsToday++;
  metrics.toolCallsByType[tool] = (metrics.toolCallsByType[tool] ?? 0) + 1;
  recordToolCall(tool, durationMs, isError);
}

export function addConnection(conn: ConnectionInfo) {
  connections.set(conn.id, conn);
}

export function removeConnection(id: string) {
  connections.delete(id);
}

export function updateConnection(id: string, updates: Partial<ConnectionInfo>) {
  const conn = connections.get(id);
  if (conn) connections.set(id, { ...conn, ...updates });
}

export function getConnections(): ConnectionInfo[] {
  return Array.from(connections.values());
}

export function getMetrics() {
  const uptime = (Date.now() - metrics.startedAt.getTime()) / 1000;
  const mem = process.memoryUsage();
  return {
    uptime,
    requestCount: metrics.requestCount,
    errorCount: metrics.errorCount,
    activeConnections: connections.size,
    activeSessions: 0,
    memoryUsageMb: Math.round(mem.rss / 1024 / 1024 * 10) / 10,
    cpuPercent: 0,
    toolCallsToday: metrics.toolCallsToday,
    toolCallsByType: metrics.toolCallsByType,
    averageResponseMs: metrics.requestCount > 0 ? Math.round(metrics.totalResponseMs / metrics.requestCount) : 0,
  };
}

// Reset daily tool calls at midnight
function resetDailyCounters() {
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
  setTimeout(() => {
    metrics.toolCallsToday = 0;
    metrics.toolCallsByType = {};
    resetDailyCounters();
  }, msUntilMidnight);
}
resetDailyCounters();
