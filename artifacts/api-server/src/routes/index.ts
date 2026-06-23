import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import ordersRouter from "./orders";
import couponsRouter from "./coupons";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(couponsRouter);
router.use(ordersRouter);

export default router;
