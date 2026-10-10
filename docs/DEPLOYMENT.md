# Deploy Whitebored

Whitebored serves a Vite app with Cloudflare Workers Static Assets. Private boards and media stay in the user's IndexedDB. Optional shared copies use a Worker API, one SQLite Durable Object per room, and a private R2 media bucket.

**Live app:** [whitebored.app](https://whitebored.app). The current deployment uses a tldraw trial that expires **17 January 2027**; replace it with a suitable hobby or other active key before that date.

## Cloudflare

`wrangler.jsonc` connects the `whitebored` Worker to `whitebored.app`; Cloudflare manages DNS and HTTPS. Static requests use Static Assets; `/api/*` runs the collaboration Worker. Shared rooms use `ROOMS`, creation quotas use `SHARE_LIMITS`, and the global media guard uses `MEDIA_BUDGET`. All three are SQLite Durable Objects. Only the media guard accesses `MEDIA` (R2 bucket `whitebored-media`).

Before the first deployment with sharing:

1. Keep the account on **Workers Free**. On this plan, Workers and SQLite Durable Objects fail at their free quotas instead of billing excess usage. Do not upgrade without revisiting the cost controls below. Enable **Storage & databases → R2 → Overview**; R2's subscription is separate from the Workers plan.
2. Run `pnpm exec wrangler r2 bucket create whitebored-media`. Keep the bucket private: no public domain, public development URL or CORS rules are needed.
3. Ensure the deployment identity can deploy Workers/Durable Objects and read R2 bucket configuration. The app accesses R2 through its binding, not an embedded API token.
4. Run unit, sharing and browser tests, then deploy. Do not push a production auto-deploy branch with the new binding until the bucket exists.

The deployment uses quotas checked before each R2 operation plus a scheduled audit. See [cost controls and emergency shutdown](COST-CONTROLS.md). These controls cover Whitebored's code and private bucket, not other projects or direct uploads made by an account administrator. R2's free allowance is shared across the account. Existing local-only boards incur no collaboration storage or API use.

With Node.js 24 and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm deploy
```

`wrangler login` opens Cloudflare's OAuth consent page. Keep API tokens out of chat, files tracked by Git, and terminal output. The CLI stores its login outside the project. Forks should change the Worker name and remove or replace the custom-domain route in `wrangler.jsonc` before deploying.

### The tldraw key

Copy `.env.example` to `.env.local` and set `VITE_TLDRAW_LICENSE_KEY` to the public key issued by tldraw. `pnpm deploy` checks for the key before building. This is a client-side public key, not a server secret. Check that it covers the deployment hostname and has not expired.

To establish a URL for a license application, `pnpm deploy:preview` uploads the normal build without requiring a configured key. **The current SDK blocks its canvas on public hostnames without a valid key.** This command does not bypass that check. A [trial or hobby license](https://tldraw.dev/community/license) is needed for a usable public whiteboard. Keep the SDK's attribution and licensing behavior intact.

### Automatic deployment with Cloudflare Builds

Cloudflare Builds is the preferred release path. Connect `MaeglynD/whitebored` under **Workers & Pages → whitebored → Settings → Builds** with these settings:

| Setting                                | Value                                           |
| -------------------------------------- | ----------------------------------------------- |
| Production branch                      | `main`                                          |
| Root directory                         | `/`                                             |
| Build command                          | `pnpm test && pnpm release:check && pnpm build` |
| Deploy command                         | `pnpm exec wrangler deploy`                     |
| Build variable `NODE_VERSION`          | `24`                                            |
| Build variable `PNPM_VERSION`          | `11.25.0`                                       |
| Build secret `VITE_TLDRAW_LICENSE_KEY` | The issued tldraw key                           |

Put the key in **Build variables and secrets**, not runtime Worker variables. Cloudflare can create the deployment token during connection; no Cloudflare secret is needed in GitHub for this path. See [Workers Builds setup](https://developers.cloudflare.com/workers/ci-cd/builds/) and [build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Once connected, pushes or merges to `main` build and publish automatically. Failed unit tests, license configuration checks, or TypeScript/build checks stop publication. GitHub CI also runs the complete browser and offline suite, but Cloudflare does not wait for that separate workflow. For a review-based workflow, require GitHub CI to pass before merging pull requests. Local edits alone never deploy.

### Manual deployment with GitHub Actions

Until Cloudflare Builds is connected, pushing to GitHub runs CI only. Deploy from a logged-in machine with `pnpm deploy`. That command checks the license configuration, builds, and uploads; run the test suite before releasing.

The optional **Deploy web** workflow is manually triggered from GitHub Actions. To use it, set these repository secrets:

| Secret                  | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with Workers deployment and custom-domain permissions for this account and zone |
| `CLOUDFLARE_ACCOUNT_ID` | The account that owns the new Worker                                                                 |
| `TLDRAW_LICENSE_KEY`    | The public key covering the deployment hostname                                                      |

The workflow installs from the lockfile, tests, builds, checks the production app offline, and deploys. It uses the same checked-in configuration as the CLI. A failed check stops deployment. This is an alternative to Cloudflare Builds: leave it unused if Cloudflare handles automatic releases. CLI deployments use the existing Wrangler login instead.

Create the token in **Cloudflare → Manage Account → Account API tokens → Create Token**, using the **Edit Cloudflare Workers** template. Scope it to the deployment account and the `whitebored.app` zone; keep **Workers Routes → Write/Edit** for the custom domain. Then add the two values under [GitHub → Settings → Secrets and variables → Actions](https://github.com/MaeglynD/whitebored/settings/secrets/actions), as **repository secrets**. Do not commit the token or put it in the browser's Vite environment. Run **Actions → Deploy web → Run workflow** on `main`. See [Cloudflare's GitHub Actions setup](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

### Domain and storage

`whitebored.app` is the canonical address. Its route is managed in `wrangler.jsonc`; `pnpm deploy` applies it along with the app. See [Cloudflare's custom-domain documentation](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). The tldraw key must cover the hostname.

Browser storage belongs to an origin. To move boards from the [original address](https://folio.abelian.workers.dev), use **Export all boards** there, open `whitebored.app`, and import that file. The original address remains available for this purpose. A redirect alone cannot transfer IndexedDB data. The same applies to boards created on localhost or any other address.

### Headers, caching, and updates

`public/_headers` is copied into the deployment. Fingerprinted assets cache for a year; HTML, the service worker, and the manifest revalidate. Vite adds the content security policy, including WebSocket connections. API and private media responses use `no-store`, and the service worker excludes `/api/` navigations. Cloudflare provides HTTPS and compression. The local workspace offers **Save & update** when a new service worker is ready; reload shared tabs after their edits have synced.

## Analytics

No analytics script is included. Start with Cloudflare's built-in traffic metrics. If visit analytics become useful, [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/about/) is a free option, but integrate it deliberately: board titles and shared-link fragments must not be sent as analytics data. The script CSP requires an explicit change before a browser beacon can run. Do not enable request logging that captures WebSocket query keys or Authorization headers.

The tldraw trial has its own limited license telemetry, described in [its licensing documentation](https://tldraw.dev/community/license#data-collection). This is separate from app analytics.

## Other hosts

Static-only hosts such as GitHub Pages and Vercel can serve the private-board app from `dist/`, but sharing needs the Worker API and storage bindings. The collaboration client uses the same origin; a different host would need a backend proxy and equivalent access controls. Cloudflare is the supported complete deployment.

Choose one stable public origin. Deploying identical files to several hosts creates separate board libraries on each.

## Before calling a release ready

Open the actual HTTPS URL in a fresh browser. Create and edit a board, reload, import an editable backup, and export the library. Verify the production key works on that hostname, installation works, and the app reopens offline after its initial cache finishes. Test an existing installation's **Save & update** flow as well.

Native installers have a separate [build and signing workflow](GUIDE.md#desktop); a web deployment does not publish a desktop release.
