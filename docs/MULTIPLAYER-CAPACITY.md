# Multiplayer capacity and hosting

Research and measurements: 10 October 2026. Prices can change. This report separates measured behavior, capacity models, and provider guarantees.

**Recommendation:** keep Workers Free for small-group evaluation. For sustained public collaboration, use a fixed-price VPS with included traffic and finite disk space. Paid Cloudflare is a good technical fit, but its standard pricing does not satisfy a strict maximum bill.

## Drawing is the first bottleneck

`tests/capacity.test.ts` runs the installed tldraw 5.4.2 `SQLiteSyncStorage` and its actual Durable Object SQLite wrapper in Cloudflare's local emulator. Three hundred single-shape commits produce **1,200 row/index writes: four per commit**. The test measures each SQL cursor's `rowsWritten`, rather than counting SQL statements. Presence-only cursor motion does not persist drawing records.

The installed client sends collaborative changes at up to 30 sync frames/second. Solo operation uses a lower rate; actual work is intermittent. A frame can contain multiple records. Combining our single-record measurement with the Free write quota gives:

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
| One single-record commit/second in total                         | About 6.9 hours                          |

These are arithmetic scenarios, **not measured production endurance or guaranteed uptime**. Moving many selected shapes costs more than moving one. Idle visitors are not equivalent to continuous drawers, so a single “supports N users” claim would be misleading.

Free account allowances include 100,000 Durable Object request units/day, 13,000 GB-seconds/day, five million SQLite row reads/day, 100,000 row writes/day and 5 GB stored. Incoming WebSocket messages count at 20:1 for request billing; outgoing messages do not. Hibernation-eligible idle objects avoid duration use; alarm updates also write rows. [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Two million incoming messages correspond to approximately 18.5 person-hours at 30 messages/second, ignoring HTTP/RPC/alarm usage. The duration allowance corresponds to roughly 28 active room-hours at 128 MB per room if rooms remain awake continuously. Hibernation makes sparse sessions cheaper. The first exhausted resource stops its operation; allowances do not add together.

Workers have a separate Free allowance of 100,000 dynamic requests/day and a CPU allowance per invocation. Static Assets requests are free and unlimited on the static-serving path. WebSocket upgrades count as requests; subsequent messages do not count as Worker HTTP requests. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

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

That fits predictable spending better than upgrading Workers. It adds operating work: OS/security updates, firewall/TLS, restarts, disk monitoring, backups and tested restoration. One server is a single failure domain. Performance needs a multi-client soak test on the selected machine before claiming concurrency. Finite resources limit capacity without automatically expanding the bill; purchased extras and renewal changes remain possible.

Railway advertises a **compute hard limit** that shuts down workloads, making it worth considering for managed operation. I have not established a contractual zero-overshoot guarantee for every billing category, so would not equate it with a verified fixed-resource contract. DigitalOcean's ordinary spend alerts explicitly do not cap expenditure. [Railway controls](https://docs.railway.com/pricing/cost-control), [DigitalOcean alerts](https://docs.digitalocean.com/platform/billing/spend-alerts/)

No paid plan, VPS, or recurring subscription was purchased during this update. A VPS migration is a separate step after selecting an exact plan. Existing shared snapshots and media must be transferred before retiring the Cloudflare room service.

## Evidence and limits of the review

Tests exercise two-browser synchronization, identities, joins/leaves, offline reconciliation, owner revocation, local media copies, interrupted-stop recovery, 20-session admission, expiry, byte limits, atomic competing uploads, network limits and byte-exact chunked media storage. SQL writes are measured using the installed library.

This is not an independent security audit, production stress test, or promise of bug-free software. The spending statement is narrower: **with the final bindings and Workers Free unchanged, this app has no R2 path and relies on Cloudflare's Free enforcement to stop excess operations**. Bugs can still cause outages or data loss. Keep exports of important boards. [Exact operating limits](COST-CONTROLS.md)
