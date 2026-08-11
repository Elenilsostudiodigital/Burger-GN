import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import couponsRouter from "./coupons";
import deliveryZonesRouter from "./delivery_zones";
import deliveryStreetsRouter from "./delivery_streets";
import kmDeliveryRouter from "./km_delivery";
import settingsRouter from "./settings";
import ordersRouter from "./orders";
import importRouter from "./import";
import paymentsRouter from "./payments";
import financialRouter from "./financial";
import salesDashboardRouter from "./salesDashboard";
import clubeRouter from "./clube";
import clientesRouter from "./clientes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(couponsRouter);
router.use(deliveryZonesRouter);
router.use(deliveryStreetsRouter);
router.use(kmDeliveryRouter);
router.use(settingsRouter);
router.use(ordersRouter);
router.use(importRouter);
router.use(paymentsRouter);
router.use(financialRouter);
router.use(salesDashboardRouter);
router.use(clubeRouter);
router.use(clientesRouter);

export default router;
