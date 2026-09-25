// src/routes/subscription.ts
import { Router } from "express";
import { SubscriptionController } from "../controllers/subscription.controller";

const subscriptionRouter = Router();

// GET /api/subscription/portal — protected by authMiddleware (app.ts)
subscriptionRouter.get("/portal", SubscriptionController.getPortal);

export default subscriptionRouter;
