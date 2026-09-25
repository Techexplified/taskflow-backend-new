// src/controllers/webhook.controller.ts
import { Request, Response } from "express";
import { getDodoProvider } from "../payments/DodoProvider";
import { WebhookNormalizer } from "../payments/WebhookNormalizer";
import { PaymentService } from "../services/PaymentService";
import { env } from "../config/env";

const normalizer = new WebhookNormalizer();

export class WebhookController {
  // POST /webhooks/dodo — PUBLIC route, no authMiddleware
  static async handleDodo(req: Request, res: Response): Promise<void> {
    try {
      const rawBody = req.rawBody?.toString("utf8") || "";

      const webhookId = req.headers["webhook-id"] as string;
      const webhookSignature = req.headers["webhook-signature"] as string;
      const webhookTimestamp = req.headers["webhook-timestamp"] as string;

      if (!webhookId || !webhookSignature || !webhookTimestamp) {
        console.warn("Dodo webhook received without required headers");
        res.status(401).json({ error: "missing_headers" });
        return;
      }

      const headersJson = JSON.stringify({
        "webhook-id": webhookId,
        "webhook-signature": webhookSignature,
        "webhook-timestamp": webhookTimestamp,
      });

      const provider = getDodoProvider();
      const isValid = provider.verifyWebhook(rawBody, headersJson);

      if (!isValid) {
        console.warn("Invalid Dodo webhook signature", req.ip);
        res.status(401).json({ error: "invalid_signature" });
        return;
      }

      const payload = JSON.parse(rawBody);

      // If your Dodo account ever hosts more than one product, this stops
      // an event meant for a different product from activating Pro here.
      // Harmless no-op if TaskFlow is the only product on the account.
      const rawData = payload.data?.payload || payload.data || {};
      const productId = rawData.product_id || "";
      if (productId && productId !== env.DODO_TASKFLOW_PRODUCT_ID) {
        console.log("Dodo webhook ignored — different product", productId);
        res.status(200).json({ ignored: true });
        return;
      }

      console.log("Dodo webhook received", payload.type || payload.event_type);
      const event = normalizer.fromDodo(payload);
      await PaymentService.handleEvent(event);

      res.status(200).json({ received: true });
    } catch (err) {
      console.error(
        "WebhookController.handleDodo failed",
        (err as Error).message,
      );
      // Still 200 — returning an error makes Dodo retry the same event
      // indefinitely, which isn't what we want for a parsing bug.
      res.status(200).json({ received: true });
    }
  }
}
