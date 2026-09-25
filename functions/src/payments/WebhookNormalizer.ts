// src/payments/WebhookNormalizer.ts

export interface PaymentEvent {
  type:
    | "subscription.activated"
    | "subscription.cancelled"
    | "subscription.updated"
    | "payment.failed"
    | "unknown";
  atlassianId: string;
  subscriptionId: string;
  customerId?: string;
  expiresAt?: Date;
  cancelAtPeriodEnd?: boolean;
  nextBillingDate?: Date;
}

export class WebhookNormalizer {
  // Dodo event names (no subscription.created — "active" IS first activation):
  //   subscription.active / subscription.renewed / subscription.plan_changed → activated
  //   subscription.updated       → generic change (scheduled cancel shows up here)
  //   subscription.on_hold       → renewal payment failed, access paused
  //   subscription.failed        → initial payment failed
  //   subscription.cancelled/canceled/expired → terminal, revoke access
  fromDodo(payload: any): PaymentEvent {
    const eventType = payload.type || payload.event_type || "";
    const rawData = payload.data || payload.payload || {};
    const data = rawData.payload || rawData;

    const atlassianId =
      data?.metadata?.atlassianId || payload?.metadata?.atlassianId || "";
    const subscriptionId =
      data?.subscription_id || data?.payment_id || data?.id || "";
    const customerId = data?.customer?.customer_id || data?.customer_id || "";

    const monthFromNow = () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      return d;
    };

    if (
      eventType === "subscription.active" ||
      eventType === "payment.succeeded"
    ) {
      const expiresAt = data?.next_billing_date
        ? new Date(data.next_billing_date)
        : monthFromNow();
      return {
        type: "subscription.activated",
        atlassianId,
        subscriptionId,
        customerId,
        expiresAt,
      };
    }

    if (
      eventType === "subscription.renewed" ||
      eventType === "subscription.plan_changed"
    ) {
      const expiresAt = data?.next_billing_date
        ? new Date(data.next_billing_date)
        : monthFromNow();
      return {
        type: "subscription.activated",
        atlassianId,
        subscriptionId,
        customerId,
        expiresAt,
      };
    }

    if (eventType === "subscription.on_hold") {
      return {
        type: "subscription.cancelled",
        atlassianId,
        subscriptionId,
        customerId,
      };
    }

    if (eventType === "subscription.failed" || eventType === "payment.failed") {
      return {
        type: "payment.failed",
        atlassianId,
        subscriptionId,
        customerId,
      };
    }

    if (eventType === "subscription.updated") {
      const nextBillingDate = data?.next_billing_date
        ? new Date(data.next_billing_date)
        : undefined;
      const scheduledCancelAt: Date | undefined = data?.cancelled_at
        ? new Date(data.cancelled_at)
        : data?.cancel_at
          ? new Date(data.cancel_at)
          : data?.cancel_at_next_billing_date && nextBillingDate
            ? nextBillingDate
            : undefined;

      return {
        type: "subscription.updated",
        atlassianId,
        subscriptionId,
        customerId,
        cancelAtPeriodEnd: !!scheduledCancelAt,
        nextBillingDate: scheduledCancelAt ?? nextBillingDate,
      };
    }

    if (
      eventType === "subscription.cancelled" ||
      eventType === "subscription.canceled" ||
      eventType === "subscription.expired" ||
      eventType === "subscription.paused"
    ) {
      return {
        type: "subscription.cancelled",
        atlassianId,
        subscriptionId,
        customerId,
      };
    }

    console.log("Dodo webhook: unhandled event type — ignored", eventType);
    return { type: "unknown", atlassianId, subscriptionId, customerId };
  }
}
