import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimiter } from "./middlewares/rateLimiter";
import { incrementRequest } from "./lib/serverMetrics";
import "./lib/mcpTools"; // ensure tools are registered on startup

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    incrementRequest(Date.now() - start, res.statusCode >= 400);
  });
  next();
});

// Rate limiting (skip health checks)
app.use((req, res, next) => {
  if (req.path === "/api/healthz") return next();
  rateLimiter(req, res, next);
});

app.use("/api", router);

// Serve dashboard static files in production
// In bundled ESM output, import.meta.dirname is the dist/ directory
const dashboardDist = path.resolve(
  import.meta.dirname,
  "../../artifacts/mcp-dashboard/dist/public",
);

if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  // SPA fallback — all non-API routes serve index.html
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Replit MCP Server</title></head>
  <body>
    <h1>Replit MCP Server</h1>
    <p>Health: <a href="/api/healthz">/api/healthz</a></p>
    <p>MCP Manifest: <a href="/api/mcp/manifest">/api/mcp/manifest</a></p>
  </body>
</html>`);
  });
}

export default app;
