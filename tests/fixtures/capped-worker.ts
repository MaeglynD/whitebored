import { CappedMedia } from '../../worker/capped-media'
export { CappedMedia }
export default {
  async fetch(request: Request, env: any) {
    const media = env.CAPPED_MEDIA.getByName('media-sql-v1')
    if (new URL(request.url).pathname === '/status') return Response.json(await media.status())
    return media.fetch(request)
  },
}
