// src/controllers/subscription.controller.ts
import { Request, Response } from "express";
import { UserService } from "../services/UserService";
import { getDodoProvider } from "../payments/DodoProvider";

export class SubscriptionController {
  // GET /api/subscription/portal
  // Same contract as Cardlytics: 404 no_billing_account if the user never
  // paid, otherwise { portalUrl } → Dodo-hosted page where the customer can
  // cancel, resume, update their card and download invoices.
  static async getPortal(req: Request, res: Response): Promise<void> {
    try {
      const customerId = await UserService.getDodoCustomerId(req.user!.atlassianId);
      if (!customerId) {
        res.status(404).json({ error: "no_billing_account" });
        return;
      }
      const portalUrl = await getDodoProvider().createPortalSession(customerId);
      res.json({ portalUrl });
    } catch (err) {
      console.error("SubscriptionController.getPortal failed", err);
      res.status(500).json({ error: "internal_error" });
    }
  }
}
