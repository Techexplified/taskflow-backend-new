import DodoPayments from "dodopayments";
import { Webhook } from "standardwebhooks";
import { env, TASKFLOW_PRODUCT_IDS } from "../config/env";

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export class DodoProvider {
  private client: DodoPayments;
  private webhookVerifier: Webhook;

  constructor() {
    this.client = new DodoPayments({
      bearerToken: env.DODO_API_KEY,
      environment: env.DODO_ENVIRONMENT,
    });
    this.webhookVerifier = new Webhook(env.DODO_WEBHOOK_SECRET);
  }

  async createCheckout(
    atlassianId: string,
    email?: string,
  ): Promise<CheckoutSession> {
    const session = await this.client.checkoutSessions.create({
      product_cart: [{ product_id: TASKFLOW_PRODUCT_IDS[0], quantity: 1 }],
      metadata: { atlassianId },
      ...(email ? { customer: { email } } : {}),
      return_url: env.CHECKOUT_RETURN_URL,
    });

    const dodoCheckoutUrl = session.checkout_url ?? "";
    if (!dodoCheckoutUrl) {
      throw new Error("Dodo did not return a checkout_url");
    }

    // Wrapped behind our branded page. IMPORTANT: that page must only
    // redirect to Dodo's checkout host(s) — see review notes (open redirect).
    const wrappedUrl = `${env.CHECKOUT_WRAPPER_URL}?session=${encodeURIComponent(dodoCheckoutUrl)}`;

    return { url: wrappedUrl, sessionId: session.session_id ?? "" };
  }

  async createPortalSession(customerId: string): Promise<string> {
    const session = await this.client.customers.customerPortal.create(
      customerId,
      { return_url: env.CHECKOUT_RETURN_URL },
    );
    if (!session?.link) throw new Error("Dodo did not return a portal link");
    return session.link;
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    try {
      this.webhookVerifier.verify(rawBody, headers);
      return true;
    } catch (err) {
      console.error("Dodo webhook verification failed:", (err as Error).message);
      return false;
    }
  }
}

let cached: DodoProvider | null = null;
export function getDodoProvider(): DodoProvider {
  if (!cached) cached = new DodoProvider();
  return cached;
}
