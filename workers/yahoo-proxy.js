const YAHOO_ORIGIN = 'https://query1.finance.yahoo.com'
const ALLOWED_PATHS = ['/v1/finance/search', '/v8/finance/chart/']

export default {
  async fetch(request) {
    const incoming = new URL(request.url)
    if (!ALLOWED_PATHS.some((path) => incoming.pathname.startsWith(path))) {
      return new Response('Unsupported Yahoo Finance path.', { status: 404 })
    }

    const target = new URL(`${incoming.pathname}${incoming.search}`, YAHOO_ORIGIN)
    const response = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 TradeMarker personal journal' },
    })
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    headers.set('Cache-Control', 'public, max-age=300')
    return new Response(response.body, { status: response.status, headers })
  },
}
