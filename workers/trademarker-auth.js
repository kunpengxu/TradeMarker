const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

const json = (body, status = 200, request) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(request),
  },
})

const corsHeaders = (request) => {
  const origin = request?.headers?.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const base64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
const encodeJson = (value) => base64Url(textEncoder.encode(JSON.stringify(value)))
const decodeJson = (value) => JSON.parse(textDecoder.decode(fromBase64Url(value)))

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64Url(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)))
}

async function signedState(env, redirectUri) {
  const payload = encodeJson({
    redirectUri,
    nonce: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 600,
  })
  return `${payload}.${await hmac(env.JWT_SECRET, payload)}`
}

async function verifyState(env, state) {
  const [payload, signature] = String(state || '').split('.')
  if (!payload || !signature || signature !== await hmac(env.JWT_SECRET, payload)) throw new Error('Invalid OAuth state.')
  const data = decodeJson(payload)
  if (Date.now() / 1000 > data.exp) throw new Error('OAuth state expired.')
  return data
}

async function signSession(env, user) {
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' })
  const payload = encodeJson({
    sub: String(user.id),
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })
  return `${header}.${payload}.${await hmac(env.JWT_SECRET, `${header}.${payload}`)}`
}

async function verifySession(env, request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Missing session token.')
  const [header, payload, signature] = token.split('.')
  if (!header || !payload || !signature || signature !== await hmac(env.JWT_SECRET, `${header}.${payload}`)) throw new Error('Invalid session token.')
  const data = decodeJson(payload)
  if (Date.now() / 1000 > data.exp) throw new Error('Session expired.')
  return data
}

async function encryptionKey(env) {
  if (!env.CONFIG_ENCRYPTION_KEY) return null
  const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(env.CONFIG_ENCRYPTION_KEY))
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptSettings(env, settings) {
  const key = await encryptionKey(env)
  if (!key) return JSON.stringify({ encrypted: false, settings })
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(JSON.stringify(settings)))
  return JSON.stringify({ encrypted: true, iv: base64Url(iv), ciphertext: base64Url(ciphertext) })
}

async function decryptSettings(env, value) {
  if (!value) return null
  const data = JSON.parse(value)
  if (!data.encrypted) return data.settings || null
  const key = await encryptionKey(env)
  if (!key) throw new Error('Settings are encrypted, but CONFIG_ENCRYPTION_KEY is not configured.')
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(data.iv) }, key, fromBase64Url(data.ciphertext))
  return JSON.parse(textDecoder.decode(plaintext))
}

function sanitizeSettings(input) {
  const allowed = [
    'marketDataProvider',
    'marketDataProviderChosen',
    'fmpApiKey',
    'twelveDataApiKey',
    'marketauxApiKey',
    'yahooProxyUrl',
    'githubOwner',
    'githubRepo',
    'githubBranch',
    'githubDataPath',
    'githubToken',
  ]
  return Object.fromEntries(allowed.map((key) => [key, input?.[key]]).filter(([, value]) => value !== undefined))
}

async function handleCallback(request, env) {
  const url = new URL(request.url)
  const state = await verifyState(env, url.searchParams.get('state'))
  const code = url.searchParams.get('code')
  if (!code) throw new Error('Missing GitHub OAuth code.')
  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  })
  const tokenData = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || 'GitHub OAuth token exchange failed.')
  const userResponse = await fetch(GITHUB_USER_URL, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'TradeMarker auth worker' },
  })
  const user = await userResponse.json()
  if (!userResponse.ok) throw new Error(user.message || 'GitHub user request failed.')
  const session = await signSession(env, user)
  const redirect = new URL(state.redirectUri)
  redirect.searchParams.set('auth_token', session)
  if (!redirect.hash) redirect.hash = '/settings'
  return Response.redirect(redirect.toString(), 302)
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
    try {
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.JWT_SECRET || !env.TRADEMARKER_AUTH) {
        return json({ error: 'Auth worker is missing required environment bindings.' }, 500, request)
      }
      const url = new URL(request.url)
      if (url.pathname === '/') {
        return new Response('TradeMarker auth worker is running.', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders(request) } })
      }
      if (url.pathname === '/auth/github/start') {
        const redirectUri = url.searchParams.get('redirect_uri')
        if (!redirectUri) return json({ error: 'Missing redirect_uri.' }, 400, request)
        const state = await signedState(env, redirectUri)
        const github = new URL(GITHUB_AUTH_URL)
        github.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
        github.searchParams.set('redirect_uri', `${url.origin}/auth/github/callback`)
        github.searchParams.set('scope', 'read:user')
        github.searchParams.set('state', state)
        return Response.redirect(github.toString(), 302)
      }
      if (url.pathname === '/auth/github/callback') return handleCallback(request, env)
      const user = await verifySession(env, request)
      if (url.pathname === '/me') return json({ user }, 200, request)
      if (url.pathname === '/settings' && request.method === 'GET') {
        const stored = await env.TRADEMARKER_AUTH.get(`settings:${user.sub}`)
        return json({ settings: await decryptSettings(env, stored), updatedAt: stored ? new Date().toISOString() : null }, 200, request)
      }
      if (url.pathname === '/settings' && request.method === 'PUT') {
        const body = await request.json()
        const settings = sanitizeSettings(body.settings || body)
        await env.TRADEMARKER_AUTH.put(`settings:${user.sub}`, await encryptSettings(env, settings))
        return json({ status: 'saved', settings }, 200, request)
      }
      return json({ error: 'Not found.' }, 404, request)
    } catch (error) {
      
      return json({ error: error.message || 'Auth request failed.' }, 400, request)
    }
  },
}
