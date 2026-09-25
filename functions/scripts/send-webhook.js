// scripts/send-webhook.js
//
// LOCAL TESTING ONLY. Sends a Dodo-style webhook signed with the
// DODO_WEBHOOK_SECRET from your functions/.env, so it passes signature checks
// exactly like a real Dodo event would.
//
// Usage (from the functions folder, while the emulator is running):
//   node scripts/send-webhook.js <event.type> <atlassianId> [options]
//
// Options:
//   --sub <id>             subscription_id          (default sub_test_1)
//   --customer <id>        customer.customer_id     (default cus_test_1)
//   --product <id>         product_id               (default your DODO_TASKFLOW_PRODUCT_ID)
//   --status <s>           data.status              (e.g. active, expired, past_due)
//   --cancel true|false    cancel_at_next_billing_date
//   --next-days <n>        next_billing_date = now + n days (default 30, can be negative)
//   --grace-days <n>       past_due_ends_at  = now + n days
//   --age-min <n>          make the EVENT n minutes old (stale / out-of-order test)
//   --url <url>            webhook URL (default local emulator)

require("dotenv").config({ quiet: true });
const { Webhook } = require("standardwebhooks");

const [type, atlassianId, ...rest] = process.argv.slice(2);
if (!type || !atlassianId) {
  console.log("Usage: node scripts/send-webhook.js <event.type> <atlassianId> [--sub id] [--cancel true] ...");
  process.exit(1);
}
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, "")] = rest[i + 1];

const secret = process.env.DODO_WEBHOOK_SECRET;
if (!secret) {
  console.error("DODO_WEBHOOK_SECRET not found — run this from the functions folder (where .env is).");
  process.exit(1);
}

const days = (n) => new Date(Date.now() + Number(n) * 864e5).toISOString();
const url =
  opt.url ||
  "http://127.0.0.1:5001/explified-app/us-central1/taskflowApi/webhooks/dodo";

const data = {
  payload_type: "Subscription",
  subscription_id: opt.sub || "sub_test_1",
  product_id: opt.product || (process.env.DODO_TASKFLOW_PRODUCT_ID || "").split(",")[0].trim(),
  customer: { customer_id: opt.customer || "cus_test_1" },
  metadata: { atlassianId },
  next_billing_date: days(opt["next-days"] ?? 30),
};
if (opt.status) data.status = opt.status;
if (opt.cancel) data.cancel_at_next_billing_date = opt.cancel === "true";
if (opt["grace-days"]) data.past_due_ends_at = days(opt["grace-days"]);

const eventTime = new Date(Date.now() - Number(opt["age-min"] || 0) * 60000);
const body = JSON.stringify({ type, timestamp: eventTime.toISOString(), data });

// Signature timestamp is always "now" (Dodo rejects anything >5 min off);
// only the event's own `timestamp` is aged for the stale-event test.
const id = "msg_local_" + Date.now();
const now = new Date();
const signature = new Webhook(secret).sign(id, now, body);

fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
    "webhook-signature": signature,
  },
  body,
})
  .then(async (r) => console.log(`${type} → HTTP ${r.status} ${await r.text()}`))
  .catch((e) => console.error("Request failed — is the emulator running?", e.message));
