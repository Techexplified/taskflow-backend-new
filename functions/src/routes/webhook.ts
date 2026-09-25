// src/routes/webhook.ts
import { Router } from "express";
import { WebhookController } from "../controllers/webhook.controller";

const webhookRouter = Router();
webhookRouter.post("/dodo", WebhookController.handleDodo);

export default webhookRouter;
