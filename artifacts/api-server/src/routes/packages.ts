import { Router, type IRouter } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import {
  ListInstalledPackagesQueryParams,
  InstallPackageBody,
  UninstallPackageBody,
} from "@workspace/api-zod";
import { incrementToolCall } from "../lib/serverMetrics";

const execAsync = promisify(exec);
const router: IRouter = Router();

router.get("/packages/installed", async (req, res): Promise<void> => {
  const parsed = ListInstalledPackagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const manager = parsed.data.manager ?? "npm";
  const pkgPath = parsed.data.path ?? ".";

  try {
    if (manager === "npm" || manager === "pnpm" || manager === "yarn") {
      const pkgJson = JSON.parse(await fs.readFile(path.join(pkgPath, "package.json"), "utf-8"));
      const deps = Object.entries(pkgJson.dependencies ?? {}).map(([name, version]) => ({
        name,
        version: String(version).replace(/^\^|~/, ""),
        manager,
        description: null,
        isDev: false,
      }));
      const devDeps = Object.entries(pkgJson.devDependencies ?? {}).map(([name, version]) => ({
        name,
        version: String(version).replace(/^\^|~/, ""),
        manager,
        description: null,
        isDev: true,
      }));
      res.json([...deps, ...devDeps]);
    } else if (manager === "pip" || manager === "pip3") {
      const { stdout } = await execAsync("pip3 list --format=json");
      const pkgs = JSON.parse(stdout) as Array<{ name: string; version: string }>;
      res.json(pkgs.map((p) => ({ name: p.name, version: p.version, manager: "pip", description: null, isDev: false })));
    } else {
      res.json([]);
    }
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Package listing error" });
  }
});

router.post("/packages/install", async (req, res): Promise<void> => {
  const parsed = InstallPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, version, manager, dev, path: pkgPath } = parsed.data;
  const start = Date.now();

  const nameWithVersion = version ? `${name}@${version}` : name;
  let cmd: string;
  switch (manager ?? "npm") {
    case "pnpm":
      cmd = `pnpm add ${dev ? "-D " : ""}${nameWithVersion}`;
      break;
    case "yarn":
      cmd = `yarn add ${dev ? "--dev " : ""}${nameWithVersion}`;
      break;
    case "pip":
    case "pip3":
      cmd = `pip3 install ${nameWithVersion}`;
      break;
    default:
      cmd = `npm install ${dev ? "--save-dev " : ""}${nameWithVersion}`;
  }

  try {
    const { stdout } = await execAsync(cmd, { cwd: pkgPath ?? ".", timeout: 120000 });
    incrementToolCall("install_package", Date.now() - start, false);
    res.json({ success: true, output: stdout, duration: (Date.now() - start) / 1000 });
  } catch (err: unknown) {
    incrementToolCall("install_package", Date.now() - start, true);
    const msg = err instanceof Error ? err.message : "Install error";
    res.status(400).json({ error: msg });
  }
});

router.post("/packages/uninstall", async (req, res): Promise<void> => {
  const parsed = UninstallPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, manager, path: pkgPath } = parsed.data;
  const start = Date.now();

  let cmd: string;
  switch (manager ?? "npm") {
    case "pnpm": cmd = `pnpm remove ${name}`; break;
    case "yarn": cmd = `yarn remove ${name}`; break;
    case "pip":
    case "pip3": cmd = `pip3 uninstall -y ${name}`; break;
    default: cmd = `npm uninstall ${name}`;
  }

  try {
    const { stdout } = await execAsync(cmd, { cwd: pkgPath ?? ".", timeout: 60000 });
    res.json({ success: true, output: stdout, duration: (Date.now() - start) / 1000 });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Uninstall error" });
  }
});

export default router;
