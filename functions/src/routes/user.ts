// src/routes/user.ts
import { Router } from "express";
import { UserController } from "../controllers/user.controller";

const userRouter = Router();

// GET /api/users/me
userRouter.get("/me", UserController.getMe);

export default userRouter;
