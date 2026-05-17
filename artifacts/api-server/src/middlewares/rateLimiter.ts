import { type Request, type Response, type NextFunction } from "express";
import { rateLimitWindows } from "../routes/monitoring";

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 200;

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const key = ip;

  const window = rateLimitWindows.get(key);
  if (!window || now - window.windowStart > WINDOW_MS) {
    rateLimitWindows.set(key, { keyId: key, keyName: ip, count: 1, windowStart: now, blocked: false });
    next();
    return;
  }

  window.count++;
  if (window.count > MAX_REQUESTS) {
    window.blocked = true;
    res.status(429).json({ error: "Rate limit exceeded. Please wait before retrying." });
    return;
  }

  next();
}
