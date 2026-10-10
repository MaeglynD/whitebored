# Cost controls

Whitebored is configured for **Workers Free + R2 Standard**. The owner confirmed Workers Free on 10 October 2026; the R2 account had no buckets before Whitebored setup. Keep Workers Free: its compute and SQLite Durable Object quotas stop excess use rather than creating an overage bill. A paid Workers plan would remove that protection.

## R2 limits

Every media read and upload passes through one persistent `MediaBudget` Durable Object. It reserves allowance **before** calling R2. Reservations are atomic across all boards, including concurrent uploads, and survive Worker restarts. Failed R2 operations still consume the reservation because Cloudflare may count them.

| Resource                                  | Whitebored ceiling          | R2 Standard free allowance      |
| ----------------------------------------- | --------------------------- | ------------------------------- |
| Stored media, across all boards           | 2 GB (decimal)              | 10 GB-month per month           |
| Stored objects                            | 10,000                      | No separate object-count charge |
| Class A operations, including audit lists | 50,000 per rolling 32 days  | 1 million per month             |
| Class B operations                        | 500,000 per rolling 32 days | 10 million per month            |

The 32-day window avoids depending on the account's billing anniversary. The bucket stays private, with no public domain, `r2.dev` endpoint, S3 credentials in the app, or second Worker accessing it. Media stays in Standard storage; no paid transformations, replication, events, or logging are configured. The checked-in ceilings cannot be increased by environment variables; test overrides can only lower them.

This targets **$0 usage charges under the current free allowances**. It is an application safeguard, not a Cloudflare contractual spending cap. Other projects using this account, administrator uploads, changing the code or plan, and future pricing changes are outside its protection. Recheck the shared free allowance before using R2 for another project. R2 rounds billable operation usage up to a million, so even a small overage need not cost only pennies.

## Automatic shutdown

A Cloudflare Cron Trigger runs every 15 minutes. It audits the private R2 bucket against the reserved objects and sizes. Untracked objects, unexpected sizes, or an excessive total **latch media access off** in durable storage. Normal redeployment does not clear this latch. Audit list requests themselves consume the Class A budget.

If the audit cannot run successfully for an hour, media access stops until an audit succeeds. Quota checks still run on every request; they do not wait for this scheduled check or Cloudflare billing reports. When a limit is reached, media operations return an error before the next R2 operation. Storage exhaustion blocks uploads. Operation limits expire as usage leaves the rolling window.

Existing local boards remain usable. Document collaboration can continue when only media is paused; it remains under Workers Free quotas. At provider compute/storage quotas, collaboration may also become unavailable. Keep unsynced shared tabs open or use **Save local copy**. Cleanup remains permitted by the media guard: owner revocation deletes known media using R2's free delete operations.

Cloudflare Workers use an R2 **binding**, not a billing API key. Revoking a deployment token would not disable an already deployed binding. The guard therefore stops the actual R2 calls.

## Emergency shutdown

Set `SHARING_ENABLED` to `"false"` in `wrangler.jsonc`, then deploy the change. This disables the collaboration API while keeping the static app and local boards available. Existing sockets close when they next send application messages on the updated Worker. To deploy an immediate override from a logged-in machine:

```sh
pnpm exec wrangler deploy --var SHARING_ENABLED:false
```

Also commit the configuration change before the next automatic deployment, which otherwise restores the checked-in value. This does not delete stored boards. Stored media remains below the app's 2 GB ceiling. It does not disable unrelated Workers or alter account billing.

An audit latch requires investigation of the bucket and ledger before manually clearing `media_budget_state.halted` in the **MediaBudget Durable Object's SQL explorer**. Never reset the ledger, rename `media-budget-v1`, or create a fresh quota namespace while retaining existing media: doing so loses the reservations. The initial audit rejects an untracked nonempty bucket, but it cannot reconstruct historical operation counts.

## Verification

`pnpm test` exercises the production guard in Cloudflare's local emulator: concurrent uploads at the storage ceiling, operation exhaustion, rolling-window expiry, stale audits, persistent shutdown after an audit mismatch, and deletion while paused. `pnpm test:sharing` checks two independent browsers, authorization, revocation, media portability, reconnection, and mobile layout. No test spends production R2 allowance.

References: [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects Free behavior](https://developers.cloudflare.com/durable-objects/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [budget alerts do not cap usage](https://developers.cloudflare.com/billing/manage/budget-alerts/), [Worker bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/).
