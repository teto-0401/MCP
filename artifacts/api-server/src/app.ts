import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
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

export default app;
