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
  productIds: string[];
  occurredAt: Date;
  expiresAt?: Date;
  cancelAtPeriodEnd?: boolean;
  nextBillingDate?: Date;
  // subscription.updated only: Dodo status says the customer should have
  // access right now (active or in the past_due retry window).
  entitled?: boolean;
}

function toDate(v: unknown): Date | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

const TERMINAL_STATUSES = new Set([
  "on_hold",
  "paused",
  "cancelled",
  "expired",
  "failed",
]);

export class WebhookNormalizer {
  // Dodo subscription events:
  //   subscription.active / renewed / plan_changed / unpaused → activated
  //   subscription.updated  → generic change (scheduled cancel shows up here;
  //                           terminal `status` → revoke)
  //   subscription.past_due → keep Pro until past_due_ends_at
  //   subscription.on_hold / paused / cancelled / expired → revoke access
  //   subscription.failed / payment.failed → log only
  //
  // payment.succeeded is intentionally NOT an activation trigger any more:
  // payment payloads carry products in product_cart (no top-level
  // product_id), so the old product filter never ran for them and a payment
  // for ANY product on the Dodo account (e.g. Cardlytics) granted TaskFlow
  // Pro. subscription.active / renewed already cover every activation.
  fromDodo(payload: any, fallbackTimestamp: Date): PaymentEvent {
    const eventType: string = payload?.type || payload?.event_type || "";
    const rawData = payload?.data || payload?.payload || {};
    const data = rawData.payload || rawData;

    const atlassianId: string =
      typeof data?.metadata?.atlassianId === "string"
        ? data.metadata.atlassianId
        : "";
    const subscriptionId: string =
      data?.subscription_id || data?.id || "";
    const customerId: string =
      data?.customer?.customer_id || data?.customer_id || "";

    const productIds: string[] = [];
    if (typeof data?.product_id === "string") productIds.push(data.product_id);
    if (Array.isArray(data?.product_cart)) {
      for (const item of data.product_cart) {
        if (typeof item?.product_id === "string") {
          productIds.push(item.product_id);
        }
      }
    }

    const occurredAt = toDate(payload?.timestamp) ?? fallbackTimestamp;
    const nextBillingDate = toDate(data?.next_billing_date);

    const base = { atlassianId, subscriptionId, customerId, productIds, occurredAt };

    switch (eventType) {
      case "subscription.active":
      case "subscription.renewed":
      case "subscription.plan_changed":
      case "subscription.unpaused": {
        const expiresAt =
          nextBillingDate ?? new Date(occurredAt.getTime() + 31 * 864e5);
        return {
          ...base,
          type: "subscription.activated",
          expiresAt,
          cancelAtPeriodEnd: data?.cancel_at_next_billing_date === true,
        };
      }

      case "subscription.past_due":
        // Renewal charge failed; Dodo keeps retrying until past_due_ends_at,
        // then sends on_hold/cancelled. Keep Pro through that window.
        return {
          ...base,
          type: "subscription.updated",
          cancelAtPeriodEnd: data?.cancel_at_next_billing_date === true,
          nextBillingDate: toDate(data?.past_due_ends_at) ?? nextBillingDate,
          entitled: true,
        };

      case "subscription.updated":
        // `status` is the source of truth. A generic update for a
        // subscription that has already ended must revoke access, not just
        // toggle the cancel flag.
        if (TERMINAL_STATUSES.has(data?.status)) {
          return { ...base, type: "subscription.cancelled" };
        }
        if (data?.status === "past_due") {
          return {
            ...base,
            type: "subscription.updated",
            cancelAtPeriodEnd: data?.cancel_at_next_billing_date === true,
            nextBillingDate: toDate(data?.past_due_ends_at) ?? nextBillingDate,
            entitled: true,
          };
        }
        // cancel_at_next_billing_date is the "scheduled cancellation" flag.
        // The old code also treated `cancelled_at` as the end-of-access date,
        // but that's the moment the cancel was *requested* — using it cut
        // off Pro immediately for someone who'd paid through the period.
        // (Field names verified against the dodopayments SDK types.)
        return {
          ...base,
          type: "subscription.updated",
          cancelAtPeriodEnd: data?.cancel_at_next_billing_date === true,
          nextBillingDate,
          entitled: data?.status === "active",
        };

      case "subscription.on_hold":
      case "subscription.paused":
      case "subscription.cancelled":
      case "subscription.canceled":
      case "subscription.expired":
        return { ...base, type: "subscription.cancelled" };

      case "subscription.failed":
      case "payment.failed":
        return { ...base, type: "payment.failed" };

      default:
        return { ...base, type: "unknown" };
    }
  }
}
