// src/services/UserService.ts
//
// Thin service layer between the controller and the users collection —
// same separation as Cardlytics' UserService, minus the plan/trial logic
// (no billing here, just identity).

import { getUsersCollection, UserDocument } from "../models/users";

export class UserService {
  // Called on every /me request (after auth middleware has verified the
  // token). If this Trello member hasn't been seen before, create them;
  // otherwise return their existing record.
  static async findOrCreate(
    atlassianId: string,
    email?: string,
    displayName?: string,
  ): Promise<UserDocument> {
    const col = getUsersCollection();
    const existing = await col.findOne({ atlassianId });
    if (existing) return existing;

    const now = new Date();
    const newUser: UserDocument = {
      atlassianId,
      email: email || "",
      displayName: displayName || "",
      created_at: now,
      updated_at: now,
    };

    await col.insertOne(newUser);
    console.log(`New user created — atlassianId=${atlassianId}`);
    return newUser;
  }
}
