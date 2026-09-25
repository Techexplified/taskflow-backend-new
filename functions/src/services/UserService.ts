// src/services/UserService.ts
import { Filter, MongoServerError, UpdateFilter } from "mongodb";
import { getUsersCollection, UserDocument } from "../models/users";

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Renewal webhooks arrive AFTER next_billing_date (charge happens, then the
// event is delivered, possibly with retries). Without a grace window every
// renewing customer briefly loses Pro on their billing day.
const PRO_GRACE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

export interface PlanStatus {
  plan: "free" | "pro";
  isPro: boolean;
  isTrialActive: boolean;
  isActive: boolean; // isPro || isTrialActive
  cancelAtPeriodEnd: boolean;
  expiresAt?: Date;
  trialEndsAt?: Date;
}

// Per-instance cache. NOTE: with maxInstances > 1, a webhook only clears the
// cache on the instance that received it, so other instances can serve a
// stale plan for up to CACHE_TTL. Anything that gates money (checkout) must
// call getPlanStatus(id, { fresh: true }).
const planCache = new Map<string, { result: PlanStatus; cachedAt: number }>();
const CACHE_TTL = 30 * 1000;
const CACHE_MAX_SIZE = 5000;

export function computePlanStatus(
  user: UserDocument | null,
  now = new Date(),
): PlanStatus {
  const base: PlanStatus = {
    plan: "free",
    isPro: false,
    isTrialActive: false,
    isActive: false,
    cancelAtPeriodEnd: false,
  };
  if (!user) return base;

  const proValid =
    user.plan === "pro" &&
    (!user.plan_expires_at ||
      user.plan_expires_at.getTime() + PRO_GRACE_MS > now.getTime());

  if (proValid) {
    return {
      plan: "pro",
      isPro: true,
      isTrialActive: false,
      isActive: true,
      cancelAtPeriodEnd: !!user.cancel_at_period_end,
      expiresAt: user.plan_expires_at,
    };
  }

  const trialActive = !!user.trial_ends_at && user.trial_ends_at > now;
  return {
    ...base,
    isTrialActive: trialActive,
    isActive: trialActive,
    trialEndsAt: user.trial_ends_at,
  };
}

export type ApplyResult = "applied" | "stale" | "no_user";

export class UserService {
  // Atomic find-or-create. The old findOne → insertOne version raced when the
  // Power-Up fired several requests on first load: one succeeded and the rest
  // hit the unique index (E11000) and returned 500.
  static async findOrCreate(
    atlassianId: string,
    email?: string,
    displayName?: string,
  ): Promise<UserDocument> {
    const col = getUsersCollection();
    const now = new Date();
    // Always refresh email/name from Trello when we have them. A user row
    // created first by a payment webhook has them blank, and people also
    // change their Trello name/email over time.
    const profile: Partial<UserDocument> = {};
    if (email) profile.email = email;
    if (displayName) profile.displayName = displayName;

    const doc = await col.findOneAndUpdate(
      { atlassianId },
      {
        ...(Object.keys(profile).length ? { $set: profile } : {}),
        $setOnInsert: {
          atlassianId,
          ...(email ? {} : { email: "" }),
          ...(displayName ? {} : { displayName: "" }),
          plan: "free",
          trial_started_at: now,
          trial_ends_at: new Date(now.getTime() + TRIAL_DURATION_MS),
          created_at: now,
          updated_at: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!doc) throw new Error("findOrCreate: upsert returned no document");
    return doc;
  }

  // Pure read — does NOT write to the DB any more. The old version persisted
  // a downgrade on read, which could race with a renewal webhook and
  // overwrite a freshly-renewed "pro" back to "free".
  static async getPlanStatus(
    atlassianId: string,
    opts: { fresh?: boolean } = {},
  ): Promise<PlanStatus> {
    if (!opts.fresh) {
      const cached = planCache.get(atlassianId);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
        return cached.result;
      }
    }
    const user = await getUsersCollection().findOne({ atlassianId });
    const result = computePlanStatus(user);
    if (planCache.size >= CACHE_MAX_SIZE) planCache.clear();
    planCache.set(atlassianId, { result, cachedAt: Date.now() });
    return result;
  }

  // For the billing portal. Returns null if the user has never paid.
  static async getDodoCustomerId(atlassianId: string): Promise<string | null> {
    const user = await getUsersCollection().findOne(
      { atlassianId },
      { projection: { dodo_customer_id: 1 } },
    );
    return user?.dodo_customer_id || null;
  }

  static clearPlanCache(atlassianId: string): void {
    planCache.delete(atlassianId);
  }

  // Applies a webhook-driven update only if this event is newer than the last
  // one applied to the user. That makes retries/replays no-ops and stops an
  // old, delayed "active" from resurrecting a cancelled subscription.
  private static async applyPaymentUpdate(
    atlassianId: string,
    eventAt: Date,
    update: UpdateFilter<UserDocument>,
    opts: { upsert?: boolean; subscriptionId?: string } = {},
  ): Promise<ApplyResult> {
    const col = getUsersCollection();
    const and: Filter<UserDocument>[] = [
      {
        $or: [
          { last_payment_event_at: { $exists: false } },
          // $lte, not $lt: two DIFFERENT events can share a timestamp, and
          // re-applying an exact duplicate is harmless. Only strictly OLDER
          // events are dropped.
          { last_payment_event_at: { $lte: eventAt } },
        ],
      },
    ];
    // Only let cancel/update events touch the subscription we actually
    // recorded — otherwise cancelling an old/duplicate subscription wipes Pro
    // that's paid for by a different, still-active one.
    if (opts.subscriptionId) {
      and.push({
        $or: [
          { dodo_subscription_id: { $exists: false } },
          { dodo_subscription_id: opts.subscriptionId },
        ],
      });
    }

    const setFields = {
      ...((update.$set as object) || {}),
      last_payment_event_at: eventAt,
      updated_at: new Date(),
    };

    const filter = { atlassianId, $and: and };
    const fullUpdate = { ...update, $set: setFields };
    try {
      const res = await col.updateOne(filter, fullUpdate, {
        upsert: !!opts.upsert,
      });
      UserService.clearPlanCache(atlassianId);
      if (res.matchedCount > 0 || res.upsertedCount > 0) return "applied";
    } catch (err) {
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
      // Duplicate key on upsert means the user row exists but didn't match
      // the filter. Two possible reasons:
      //  (a) the event is stale / for another subscription, or
      //  (b) /me created the row at the same instant (race).
      // Retry once WITHOUT upsert: (b) now matches and applies, (a) doesn't.
      const noInsert: Record<string, unknown> = { ...fullUpdate };
      delete noInsert.$setOnInsert;
      const retry = await col.updateOne(filter, noInsert);
      UserService.clearPlanCache(atlassianId);
      return retry.matchedCount > 0 ? "applied" : "stale";
    }

    const exists = await col.findOne(
      { atlassianId },
      { projection: { _id: 1 } },
    );
    return exists ? "stale" : "no_user";
  }

  // subscription.active / renewed / plan_changed.
  // Upserts: a user who opened checkout without ever loading /me still gets
  // Pro (previously updateOne matched nothing and the payment was lost).
  static async activatePro(
    atlassianId: string,
    eventAt: Date,
    expiresAt: Date,
    dodoSubscriptionId: string,
    dodoCustomerId?: string,
    cancelAtPeriodEnd = false,
  ): Promise<ApplyResult> {
    const now = new Date();

    // Double-purchase detection (two checkout tabs, both paid). We can't
    // safely auto-refund here, so shout in the logs for a manual refund.
    const existing = await getUsersCollection().findOne({ atlassianId });
    if (
      existing?.plan === "pro" &&
      existing.dodo_subscription_id &&
      existing.dodo_subscription_id !== dodoSubscriptionId &&
      computePlanStatus(existing).isPro
    ) {
      console.error(
        `DUPLICATE SUBSCRIPTION — atlassianId=${atlassianId}. Access is now ` +
          `tied to the NEW subscription ${dodoSubscriptionId}. Cancel/refund ` +
          `the OLD one ${existing.dodo_subscription_id} in the Dodo dashboard ` +
          `(cancelling the new one would remove this user's Pro).`,
      );
    }

    const $set: Partial<UserDocument> = {
      plan: "pro",
      plan_expires_at: expiresAt,
      dodo_subscription_id: dodoSubscriptionId,
      cancel_at_period_end: cancelAtPeriodEnd,
    };
    if (dodoCustomerId) $set.dodo_customer_id = dodoCustomerId;

    const result = await UserService.applyPaymentUpdate(
      atlassianId,
      eventAt,
      {
        $set,
        $setOnInsert: {
          email: "",
          displayName: "",
          created_at: now,
          trial_started_at: now,
          trial_ends_at: now, // paid before ever using the trial
        },
      },
      { upsert: true },
    );
    console.log(
      `activatePro ${result} — atlassianId=${atlassianId}, expiresAt=${expiresAt.toISOString()}`,
    );
    return result;
  }

  // subscription.updated / past_due — flags a scheduled cancellation (or its
  // reversal) and keeps the paid-through date in sync. When Dodo says the
  // subscription is entitled (status active / past_due), it also (re)grants
  // Pro — e.g. recovery from on_hold reported only as an update. Only for the
  // subscription we have on record (subscriptionId guard), and only with a
  // real end date, so Pro can never become "forever".
  static async updateSubscription(
    atlassianId: string,
    eventAt: Date,
    subscriptionId: string,
    cancelAtPeriodEnd: boolean,
    nextBillingDate?: Date,
    entitled = false,
  ): Promise<ApplyResult> {
    const $set: Partial<UserDocument> = {
      cancel_at_period_end: cancelAtPeriodEnd,
    };
    if (nextBillingDate) {
      $set.plan_expires_at = nextBillingDate;
      if (entitled) $set.plan = "pro";
    }
    return UserService.applyPaymentUpdate(
      atlassianId,
      eventAt,
      { $set },
      { subscriptionId },
    );
  }

  // Terminal events (cancelled / expired / on_hold / paused) — revoke now.
  static async deactivatePro(
    atlassianId: string,
    eventAt: Date,
    subscriptionId: string,
  ): Promise<ApplyResult> {
    const result = await UserService.applyPaymentUpdate(
      atlassianId,
      eventAt,
      {
        $set: { plan: "free", cancel_at_period_end: false },
        $unset: { plan_expires_at: "" },
      },
      { subscriptionId },
    );
    console.log(`deactivatePro ${result} — atlassianId=${atlassianId}`);
    return result;
  }
}
