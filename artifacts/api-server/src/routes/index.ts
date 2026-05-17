import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import executeRouter from "./execute";
import terminalRouter from "./terminal";
import gitRouter from "./git";
import packagesRouter from "./packages";
import envRouter from "./env";
import authRouter from "./auth";
import logsRouter from "./logs";
import monitoringRouter from "./monitoring";
import mcpRouter from "./mcp";

const router: IRouter = Router();

router.use(healthRouter);
router.use(filesRouter);
router.use(executeRouter);
router.use(terminalRouter);
router.use(gitRouter);
router.use(packagesRouter);
router.use(envRouter);
router.use(authRouter);
router.use(logsRouter);
router.use(monitoringRouter);
router.use(mcpRouter);

export default router;
