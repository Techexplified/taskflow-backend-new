// src/routes/checkout.ts
import { Router } from "express";
import { CheckoutController } from "../controllers/checkout.controller";

const checkoutRouter = Router();

// POST /api/checkout/init
// Protected by authMiddleware (mounted in app.ts)
checkoutRouter.post("/init", CheckoutController.initCheckout);

export default checkoutRouter;
