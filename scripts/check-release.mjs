import { loadEnv } from 'vite'
const key =
  process.env.VITE_TLDRAW_LICENSE_KEY ||
  loadEnv('production', process.cwd()).VITE_TLDRAW_LICENSE_KEY
if (!key?.startsWith('tldraw-')) {
  console.error(
    'Public distribution requires a tldraw license. Add VITE_TLDRAW_LICENSE_KEY to .env.local (or the build environment), then retry. Development builds remain available with pnpm build. This presence check does not validate entitlement, domains, or expiry.',
  )
  process.exit(1)
}
console.log(
  'License key is configured. Verify the issued license covers this distribution and production origin before release.',
)
