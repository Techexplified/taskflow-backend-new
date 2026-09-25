// src/services/PaymentService.ts
import { PaymentEvent } from "../payments/WebhookNormalizer";
import { UserService } from "./UserService";

export class PaymentService {
  // Throws on DB/infra errors so the webhook controller can return 5xx and
  // Dodo retries. Returns normally for events we deliberately ignore.
  static async handleEvent(event: PaymentEvent): Promise<void> {
    if (event.type === "unknown") return;

    if (!event.atlassianId) {
      console.error("Payment event missing atlassianId", {
        type: event.type,
        subscriptionId: event.subscriptionId,
      });
      return;
    }

    switch (event.type) {
      case "subscription.activated":
        await UserService.activatePro(
          event.atlassianId,
          event.occurredAt,
          event.expiresAt!,
          event.subscriptionId,
          event.customerId,
          !!event.cancelAtPeriodEnd,
        );
        return;
      case "subscription.updated":
        await UserService.updateSubscription(
          event.atlassianId,
          event.occurredAt,
          event.subscriptionId,
          !!event.cancelAtPeriodEnd,
          event.nextBillingDate,
          !!event.entitled,
        );
        return;
      case "subscription.cancelled":
        await UserService.deactivatePro(
          event.atlassianId,
          event.occurredAt,
          event.subscriptionId,
        );
        return;
      case "payment.failed":
        console.warn("Payment failed", event.atlassianId, event.subscriptionId);
        return;
    }
  }
}
