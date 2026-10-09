# Deploy Folio

Folio is a static Vite app. Boards and media live in the user's browser, in IndexedDB; hosting needs no database or application server.

## Cloudflare

The included configuration uses **Workers Static Assets**. Static requests and asset storage are free under [Cloudflare's current pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). There is no Worker script or paid backend here. Start on the free `workers.dev` address and attach a custom domain when ready.

With Node.js 24 and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm deploy
```

`wrangler login` opens Cloudflare's OAuth consent page. Keep API tokens out of chat, files tracked by Git, and terminal output. The CLI stores its login outside the project. The Worker is named `folio` in `wrangler.jsonc`; change that name if it is already used in your account. Existing sites are not part of this deployment.

### The tldraw key

Copy `.env.example` to `.env.local` and set `VITE_TLDRAW_LICENSE_KEY` to the public key issued by tldraw. `pnpm deploy` checks for the key before building. This is a client-side public key, not a server secret. Check that it covers the deployment hostname and has not expired.

To establish a URL for a license application, `pnpm deploy:preview` uploads the normal build without requiring a configured key. **The current SDK blocks its canvas on public hostnames without a valid key.** This command does not bypass that check. A [trial or hobby license](https://tldraw.dev/community/license) is needed for a usable public whiteboard. Keep the SDK's attribution and licensing behavior intact.

### Repeatable GitHub deployment

The **Deploy web** workflow is manually triggered from GitHub Actions. Set these repository secrets:

| Secret                  | Value                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token scoped to this account, using the Edit Cloudflare Workers template |
| `CLOUDFLARE_ACCOUNT_ID` | The account that owns the new Worker                                                    |
| `TLDRAW_LICENSE_KEY`    | The public key covering the deployment hostname                                         |

The workflow installs from the lockfile, tests, builds, checks the production app offline, and deploys. It uses the same checked-in configuration as the CLI. A failed check stops deployment. Deployments are manual so a source-code push does not unexpectedly replace the public app.

### Domain and storage

Add a domain under **Workers & Pages → folio → Settings → Domains & Routes**. Then update the tldraw license's domain coverage and the repository's live link. A short address such as `draw.your-domain.example` works well; a purchased domain is optional.

Browser storage belongs to an origin. Before moving from `workers.dev` to a custom domain, use **Export all boards**, open the new address, and import that file. Keep the old address available during the move; a redirect alone cannot transfer IndexedDB data.

### Headers, caching, and updates

`public/_headers` is copied into the deployment. Fingerprinted assets cache for a year; HTML, the service worker, and the manifest revalidate. Vite adds the content security policy. Cloudflare provides HTTPS and compression. The installed app offers **Save & update** when a new service worker is ready.

## Analytics

No analytics script is included. Start with Cloudflare's built-in traffic metrics. If visit analytics become useful, [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/about/) is a free option, but integrate it deliberately: Folio's browser title contains the current board name, which must not be sent as analytics data. The existing script CSP also requires an explicit change before a browser beacon can run. Board content should remain local.

The tldraw trial has its own limited license telemetry, described in [its licensing documentation](https://tldraw.dev/community/license#data-collection). This is separate from app analytics.

## Other hosts

- **GitHub Pages:** a good free alternative for this public repository. Publish `dist/` with GitHub Actions. The relative Vite base supports a repository subpath; use the repository's root entry URL.
- **Vercel:** import the repository, choose Vite, set the build command to `pnpm build`, output to `dist`, and configure the tldraw key. Recreate the security/cache headers using Vercel's own configuration.

Choose one stable public origin. Deploying identical files to several hosts creates separate board libraries on each.

## Before calling a release ready

Open the actual HTTPS URL in a fresh browser. Create and edit a board, reload, import an editable backup, and export the library. Verify the production key works on that hostname, installation works, and the app reopens offline after its initial cache finishes. Test an existing installation's **Save & update** flow as well.

Native installers have a separate [build and signing workflow](GUIDE.md#desktop); a web deployment does not publish a desktop release.
