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
const siblingPath = (path, filename) => {
  const parts = path.split('/')
  parts[parts.length - 1] = filename
  return parts.join('/')
}
const hasUserData = (data) => Boolean(
  data?.watchlist?.length ||
  data?.trades?.length ||
  data?.plannedOrders?.length ||
  data?.watchlistGroups?.some((group) => group.symbols?.length),
)
const dataSummary = (data = {}) => ({
  updatedAt: data.updatedAt || null,
  watchlist: data.watchlist?.length || 0,
  trades: data.trades?.length || 0,
  plannedOrders: data.plannedOrders?.length || 0,
  orderCommitments: data.orderCommitments?.length || 0,
})
const timeValue = (value) => {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

export const isGitHubSyncConfigured = () => Object.values(config()).every(Boolean)

async function getRemote(path = config().path, { parseData = true } = {}) {
  const settings = { ...config(), path }
  const response = await fetch(`${apiUrl(settings)}?ref=${encodeURIComponent(settings.branch)}`, { headers: headers(settings.token) })
  if (response.status === 404) return null
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || `GitHub sync failed (${response.status}).`)
  if (!parseData) return { sha: result.sha }
  if (!result.content) throw new Error(`GitHub file ${path} is too large to load through the Contents API. Use the raw file or overwrite it from TradeMarker.`)
  return { sha: result.sha, data: JSON.parse(decode(result.content)) }
}

async function saveJsonFile(path, data, message) {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const settings = { ...config(), path }
  const content = encode(JSON.stringify(data, null, 2))
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const remote = await getRemote(path, { parseData: false })
    const body = {
      message,
      content,
      branch: settings.branch,
      ...(remote?.sha ? { sha: remote.sha } : {}),
    }
    const response = await fetch(apiUrl(settings), { method: 'PUT', headers: { ...headers(settings.token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    if (response.ok) return { status: 'saved', path, attempts: attempt + 1 }
    lastError = new Error(result.message || `GitHub sync failed (${response.status}).`)
    if (response.status !== 409 && !/does not match/i.test(result.message || '')) throw lastError
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
  }
  throw lastError
}

export async function loadFromGitHub({ force = false } = {}) {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const settings = config()
  const remote = await getRemote()
  if (!remote) return { status: 'empty' }
  const local = exportData()
  const summary = dataSummary(remote.data)
  const meta = { path: settings.path, repo: `${settings.owner}/${settings.repo}`, branch: settings.branch, remote: summary }
  const remoteHasUserData = hasUserData(remote.data)
  const localHasUserData = hasUserData(local)
  if (!remoteHasUserData && localHasUserData) return { status: 'skipped-empty-remote', ...meta }
  if (remoteHasUserData && !localHasUserData) {
    importData(remote.data)
    return { status: 'loaded', updatedAt: remote.data.updatedAt, ...meta }
  }
  const localUpdatedAt = getDataUpdatedAt()
  const remoteTime = timeValue(remote.data.updatedAt)
  const localTime = timeValue(localUpdatedAt)
  if (force || !localUpdatedAt || remoteTime > localTime) {
    importData(remote.data)
    return { status: 'loaded', updatedAt: remote.data.updatedAt, ...meta }
  }
  if (localTime > remoteTime) return { status: 'local-newer', updatedAt: localUpdatedAt, ...meta }
  return { status: 'current', updatedAt: remote.data.updatedAt, ...meta }
}

export async function saveToGitHub({ skipIfRemoteCurrent = false } = {}) {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const settings = config()
  const remote = await getRemote()
  const local = exportData()
  const meta = {
    path: settings.path,
    repo: `${settings.owner}/${settings.repo}`,
    branch: settings.branch,
    local: dataSummary(local),
    remote: remote?.data ? dataSummary(remote.data) : null,
  }
  if (!hasUserData(local)) return { status: 'skipped-empty-local' }
  if (remote && hasUserData(remote.data) && !hasUserData(local)) return { status: 'skipped-empty-local' }
  if (skipIfRemoteCurrent && remote?.data?.updatedAt && local.updatedAt) {
    const remoteTime = timeValue(remote.data.updatedAt)
    const localTime = timeValue(local.updatedAt)
    if (remoteTime > localTime) return { status: 'remote-newer', updatedAt: remote.data.updatedAt, ...meta }
    if (remoteTime === localTime) return { status: 'current', updatedAt: remote.data.updatedAt, ...meta }
  }
  return { ...(await saveJsonFile(settings.path, local, 'Update TradeMarker data')), ...meta }
}

export async function savePortfolioSummaryToGitHub(summary) {
  const settings = config()
  const path = siblingPath(settings.path, 'portfolio-summary.json')
  return saveJsonFile(path, summary, 'Update TradeMarker portfolio summary')
}

export async function saveMarketAnalysisToGitHub(analysis) {
  const settings = config()
  const path = siblingPath(settings.path, 'market-analysis.json')
  return saveJsonFile(path, analysis, 'Update TradeMarker market analysis')
}

export async function saveEventsCalendarToGitHub(events) {
  const settings = config()
  const path = siblingPath(settings.path, 'events-calendar.json')
  return saveJsonFile(path, events, 'Update TradeMarker events calendar')
}

export async function loadEventsCalendarFromGitHub() {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const settings = config()
  const path = siblingPath(settings.path, 'events-calendar.json')
  const remote = await getRemote(path)
  if (!remote) return { status: 'empty', path }
  return { status: 'loaded', path, data: remote.data }
}

export async function loadOrderPlanFromGitHub(filename = 'order-plan.json') {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const settings = config()
  const path = siblingPath(settings.path, filename)
  const remote = await getRemote(path)
  if (!remote) return { status: 'empty', path }
  return { status: 'loaded', path, data: remote.data }
}
