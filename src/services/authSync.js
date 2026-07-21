import { getSettings, saveSettings } from './storage'

const AUTH_TOKEN_KEY = 'trademarker.authToken'
const DEFAULT_AUTH_WORKER_URL = import.meta.env.VITE_TRADEMARKER_AUTH_URL || 'https://trademarker-auth.kunp-xu.workers.dev'

const cleanUrl = (value) => String(value || '').trim().replace(/\/$/, '')
export const getAuthWorkerUrl = () => cleanUrl(getSettings().authWorkerUrl) || DEFAULT_AUTH_WORKER_URL
export const getAuthToken = () => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}
export const clearAuthToken = () => {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {}
}
export const hasGitHubDataSettings = (settings = getSettings()) => Boolean(
  cleanUrl(settings.githubOwner) &&
  cleanUrl(settings.githubRepo) &&
  cleanUrl(settings.githubBranch) &&
  cleanUrl(settings.githubDataPath) &&
  cleanUrl(settings.githubToken),
)

export function saveAuthTokenFromHash() {
  const search = new URLSearchParams(window.location.search)
  const hashText = window.location.hash.replace(/^#/, '')
  const hash = new URLSearchParams(hashText)
  const token = search.get('auth_token') || hash.get('auth_token')
  if (!token) return false
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
  } catch {}
  search.delete('auth_token')
  const cleanSearch = search.toString()
  const cleanHash = hashText.startsWith('auth_token=') ? '#/settings' : window.location.hash || '#/settings'
  window.history.replaceState(null, '', `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${cleanHash}`)
  return true
}

async function authFetch(path, options = {}) {
  const response = await fetch(`${getAuthWorkerUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Auth sync failed (${response.status}).`)
  return data
}

export function startGitHubLogin() {
  const redirectUrl = new URL(window.location.href.split('#')[0])
  redirectUrl.hash = '/settings'
  const redirect = encodeURIComponent(redirectUrl.toString())
  window.location.href = `${getAuthWorkerUrl()}/auth/github/start?redirect_uri=${redirect}`
}

export async function getAuthUser() {
  if (!getAuthToken()) return null
  return (await authFetch('/me')).user
}

export async function saveSettingsToAccount() {
  const settings = getSettings()
  const syncedSettings = {
    marketDataProvider: settings.marketDataProvider,
    marketDataProviderChosen: settings.marketDataProviderChosen,
    fmpApiKey: settings.fmpApiKey,
    twelveDataApiKey: settings.twelveDataApiKey,
    marketauxApiKey: settings.marketauxApiKey,
    yahooProxyUrl: settings.yahooProxyUrl,
    githubOwner: settings.githubOwner,
    githubRepo: settings.githubRepo,
    githubBranch: settings.githubBranch,
    githubDataPath: settings.githubDataPath,
    githubToken: settings.githubToken,
    chatGptProjectUrl: settings.chatGptProjectUrl,
  }
  return authFetch('/settings', { method: 'PUT', body: JSON.stringify({ settings: syncedSettings }) })
}

export async function loadSettingsFromAccount() {
  const result = await authFetch('/settings')
  if (!result.settings) return { status: 'empty' }
  saveSettings({ ...getSettings(), ...result.settings }, { markDataUpdated: false })
  return { status: 'loaded', settings: result.settings }
}
