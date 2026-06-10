import { getSettings, saveSettings } from './storage'

const AUTH_TOKEN_KEY = 'trademarker.authToken'
const DEFAULT_AUTH_WORKER_URL = import.meta.env.VITE_TRADEMARKER_AUTH_URL || 'https://trademarker-auth.kunp-xu.workers.dev'

const cleanUrl = (value) => String(value || '').trim().replace(/\/$/, '')
export const getAuthWorkerUrl = () => cleanUrl(getSettings().authWorkerUrl) || DEFAULT_AUTH_WORKER_URL
export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY) || ''
export const clearAuthToken = () => localStorage.removeItem(AUTH_TOKEN_KEY)

export function saveAuthTokenFromHash() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const token = hash.get('auth_token')
  if (!token) return false
  localStorage.setItem(AUTH_TOKEN_KEY, token)
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
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
  const redirect = encodeURIComponent(window.location.href.split('#')[0])
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
  }
  return authFetch('/settings', { method: 'PUT', body: JSON.stringify({ settings: syncedSettings }) })
}

export async function loadSettingsFromAccount() {
  const result = await authFetch('/settings')
  if (!result.settings) return { status: 'empty' }
  saveSettings({ ...getSettings(), ...result.settings })
  return { status: 'loaded', settings: result.settings }
}
