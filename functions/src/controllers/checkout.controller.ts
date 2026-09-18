// src/controllers/checkout.controller.ts
import { Request, Response } from "express";
import { UserService } from "../services/UserService";
import { getDodoProvider } from "../payments/DodoProvider";

export class CheckoutController {
  // POST /api/checkout/init
  static async initCheckout(req: Request, res: Response): Promise<void> {
    try {
      const { atlassianId } = req.user!;

      // Already Pro? Don't let them check out again.
      const status = await UserService.getPlanStatus(atlassianId);
      if (status.isPro) {
        res.status(409).json({ error: "already_pro" });
        return;
      }

      const provider = getDodoProvider();
      const session = await provider.createCheckout(atlassianId);

      res.json({ checkoutUrl: session.url });
    } catch (err) {
      console.error("CheckoutController.initCheckout failed", err);
      res.status(500).json({ error: "internal_error" });
    }
  }
}
