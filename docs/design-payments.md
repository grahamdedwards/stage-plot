# ShowRunr Payments + Subscription — Design Spec v1.0

## Goals

Monetize ShowRunr with a simple, low-friction subscription model. Cover infrastructure costs (Supabase, Vercel, storage), avoid LLM cost exposure, and provide value at a price point that encourages adoption over churn.

---

## Subscription Model

### Tiers

| | Free Trial | Pro (Monthly) | Pro (Annual) |
|---|---|---|---|
| **Price** | $0 | $2/mo | $14/yr (~42% off) |
| **Duration** | 30 days or 5 shows created, whichever first | Ongoing | Ongoing |
| **Songs + Charts** | 50 | 150 | 150 |
| **Shows** | 5 total | 30/mo | 30/mo |
| **AI Co-designer** | BYOA only | BYOA only | BYOA only |

### Key Definitions

- **Show created**: a new show record inserted. Renaming or changing the date does not count as a new show.
- **Song/chart limit**: account-wide (not per-show), since charts are per-song and songs are reused across shows.
- **30 shows/mo**: safety valve against abuse. 1/day is generous for any realistic band or venue use case.

### Trial Behavior

- Trial starts on account creation (profile claim).
- Trial ends at 30 days OR 5 shows created, whichever comes first.
- At trial end: **read-only access**. Existing shows remain viewable, exportable, and shareable. No new shows, no edits.
- No credit card required to start trial.

### Post-Trial Data Retention

- After trial expires without subscribing, data is retained for **180 days**.
- This retention window is disclosed in the trial start messaging and terms.
- After 180 days, shows and songs are deleted. Charts (stored files) are purged.
- If the user subscribes at any point within the 180-day window, full access is restored.

---

## Team / Collaboration Model

- **One owner per show**. The owner holds the subscription.
- **Collaborators are free**. Anyone with a show link can view. Authenticated collaborators can edit (subject to show freeze rules — see `backlog-show-freeze.md`).
- No seat-based pricing. No team/org entity.
- Cross-team collaboration: share show files (YAML export/import). Keep it simple.

---

## Agent Upsell (Future — Not Launch Scope)

Designed into the schema but not built for launch. Ship Pro, validate demand, then layer this on.

| | Pro + AI |
|---|---|
| **Price** | TBD (~$5/mo estimate) |
| **Hosted agent** | Yes (platform-provided Claude API key) |
| **Usage** | N tool calls/mo (TBD based on cost analysis) |
| **Overage** | Hard cap (no surprise bills) |

Key considerations for future design:
- Stripe usage-based billing (metered product) — different from flat subscription
- Need tool-call cost tracking per user
- Hard cap vs. overage pricing — lean toward hard cap for simplicity
- BYOA remains available at all tiers (user's own key, zero platform cost)

---

## Owner / Grandfathering

- Platform owner account (Graham) flagged as `plan: 'owner'` — exempt from billing.
- No Stripe customer record created for owner accounts.
- Owner plan has no limits (songs, shows, etc.).

---

## Stripe Integration

### Approach: Stripe Checkout (Hosted)

- **Stripe Checkout**: redirect to Stripe-hosted payment page for subscription signup.
- **Stripe Customer Portal**: redirect to Stripe-hosted portal for manage/cancel/update payment method.
- No payment forms in ShowRunr UI. Stripe handles PCI compliance, tax, receipts, card updates.

### Stripe Products

1. **ShowRunr Pro Monthly** — $2/mo recurring
2. **ShowRunr Pro Annual** — $14/yr recurring

### Flow

```
[ShowRunr UI]                    [Stripe]
    |                                |
    |-- "Subscribe" CTA ----------->|
    |   (Checkout Session)          |
    |                               |-- Payment page
    |                               |-- Success → redirect to /dashboard?upgraded=1
    |                               |-- Cancel → redirect to /dashboard
    |                                |
    |-- "Manage Subscription" ----->|
    |   (Customer Portal)           |
    |                               |-- Update card, cancel, view invoices
    |                               |-- Return → /dashboard
    |                                |
    |<-- Webhook: subscription ------|
    |    created/updated/deleted     |
    |    → update profiles.plan     |
```

### Webhook Events to Handle

| Event | Action |
|---|---|
| `checkout.session.completed` | Set `profiles.plan = 'pro'`, store `stripe_customer_id` |
| `customer.subscription.updated` | Update plan if changed (e.g., monthly ↔ annual) |
| `customer.subscription.deleted` | Set `profiles.plan = 'expired'`, start 180-day retention clock |
| `invoice.payment_failed` | Set `profiles.plan = 'past_due'`, show banner in UI |

### Database Schema Changes

```sql
-- Migration 006: payments
ALTER TABLE profiles ADD COLUMN plan TEXT NOT NULL DEFAULT 'trial';
-- plan values: 'owner', 'trial', 'pro', 'expired', 'past_due'

ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN trial_started_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE profiles ADD COLUMN plan_expires_at TIMESTAMPTZ;
-- plan_expires_at: set to trial_started_at + 30 days for trial,
-- or subscription end date for cancelled pro.

ALTER TABLE profiles ADD COLUMN shows_created_count INTEGER NOT NULL DEFAULT 0;
-- Incremented on show insert. Used for trial 5-show limit and 30/mo pro limit.

ALTER TABLE profiles ADD COLUMN songs_count INTEGER NOT NULL DEFAULT 0;
-- Incremented/decremented on song library changes. Used for 50/150 limit.
```

### Enforcement Points

| Gate | Check | Behavior |
|---|---|---|
| Create show | `plan` is active + under show limit | Block with upgrade CTA |
| Edit show | `plan` is active (not expired/trial-ended) | Read-only mode with upgrade CTA |
| Add song | `songs_count` < tier limit | Block with upgrade CTA |
| Upload chart | `songs_count` < tier limit | Block with upgrade CTA |
| AI co-designer | Always BYOA (no gate needed at launch) | N/A |

### Monthly Show Counter Reset

- `shows_created_count` for Pro users resets monthly.
- Options: (a) cron job on billing cycle date, (b) store `shows_created_this_period` with `period_start` and check dynamically.
- Lean toward (b) — no cron needed, just compare `shows_created_this_period` against current billing period.

---

## UI Changes

### Pricing / Subscribe

- `/pricing` page — simple tier comparison table (trial vs. pro).
- "Subscribe" CTA → Stripe Checkout redirect.
- Show current plan + status in account/profile section.

### Upgrade CTAs

- When a gated action is blocked, show inline message: "Upgrade to Pro to [create more shows / add more songs / keep editing]" with a button linking to Stripe Checkout.
- Dashboard banner when trial is ending soon (< 7 days or 4/5 shows used).

### Manage Subscription

- "Manage Subscription" link in profile/account area → Stripe Customer Portal redirect.
- Only visible for `plan = 'pro'` or `plan = 'past_due'`.

---

## Environment Variables

```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

---

## Test Marketing

- Price points ($2/mo, $14/yr) are initial — plan to A/B test or adjust based on early feedback.
- The steep annual discount (42% off) is intentional to drive annual adoption and reduce churn management overhead.

---

## Out of Scope (Launch)

- Agent upsell tier (metered billing) — future
- Apple/Google IAP — staying PWA-only, Stripe-only
- Team/org billing — no seat pricing
- Usage analytics dashboard — track internally, surface later
- Promo codes / coupons — add via Stripe dashboard if needed, no custom UI

---

## Open Questions

1. **Monthly show reset mechanism** — dynamic check vs. cron? Leaning dynamic.
2. **Past-due grace period** — how long before downgrading from `past_due` to `expired`? Stripe default retry schedule is ~4 weeks.
3. **Show freeze interaction** — does duplicating a frozen show count toward the monthly show limit? (Probably yes — it's a new show.)
