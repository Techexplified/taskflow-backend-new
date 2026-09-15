// src/services/UserService.ts
import { getUsersCollection, UserDocument } from "../models/users";

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface PlanStatus {
  plan: "free" | "pro";
  isPro: boolean;
  isTrialActive: boolean;
  isActive: boolean; // isPro || isTrialActive
  expiresAt?: Date;
  trialEndsAt?: Date;
}

const planCache = new Map<string, { result: PlanStatus; cachedAt: number }>();
const CACHE_TTL = 60 * 1000;
const CACHE_MAX_SIZE = 5000;

export class UserService {
  // Called on every /me request. First-ever call for a given atlassianId
  // creates the user as free + starts their 7-day trial right then.
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
      plan: "free",
      trial_started_at: now,
      trial_ends_at: new Date(now.getTime() + TRIAL_DURATION_MS),
      created_at: now,
      updated_at: now,
    };

    await col.insertOne(newUser);
    console.log(
      `New user created — 7-day trial started, atlassianId=${atlassianId}, trialEndsAt=${newUser.trial_ends_at}`,
    );
    return newUser;
  }

  // Reads current plan/trial state. Cached 60s per user so repeated
  // Power-Up loads don't hammer Mongo. Does NOT create the user —
  // call findOrCreate() first.
  static async getPlanStatus(atlassianId: string): Promise<PlanStatus> {
    const cached = planCache.get(atlassianId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return cached.result;
    }

    const col = getUsersCollection();
    const user = await col.findOne({ atlassianId });

    if (!user) {
      const result: PlanStatus = {
        plan: "free",
        isPro: false,
        isTrialActive: false,
        isActive: false,
      };
      UserService.setCacheEntry(atlassianId, result);
      return result;
    }

    const now = new Date();

    // Pro plan expired → downgrade to free (relevant once a payment
    // provider is wired in; harmless no-op until then since plan_expires_at
    // is never set today).
    if (
      user.plan === "pro" &&
      user.plan_expires_at &&
      user.plan_expires_at < now
    ) {
      await col.updateOne(
        { atlassianId },
        {
          $set: { plan: "free", updated_at: now },
          $unset: { plan_expires_at: "" },
        },
      );
      const result: PlanStatus = {
        plan: "free",
        isPro: false,
        isTrialActive: false,
        isActive: false,
      };
      UserService.setCacheEntry(atlassianId, result);
      return result;
    }

    if (user.plan === "pro") {
      const result: PlanStatus = {
        plan: "pro",
        isPro: true,
        isTrialActive: false,
        isActive: true,
        expiresAt: user.plan_expires_at,
      };
      UserService.setCacheEntry(atlassianId, result);
      return result;
    }

    // Free plan — check whether the 7-day trial is still running
    const trialActive = !!user.trial_ends_at && user.trial_ends_at > now;
    const result: PlanStatus = {
      plan: "free",
      isPro: false,
      isTrialActive: trialActive,
      isActive: trialActive,
      trialEndsAt: user.trial_ends_at,
    };
    UserService.setCacheEntry(atlassianId, result);
    return result;
  }

  private static setCacheEntry(atlassianId: string, result: PlanStatus): void {
    if (planCache.size >= CACHE_MAX_SIZE) {
      planCache.clear();
    }
    planCache.set(atlassianId, { result, cachedAt: Date.now() });
  }

  static clearPlanCache(atlassianId: string): void {
    planCache.delete(atlassianId);
  }
}
