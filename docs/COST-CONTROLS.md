# Spending boundary and operating limits

Reviewed 10 October 2026. The supported capped configuration is **Workers Free, SQLite Durable Objects, and Workers Static Assets**. Shared media uses bounded SQLite blobs. The final production configuration has no R2 binding or R2 audit cron.

Cloudflare states that Free-plan Durable Object operations fail when their quotas are exhausted; daily quotas reset at 00:00 UTC. This provider-enforced boundary is why this deployment stays on Free. It does not depend on our code polling a bill quickly enough. [Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

This is conditional on the account remaining on **Workers Free**. An administrator upgrading the account changes that boundary for this app too. Domain renewals, licenses, other projects, and separately enabled products are outside it. The current CLI cannot independently inspect the billing subscription; the account owner confirmed Free. Budget notifications **do not cap charges**. [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)

## Why R2 was removed

The previous implementation reserved R2 operations in a durable ledger before access and audited the bucket periodically. That was better than a delayed billing alarm, but remained application code protecting a metered product. Revoking a deployment API token would not disable a deployed Worker's R2 binding.

The replacement has no object-storage calls. The R2 binding, access code, quota namespace and audit cron were removed. No legacy-data migration is required for this development deployment; the owner explicitly confirmed prior boards do not need preserving. The old bucket was empty when retired. Do not restore an R2-dependent release as an emergency rollback without reviewing its costs.

## Application limits

These are capacity and abuse controls, **not the billing boundary**. Binary units below are exact; the compact UI uses “MB”. They apply server-side to browser and native clients.

| Resource                     | Limit                                                | On reaching it                                   |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Connections to one board     | 20, including owner and extra tabs                   | Additional joins refused                         |
| Shared-board lifetime        | 7 days from creation                                 | Link expires; server data scheduled for deletion |
| Incomplete sharing draft     | 1 hour                                               | Abandoned data removed                           |
| New boards per network       | 10 per UTC day                                       | Creation refused until the next day              |
| New boards across deployment | 100 per UTC day; 100 admitted rooms awaiting cleanup | Creation refused                                 |
| Document                     | 8 MiB, 20,000 records, 512,000 bytes per record      | Oversized edits rejected with a notification     |
| One media file               | 10 MiB                                               | Upload refused                                   |
| One board's media            | 100 MiB or 100 files                                 | Upload refused                                   |
| All shared media             | 512 MiB or 5,000 files                               | Upload refused until space is released           |
| One network's uploads        | 100 MiB or 100 files per UTC day, across all boards  | Upload refused                                   |
| Concurrent uploads           | 2 per room and 2 across the media service            | Retryable busy response                          |
| One connection's traffic     | 120 messages/second; 1 MiB per message               | Connection closed                                |

Creation and upload identities are hashes of Cloudflare's connecting-IP header. **These are network limits, not verified person limits**: people behind one router share them; someone changing IP can evade them. Deployment totals and provider Free quotas remain independent boundaries. Without sign-in, a reliable “one person” quota is not possible.

Pre-upgrade rooms receive seven days on first activation. They are not retroactively entered in the new 100-room admission registry; their per-room limits and provider quotas still apply. Expiry prevents access immediately. Physical cleanup can be delayed if a daily write quota is exhausted. An hourly job revisits the admission registry after quotas recover; slots are released only after cleanup succeeds. This prevents exhausted alarm retries from permanently stranding files. [Alarm retry behavior](https://developers.cloudflare.com/durable-objects/api/alarms/)

Media is immutable. Deleting an image shape keeps its file for undo and occupies capacity until the session ends or expires. Room deletion releases its media capacity. SQLite chunks are 512 KiB, below the documented row limit. Counters update atomically with data, so simultaneous uploads cannot both spend the same remaining space. [SQLite limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

## When something stops working

- A full room affects new joins; existing participants can continue.
- Full media storage blocks uploads, not existing drawing or media reads by design.
- Provider request/read/write/duration exhaustion can affect **every shared board on the account**. Daily resources resume at the UTC reset; full storage needs cleanup.
- Keep disconnected tabs open. Unacknowledged edits are only in memory; save a local copy or editable export when possible. Do not reload an unsynced tab to troubleshoot.
- Private local boards use IndexedDB and the static app independently of the collaboration API. A first visit still needs the static app to be reachable.

Owner **Stop sharing** waits for pending edits, freezes the final server document, saves it locally with media, then revokes the link. Reloading after an interrupted freeze offers owner recovery. Guests can keep their current document and already-loaded media. A guest who never received a file cannot recover it after revocation; save important copies before the owner ends a session.

Normal disconnects update the roster immediately. Silent network loss is detected after approximately 90–120 seconds using heartbeat timestamps and a 30-second check. The roster counts connections, not unique humans.

## Operator actions

`GET /api/capacity` exposes aggregate media usage and capacity without board IDs or keys. Do not poll rapidly: monitoring consumes requests too. It is not a billing dashboard.

To pause collaboration, set `SHARING_ENABLED` to `"false"` in `wrangler.jsonc` and deploy. New API calls fail; existing sockets close when they next send application traffic. Local boards remain available. The final configuration does not need a billing monitor or billing API permissions.

Before changing plans or adding paid bindings, review this boundary again. Workers Free does not cap separately metered products. Tests check behavior, but cannot promise that future code or account changes preserve today's configuration.

For forecasts and a higher-capacity fixed-price option, see [Multiplayer capacity and hosting](MULTIPLAYER-CAPACITY.md).
