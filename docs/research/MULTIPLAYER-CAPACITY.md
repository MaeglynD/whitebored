> Archived experiment, retired 10 October 2026. This describes the removed multiplayer implementation, not the live site. Whitebored now serves static files and stores boards only on the user’s device. Code and load-test fixtures mentioned below are available in Git history.

Implementation reference: [245ca2a](https://github.com/MaeglynD/whitebored/tree/245ca2a0bd74a6ca53f2edd47255cb8e65dbd53a).

# Multiplayer capacity and hosting

Research and measurements: 10 October 2026. Prices can change. This report separates measured behavior, capacity models, and provider guarantees.

**Recommendation:** keep Workers Free for small-group evaluation. For sustained public collaboration, use a fixed-price VPS with included traffic and finite disk space. Paid Cloudflare is a good technical fit, but its standard pricing does not satisfy a strict maximum bill.

## Drawing is the first bottleneck

`tests/capacity.test.ts` runs the installed tldraw 5.4.2 `SQLiteSyncStorage` and its actual Durable Object SQLite wrapper in Cloudflare's local emulator. Three hundred single-shape commits produce **1,200 row/index writes: four per commit**. The test measures each SQL cursor's `rowsWritten`, rather than counting SQL statements. Presence-only cursor motion does not persist drawing records.

The installed client sends collaborative changes at up to 30 sync frames/second. Its `SOLO_MODE_FPS` is 1: when no other session is present, it sends at up to one sync frame/second. Opening another tab also counts as another session. These constants and presence selection were checked in the installed `@tldraw/sync-core` and `@tldraw/sync` sources. Actual work is intermittent, and a frame can contain multiple records. Combining our single-record measurement with the Free write quota gives:

```text
100,000 daily writes / 4 writes per commit = 25,000 commits
25,000 / 30 commits per second = 833 seconds ≈ 13.9 active minutes
```

This is **aggregate continuous drawing time across the deployment**, not a 14-minute session timeout. Setup, uploads, alarms, deletions, other account projects and multi-record changes reduce it further.

| Illustrative activity                                            | Time to write ceiling before other usage |
| ---------------------------------------------------------------- | ---------------------------------------- |
| One continuous drawer with a collaborator present                | About 14 minutes                         |
| Two continuous drawers                                           | About 7 minutes                          |
| Five continuous drawers                                          | About 2.8 minutes                        |
| Twenty continuous drawers                                        | About 42 seconds                         |
| One drawer active 10% of the time, otherwise no document changes | About 139 elapsed minutes                |
| One truly solo session, one single-record commit/second          | About 6.9 hours                          |

These are arithmetic scenarios, **not measured production endurance or guaranteed uptime**. A solo session can change many records in one frame, so 6.9 hours is not a solo-use guarantee. Moving many selected shapes costs more than moving one. Idle visitors are not equivalent to continuous drawers, so a single “supports N users” claim would be misleading. Private local boards do not consume this server write allowance.

Free account allowances include 100,000 Durable Object request units/day, 13,000 GB-seconds/day, five million SQLite row reads/day, 100,000 row writes/day and 5 GB stored. Incoming WebSocket messages count at 20:1 for request billing; outgoing messages do not. Hibernation-eligible idle objects avoid duration use; alarm updates also write rows. [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Two million incoming messages correspond to approximately 18.5 person-hours at 30 messages/second, ignoring HTTP/RPC/alarm usage. The duration allowance corresponds to roughly 28 active room-hours at 128 MB per room if rooms remain awake continuously. Hibernation makes sparse sessions cheaper. The first exhausted resource stops its operation; allowances do not add together.

Workers have a separate Free allowance of 100,000 dynamic requests/day and a CPU allowance per invocation. Static Assets requests are free and unlimited on the static-serving path. WebSocket upgrades count as requests; subsequent messages do not count as Worker HTTP requests. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Live audit and dashboard interpretation

On 10 October 2026, the deployed Worker settings confirmed `SHARING_ENABLED=true`, Static Assets, and the three SQLite namespaces (`SharedRoom`, `ShareLimits`, `CappedMedia`), with no R2 binding. The account's R2 bucket listing returned **zero buckets**. The owner's billing screenshot explicitly showed Workers Free and an R2 cancellation scheduled for 10 November 2026. R2's pending cancellation does not create a Whitebored usage path, but the subscription screen cannot rule out charges for earlier usage. Cancellations take effect at the end of the billing period. [Cloudflare cancellation policy](https://developers.cloudflare.com/billing/manage/cancel-subscription/)

An authenticated GraphQL query for 10 October, 00:00–11:50 UTC, returned the following reported counters. Analytics can lag and these are not an invoice or a real-time quota reservation. The query aggregated all namespaces returned for the account:

| Counter                                        | Reported usage    | Free allowance | Approximate fraction |
| ---------------------------------------------- | ----------------- | -------------- | -------------------- |
| SQLite rows written                            | 6,912             | 100,000/day    | 6.91%                |
| SQLite rows read                               | 42,120            | 5,000,000/day  | 0.84%                |
| DO duration                                    | 79.754 GB-seconds | 13,000/day     | 0.61%                |
| DO request units, estimated from request types | About 580         | 100,000/day    | 0.58%                |

The screenshot's SharedRoom namespace had 42,043 row reads and 6,843 row writes: **48,886 combined operations**. Its “49k storage operations” counter was therefore not 49,000 writes. The separate creation/media namespaces account for the remaining totals above. The request estimate applies the documented 20:1 ratio to 8,369 incoming hibernating WebSocket messages and adds 162 HTTP/RPC/alarm invocations. It does not count the 20,045 outbound WebSocket messages as request charges. [Metrics definitions](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/), [billing conversion](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Other screenshot details:

- **36.86 kB stored** is tiny beside the 5 GB account storage allowance; it is this namespace's stored size, not all files in all namespaces.
- **12.69 MB P99 memory** is a sampled high percentile, not a cumulative charge. The runtime has a 128 MB isolate memory limit.
- **69.07 ms wall time** and the 10-second per-instance values are elapsed request measurements, including waiting and long connections; they are not active CPU measurements or cursor latency measurements.
- **Four errors** were classified as client disconnects. The screenshot showed zero CPU-limit, memory-limit and worker-exception errors.
- Huge blue percentage increases compare with the preceding period. They are not percentages of a quota or a bill.
- “Last 24 hours” is a rolling window. Daily Free quotas reset at 00:00 UTC (01:00 BST on this date).

At a write-quota failure, subsequent durable edits cannot be committed. The installed sync server rejects a storage-error session with an unknown-error close; the app retains its last loaded canvas and offers **Keep a copy & continue**. Depending on which provider operation fails, a new visit may instead show temporary unavailability or an existing connection may try reconnecting. There is currently no provider-specific remaining-quota countdown. Shared unsaved changes can remain only in the open tab: keep a local copy before reloading. Previously committed data is not automatically deleted by exhausting a daily allowance. A different room does not obtain a new account allowance.

## How quickly can images fill storage?

Media capacity is deliberately small: **512 MiB across the app, 100 MiB per board, 10 MiB per file**, with independent file-count limits. Database overhead is additional and remains subject to the provider quota.

| Average file size | Files across the app | Files on one board |
| ----------------- | -------------------- | ------------------ |
| 2 MiB             | 256                  | 50                 |
| 5 MiB             | 102                  | 20                 |
| 10 MiB            | 51                   | 10                 |

Twenty participants each uploading one 5 MiB image can fill a board. Across several boards, twenty independent networks uploading one such image per minute could fill global media storage in roughly five minutes. A single network reaches its 100 MiB/day allowance after twenty such uploads. These are easy limits to hit during image-heavy use; the result should be an unavailable upload, not a storage overage bill.

Twenty people opening a board with twenty images also generate hundreds of authenticated media reads and chunk reads. A live tab caches media, but other people and reloads fetch it again. Video has the same file-size cap; Whitebored does not transcode or provide a streaming service. Deleting a shape retains its media for undo until the room ends or expires.

An attacker can consume public request allowances or fill permitted storage. Names/colors are presentation, not authentication. Network limits reduce casual abuse but cannot establish human identity. Provider Free quotas constrain expenditure, not denial of service. Turnstile on room creation would be a reasonable next layer if public abuse appears, without challenging ordinary drawing.

## Canonical architecture and tradeoffs

tldraw's official starter uses **one Durable Object per room, SQLite for documents and R2 for media**. It is a strong default for authoritative synchronization and hibernating WebSockets. The starter leaves production authorization and abuse controls to the application. Whitebored adds separate edit/owner capabilities, origin checks, private immutable media, limits and recovery. [tldraw sync](https://tldraw.dev/docs/sync)

SQLite media is a deliberate compromise for the strict spending requirement, not a general recommendation to put large files in a database. It suits a bounded half-gigabyte deployment and removes a separately metered product. R2 is better suited to a large media library when usage pricing is acceptable. Standard R2 includes 10 GB-month storage, one million Class A and ten million Class B operations, then charges for storage/operations. Downloads have no egress charge. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Reducing persistence frequency could stretch Free usage, but acknowledging changes before durable storage introduces a loss window. Batching records into one transaction does not remove their row writes. We retain the supported SDK's durable synchronization instead of quietly weakening saves to fit a pricing tier.

## Cloudflare alternatives

| Product                       | Fit for this app                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workers Static Assets / Pages | Good frontend hosting. Static hosting alone cannot run authoritative WebSocket rooms. Static Assets can stay if the backend moves.                                                                                                         |
| SQLite Durable Objects        | Appropriate room authority; Free stops at quotas, Paid has metered overages.                                                                                                                                                               |
| R2                            | Appropriate large-file storage, with a separate usage bill. Removed from the final live path.                                                                                                                                              |
| D1                            | Useful central SQL for accounts/catalogues, but does not replace the room coordinator or solve this write ceiling. [Pricing](https://developers.cloudflare.com/d1/platform/pricing/)                                                       |
| KV                            | Useful read-heavy metadata/configuration. Eventual consistency is unsuitable for the sole concurrent drawing authority. [Behavior](https://developers.cloudflare.com/kv/concepts/how-kv-works/)                                            |
| Containers                    | Could host a conventional server, but requires Workers Paid and meters resources; no fixed ceiling benefit. [Pricing](https://developers.cloudflare.com/containers/platform/pricing/)                                                      |
| Images / Stream               | Additional transformation/video-delivery products with their own pricing. Original-file attachments need neither. [Images](https://developers.cloudflare.com/images/pricing/), [Stream](https://developers.cloudflare.com/stream/pricing/) |
| Realtime SFU / TURN           | Audio/video/WebRTC connectivity, not durable board storage. Adds another usage dimension. [Pricing](https://developers.cloudflare.com/realtime/sfu/pricing/)                                                                               |
| Queues / Workflows / Agents   | Background processing or application abstractions; unnecessary for the drawing protocol and not a spending cap.                                                                                                                            |

Budget alerts notify rather than stop spending. Periodic monitoring can react late during a burst; revoking a deployment credential does not disable bound services. Per-invocation CPU limits constrain one request, not the number of requests. None replaces a provider Free boundary or fixed-resource contract. [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## Fixed-price production option

My preferred next deployment is **one UK/EU VPS with included traffic, finite disk, no automatic scaling and no paid object-storage attachment**. Run the same tldraw protocol on its supported Node server/SQLite adapter; store bounded media on disk. Keep the frontend/domain on Cloudflare and proxy a dedicated sync hostname to the VPS. Disk quotas, room admission and process memory limits should turn overload into refusal or restart without ordering extra resources.

OVHcloud currently advertises a small VPS from **£3.97 including VAT/month**, with two vCores, 4 GB RAM, 40 GB NVMe, 500 Mbps and unlimited traffic. A larger advertised option is about **£7.55 including VAT/month**. These are starting prices, not a verified checkout quotation: confirm region, term, renewal, tax and included backup before buying. [OVHcloud UK VPS](https://www.ovhcloud.com/en-gb/vps/)

The advertised configure link uses a 12-month upfront pricing option, so do not read its headline price as a confirmed rolling monthly price. Choose a UK/EU datacentre, Linux, a single VPS, no paid control panel, extra disks, managed database or optional paid backup. OVH explicitly describes its unmetered VPS as fixed-monthly-price service without bandwidth overage fees. Finite CPU, RAM and disk do not grow automatically; reaching them causes degraded service, refused work or a restart, not extra purchased resources. Keep provider purchasing credentials off the application server. Exact order and renewal terms still need review before purchase. [Unmetered VPS terms as advertised](https://www.ovhcloud.com/en-gb/vps/unmetered-vps/)

That fits predictable spending better than upgrading Workers. It adds operating work: OS/security updates, firewall/TLS, restarts, disk monitoring, backups and tested restoration. One server is a single failure domain. Performance needs a multi-client soak test on the selected machine before claiming concurrency. Finite resources limit capacity without automatically expanding the bill; purchased extras and renewal changes remain possible.

Railway advertises a **compute hard limit** that shuts down workloads, making it worth considering for managed operation. I have not established a contractual zero-overshoot guarantee for every billing category, so would not equate it with a verified fixed-resource contract. DigitalOcean's ordinary spend alerts explicitly do not cap expenditure. [Railway controls](https://docs.railway.com/pricing/cost-control), [DigitalOcean alerts](https://docs.digitalocean.com/platform/billing/spend-alerts/)

Hetzner Cloud is inexpensive but bills outgoing traffic beyond the included amount; its server monthly maximum is not an all-in spending ceiling. netcup's fixed-resource VPS offerings with traffic included are another candidate, but current advertised contract terms and prices make OVH the more attractive starting point here. [Hetzner billing FAQ](https://docs.hetzner.com/cloud/billing/faq/), [netcup VPS](https://www.netcup.com/en/server/vps)

Supabase provides a spend cap for selected usage items, but several costs are excluded, and its Realtime product does not replace tldraw's authoritative room server. Moving the existing protocol to it would introduce substantial custom synchronization work. Its free plan is useful for other applications, but is not the straightforward solution here. [Supabase cost controls](https://supabase.com/docs/guides/platform/cost-control), [tldraw server requirements](https://tldraw.dev/docs/sync)

A VPS migration should preserve the current tldraw wire protocol and move its room authority to `TLSocketRoom` + `SQLiteSyncStorage` + `NodeSqliteWrapper`, with private media files on a bounded data volume. SQLite WAL, one room authority, bounded admission, process memory limits, disk reserves, log rotation, restart supervision and backups are the relevant implementation controls. No R2, per-row database billing, autoscaling or paid telemetry is needed. The single machine requires updates and is a failure domain. Run sustained 2-, 10- and 20-client drawing/media tests on that machine before promising a concurrency capacity. There is no 14-minute daily write allowance on this design; actual CPU, disk, network and application limits determine capacity.

No paid plan, VPS, or recurring subscription was purchased during this update. A VPS migration is a separate step after selecting an exact plan. The owner confirmed this is development data, so existing shared snapshots, old links and media do not need migration or compatibility handling.

## Evidence and limits of the review

Tests exercise two-browser synchronization, identities, joins/leaves, offline reconciliation, owner revocation, local media copies, interrupted-stop recovery, 20-session admission, expiry, byte limits, atomic competing uploads, network limits and byte-exact chunked media storage. SQL writes are measured using the installed library.

This is not an independent security audit, production stress test, or promise of bug-free software. The spending statement is narrower: **with the final bindings and Workers Free unchanged, this app has no R2 path and relies on Cloudflare's Free enforcement to stop excess operations**. Bugs can still cause outages or data loss. Keep exports of important boards. [Exact operating limits](../COST-CONTROLS.md)
