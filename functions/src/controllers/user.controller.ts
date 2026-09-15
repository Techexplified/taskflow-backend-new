// src/controllers/user.controller.ts
import { Request, Response } from "express";
import { UserService } from "../services/UserService";

export class UserController {
  // GET /api/users/me
  // Creates the user + starts their trial on first call, then returns
  // identity + current plan/trial status every time.
  static async getMe(req: Request, res: Response): Promise<void> {
    try {
      const { atlassianId, email, displayName } = req.user!;
      const user = await UserService.findOrCreate(
        atlassianId,
        email,
        displayName,
      );
      const planStatus = await UserService.getPlanStatus(atlassianId);

      res.status(200).json({
        atlassianId: user.atlassianId,
        email: user.email,
        displayName: user.displayName,
        created_at: user.created_at,
        plan: planStatus.plan,
        isPro: planStatus.isPro,
        isTrialActive: planStatus.isTrialActive,
        isActive: planStatus.isActive,
        trialEndsAt: planStatus.trialEndsAt,
      });
    } catch (err) {
      console.error("UserController.getMe failed", err);
      res.status(500).json({ error: "internal_error" });
    }
  }
}
