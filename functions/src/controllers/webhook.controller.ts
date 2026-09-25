// src/controllers/webhook.controller.ts
import { Request, Response } from "express";
import { getDodoProvider } from "../payments/DodoProvider";
import { WebhookNormalizer } from "../payments/WebhookNormalizer";
import { PaymentService } from "../services/PaymentService";
import { TASKFLOW_PRODUCT_IDS } from "../config/env";

const normalizer = new WebhookNormalizer();

const header = (req: Request, name: string): string => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v || "";
};

export class WebhookController {
  // POST /webhooks/dodo — PUBLIC route, authenticated by signature only.
  static async handleDodo(req: Request, res: Response): Promise<void> {
    const rawBody = req.rawBody?.toString("utf8") ?? "";
    const webhookId = header(req, "webhook-id");
    const webhookSignature = header(req, "webhook-signature");
    const webhookTimestamp = header(req, "webhook-timestamp");

    if (!rawBody || !webhookId || !webhookSignature || !webhookTimestamp) {
      res.status(401).json({ error: "missing_headers_or_body" });
      return;
    }

    // standardwebhooks also rejects timestamps older/newer than 5 minutes.
    const isValid = getDodoProvider().verifyWebhook(rawBody, {
      "webhook-id": webhookId,
      "webhook-signature": webhookSignature,
      "webhook-timestamp": webhookTimestamp,
    });
    if (!isValid) {
      console.warn("Invalid Dodo webhook signature", req.ip);
      res.status(401).json({ error: "invalid_signature" });
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Signed but unparseable — retrying won't help.
      res.status(400).json({ error: "invalid_json" });
      return;
    }

    const headerTs = new Date(Number(webhookTimestamp) * 1000);
    const event = normalizer.fromDodo(payload, headerTs);

    // Fail CLOSED: only act on events that are provably for TaskFlow.
    // (Old check skipped the filter whenever product_id was missing.)
    if (
      event.type !== "unknown" &&
      !event.productIds.some((id) => TASKFLOW_PRODUCT_IDS.includes(id))
    ) {
      console.log("Dodo webhook ignored — not a TaskFlow product", {
        type: payload?.type,
        productIds: event.productIds,
      });
      res.status(200).json({ ignored: true });
      return;
    }

    try {
      console.log("Dodo webhook", webhookId, payload?.type);
      await PaymentService.handleEvent(event);
      res.status(200).json({ received: true });
    } catch (err) {
      // DB/infra failure: return 5xx so Dodo RETRIES. The old code returned
      // 200 here, so a Mongo blip meant a customer paid and never got Pro.
      // Retries are safe: stale/duplicate events are no-ops (see
      // UserService.applyPaymentUpdate).
      console.error("Dodo webhook processing failed", webhookId, err);
      res.status(500).json({ error: "processing_failed" });
    }
  }
}
