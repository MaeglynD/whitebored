# Hosting and costs

Whitebored is a static app on Cloudflare Workers Static Assets. Boards, media, and autosave live in each user's browser or desktop profile. There is no multiplayer service or remote board storage.

## Current setup

- The account remains on **Workers Free**.
- `wrangler.jsonc` contains only static assets and the custom-domain route. There is no Worker application code, database binding, runtime secret, or scheduled job.
- The former `SharedRoom`, `ShareLimits`, and `CappedMedia` namespaces are permanently retired with all their SQLite board, media, and quota data. The earlier `MediaBudget` namespace and `whitebored-media` R2 bucket were already removed.
- Old shared links no longer open shared sessions. Unknown paths return the static not-found page.
- Cloudflare's historical usage charts and deployment records may remain after resource deletion; they are not active board storage.

Cloudflare documents static asset requests as free and unlimited. Workers Free builds have an included monthly allowance; builds stop at the allowance rather than silently upgrading the plan. [Static Assets pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [Builds pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)

Domain renewal and separately subscribed account products are independent of this app. The owner's R2 cancellation remains in place; Whitebored no longer needs R2. Removing this app's resources does not cancel other subscriptions or erase past charges. Do not restore an old multiplayer deployment without deliberately provisioning and reviewing its services again.

The [archived multiplayer investigation](research/MULTIPLAYER-CAPACITY.md) records the earlier capacity measurements and tradeoffs for a possible future implementation. None of its collaboration limits apply to the current local-only app.
