const YAHOO_ORIGIN = 'https://query1.finance.yahoo.com'
const ALLOWED_PATHS = ['/v1/finance/search', '/v8/finance/chart/']

export default {
  async fetch(request) {
    const incoming = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      })
    }
    if (incoming.pathname === '/') {
      const origin = incoming.origin
      return new Response(
        `TradeMarker Yahoo proxy is running.\n\nTest search:\n${origin}/v1/finance/search?q=tesla&quotesCount=5&newsCount=0\n\nTest chart:\n${origin}/v8/finance/chart/TSLA.TO?interval=1d&range=5d\n`,
        { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } },
      )
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed.', { status: 405 })
    }
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
