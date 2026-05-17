import { Router, type IRouter } from "express";
import { mcpToolRegistry } from "../lib/mcpTools";

const router: IRouter = Router();
const startedAt = Date.now();

router.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    uptime: (Date.now() - startedAt) / 1000,
    version: "1.0.0",
    mcpToolCount: mcpToolRegistry.size,
  });
});

export default router;
