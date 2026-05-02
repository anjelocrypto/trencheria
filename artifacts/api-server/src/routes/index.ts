import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rpcRouter from "./rpc";
import functionsRouter from "./functions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rpcRouter);
router.use(functionsRouter);

export default router;
