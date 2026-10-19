import { Router, type IRouter } from "express";
import crmRouter from "./crm";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(crmRouter);
router.use(healthRouter);

export default router;
