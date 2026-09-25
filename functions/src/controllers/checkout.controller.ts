// src/controllers/checkout.controller.ts
import { Request, Response } from "express";
import { UserService } from "../services/UserService";
import { getDodoProvider } from "../payments/DodoProvider";

export class CheckoutController {
  // POST /api/checkout/init
  static async initCheckout(req: Request, res: Response): Promise<void> {
    try {
      const { atlassianId, email, displayName } = req.user!;

      // Make sure the user row exists before they pay.
      await UserService.findOrCreate(atlassianId, email, displayName);

      // fresh: bypass the per-instance cache. A stale cache here (webhook
      // landed on another instance) would let a Pro user buy a second
      // subscription.
      const status = await UserService.getPlanStatus(atlassianId, {
        fresh: true,
      });
      if (status.isPro) {
        res.status(409).json({ error: "already_pro" });
        return;
      }

      const session = await getDodoProvider().createCheckout(atlassianId, email);
      res.json({ checkoutUrl: session.url });
    } catch (err) {
      console.error("CheckoutController.initCheckout failed", err);
      res.status(500).json({ error: "internal_error" });
    }
  }
}
