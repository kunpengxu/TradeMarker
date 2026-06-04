import { exportData, getDataUpdatedAt, getSettings, importData } from './storage.js'

const config = () => {
  const settings = getSettings()
  return {
    owner: settings.githubOwner?.trim(),
    repo: settings.githubRepo?.trim(),
    path: settings.githubDataPath?.trim() || 'data/trademarker.json',
    branch: settings.githubBranch?.trim() || 'main',
    token: settings.githubToken?.trim(),
  }
}

const apiUrl = ({ owner, repo, path }) => `https://api.github.com/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`
const headers = (token) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' })
const encode = (value) => btoa(unescape(encodeURIComponent(value)))
const decode = (value) => decodeURIComponent(escape(atob(value.replace(/\n/g, ''))))

export const isGitHubSyncConfigured = () => Object.values(config()).every(Boolean)

async function getRemote() {
  const settings = config()
  const response = await fetch(`${apiUrl(settings)}?ref=${encodeURIComponent(settings.branch)}`, { headers: headers(settings.token) })
  if (response.status === 404) return null
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || `GitHub sync failed (${response.status}).`)
  return { sha: result.sha, data: JSON.parse(decode(result.content)) }
}

export async function loadFromGitHub({ force = false } = {}) {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const remote = await getRemote()
  if (!remote) return { status: 'empty' }
  if (force || !getDataUpdatedAt() || new Date(remote.data.updatedAt) > new Date(getDataUpdatedAt())) {
    importData(remote.data)
    return { status: 'loaded', updatedAt: remote.data.updatedAt }
  }
  return { status: 'current', updatedAt: remote.data.updatedAt }
}

export async function saveToGitHub() {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const settings = config()
  const remote = await getRemote()
  const body = {
    message: 'Update TradeMarker data',
    content: encode(JSON.stringify(exportData(), null, 2)),
    branch: settings.branch,
    ...(remote?.sha ? { sha: remote.sha } : {}),
  }
  const response = await fetch(apiUrl(settings), { method: 'PUT', headers: { ...headers(settings.token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || `GitHub sync failed (${response.status}).`)
  return { status: 'saved' }
}
