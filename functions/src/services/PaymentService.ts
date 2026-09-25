// src/services/PaymentService.ts
import { PaymentEvent } from "../payments/WebhookNormalizer";
import { UserService } from "./UserService";

export class PaymentService {
  static async handleEvent(event: PaymentEvent): Promise<void> {
    if (event.type === "unknown") {
      console.log(
        "Received unknown payment event — ignoring",
        event.atlassianId,
      );
      return;
    }

    if (!event.atlassianId) {
      console.error("Payment event missing atlassianId", event);
      return;
    }

    if (event.type === "subscription.activated") {
      await UserService.activatePro(
        event.atlassianId,
        event.expiresAt!,
        event.subscriptionId,
        event.customerId,
      );
      return;
    }

    if (event.type === "subscription.updated") {
      await UserService.updateCancellationStatus(
        event.atlassianId,
        !!event.cancelAtPeriodEnd,
        event.nextBillingDate,
      );
      return;
    }

    if (event.type === "payment.failed") {
      console.warn("Payment failed", event.atlassianId);
      return;
    }

    if (event.type === "subscription.cancelled") {
      await UserService.deactivatePro(event.atlassianId);
      return;
    }
  }
}
