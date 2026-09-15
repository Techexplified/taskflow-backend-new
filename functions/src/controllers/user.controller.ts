// src/controllers/user.controller.ts
import { Request, Response } from "express";
import { UserService } from "../services/UserService";

export class UserController {
  // GET /api/users/me
  // Protected by authMiddleware (mounted in app.ts) — req.user is
  // guaranteed to exist by the time this handler runs.
  static async getMe(req: Request, res: Response): Promise<void> {
    try {
      const { atlassianId, email, displayName } = req.user!;
      const user = await UserService.findOrCreate(
        atlassianId,
        email,
        displayName,
      );

      res.status(200).json({
        atlassianId: user.atlassianId,
        email: user.email,
        displayName: user.displayName,
        created_at: user.created_at,
      });
    } catch (err) {
      console.error("UserController.getMe failed", err);
      res.status(500).json({ error: "internal_error" });
    }
  }
}
