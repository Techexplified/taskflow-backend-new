import DodoPayments from "dodopayments";
import { Webhook } from "standardwebhooks";
import { env } from "../config/env";

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export class DodoProvider {
  private client: DodoPayments;
  private webhookVerifier: Webhook | null = null;

  constructor() {
    this.client = new DodoPayments({
      bearerToken: env.DODO_API_KEY,
      environment: env.DODO_ENVIRONMENT,
    });
  }

  async createCheckout(atlassianId: string): Promise<CheckoutSession> {
    const session = await this.client.checkoutSessions.create({
      product_cart: [{ product_id: env.DODO_TASKFLOW_PRODUCT_ID, quantity: 1 }],
      metadata: { atlassianId },
      return_url: env.CHECKOUT_RETURN_URL,
    });

    const dodoCheckoutUrl = session.checkout_url ?? "";
    if (!dodoCheckoutUrl) {
      throw new Error("Dodo did not return a checkout_url");
    }

    // Wrap Dodo's raw checkout URL behind our own domain — the address
    // bar shows the branded "Opening checkout…" page first, which then
    // forwards the user into Dodo's actual hosted checkout. Same pattern
    // as Cardlytics.
    const wrappedUrl = `${env.CHECKOUT_WRAPPER_URL}?session=${encodeURIComponent(dodoCheckoutUrl)}`;

    return {
      url: wrappedUrl,
      sessionId: session.session_id ?? "",
    };
  }

  verifyWebhook(rawBody: string, signatureHeadersJson: string): boolean {
    try {
      if (!this.webhookVerifier) {
        this.webhookVerifier = new Webhook(env.DODO_WEBHOOK_SECRET);
      }
      const headers = JSON.parse(signatureHeadersJson);
      this.webhookVerifier.verify(rawBody, headers);
      return true;
    } catch (err) {
      console.error(
        "Dodo webhook verification failed:",
        (err as Error).message,
      );
      return false;
    }
  }
}

let cached: DodoProvider | null = null;
export function getDodoProvider(): DodoProvider {
  if (!cached) cached = new DodoProvider();
  return cached;
}
