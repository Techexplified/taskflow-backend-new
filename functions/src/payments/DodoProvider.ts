// src/payments/DodoProvider.ts
import DodoPayments from "dodopayments";
import { env } from "../config/env";

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export class DodoProvider {
  private client: DodoPayments;

  constructor() {
    this.client = new DodoPayments({
      bearerToken: env.DODO_API_KEY,
      environment: env.DODO_ENVIRONMENT,
    });
  }

  // Called when a user clicks "Upgrade to Pro"
  async createCheckout(atlassianId: string): Promise<CheckoutSession> {
    const session = await this.client.checkoutSessions.create({
      product_cart: [{ product_id: env.DODO_TASKFLOW_PRODUCT_ID, quantity: 1 }],
      // Travels through to the webhook payload later, so we can link
      // the payment back to this user once that step is built.
      metadata: { atlassianId },
      return_url: env.CHECKOUT_RETURN_URL,
    });

    if (!session.checkout_url) {
      throw new Error("Dodo did not return a checkout_url");
    }

    return {
      url: session.checkout_url,
      sessionId: session.session_id ?? "",
    };
  }
}

// Singleton — avoids constructing a new Dodo client on every request
let cached: DodoProvider | null = null;
export function getDodoProvider(): DodoProvider {
  if (!cached) cached = new DodoProvider();
  return cached;
}
