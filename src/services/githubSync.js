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
const rawHeaders = (token) => ({ Accept: 'application/vnd.github.raw+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' })
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
const totalSummaryFilename = 'total_summary.json'
let totalSummaryCache = null
let totalSummaryQueue = Promise.resolve()

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

async function getRemoteJson(path) {
  const settings = { ...config(), path }
  const response = await fetch(`${apiUrl(settings)}?ref=${encodeURIComponent(settings.branch)}`, { headers: rawHeaders(settings.token) })
  if (response.status === 404) return null
  const text = await response.text()
  if (!response.ok) {
    try {
      const result = JSON.parse(text)
      throw new Error(result.message || `GitHub sync failed (${response.status}).`)
    } catch (error) {
      if (error.message?.includes('GitHub sync failed') || error.message) throw error
      throw new Error(`GitHub sync failed (${response.status}).`)
    }
  }
  return JSON.parse(text)
}

const totalSummaryPaths = () => {
  const settings = config()
  return {
    trademarker: settings.path,
    portfolioSummary: siblingPath(settings.path, 'portfolio-summary.json'),
    marketAnalysis: siblingPath(settings.path, 'market-analysis.json'),
    eventsCalendar: siblingPath(settings.path, 'events-calendar.json'),
    totalSummary: siblingPath(settings.path, totalSummaryFilename),
  }
}

const partStatus = (path, data) => ({
  path,
  included: data != null,
  updatedAt: data?.updatedAt || data?.generatedAt || null,
})

async function readOptionalJson(path) {
  try {
    return await getRemoteJson(path)
  } catch {
    return null
  }
}

async function buildTotalSummary(changedKey, changedData) {
  const paths = totalSummaryPaths()
  const existing = totalSummaryCache || await readOptionalJson(paths.totalSummary)
  const parts = {
    trademarker: exportData(),
    portfolioSummary: existing?.portfolioSummary ?? null,
    marketAnalysis: existing?.marketAnalysis ?? null,
    eventsCalendar: existing?.eventsCalendar ?? null,
  }
  if (!existing) {
    const [portfolioSummary, marketAnalysis, eventsCalendar] = await Promise.all([
      changedKey === 'portfolioSummary' ? Promise.resolve(changedData) : readOptionalJson(paths.portfolioSummary),
      changedKey === 'marketAnalysis' ? Promise.resolve(changedData) : readOptionalJson(paths.marketAnalysis),
      changedKey === 'eventsCalendar' ? Promise.resolve(changedData) : readOptionalJson(paths.eventsCalendar),
    ])
    parts.portfolioSummary = portfolioSummary
    parts.marketAnalysis = marketAnalysis
    parts.eventsCalendar = eventsCalendar
  }
  if (changedKey && changedKey !== 'trademarker') parts[changedKey] = changedData
  if (changedKey === 'trademarker') parts.trademarker = changedData || exportData()
  return {
    generatedAt: new Date().toISOString(),
    source: 'TradeMarker',
    purpose: 'Single GPT-ready bundle containing TradeMarker journal data, portfolio summary, market analysis, and events calendar.',
    note: 'This file is generated from local TradeMarker exports. It is reference data only and is not financial advice.',
    files: {
      trademarker: partStatus(paths.trademarker, parts.trademarker),
      portfolioSummary: partStatus(paths.portfolioSummary, parts.portfolioSummary),
      marketAnalysis: partStatus(paths.marketAnalysis, parts.marketAnalysis),
      eventsCalendar: partStatus(paths.eventsCalendar, parts.eventsCalendar),
    },
    trademarker: parts.trademarker,
    portfolioSummary: parts.portfolioSummary,
    marketAnalysis: parts.marketAnalysis,
    eventsCalendar: parts.eventsCalendar,
  }
}

async function saveJsonFile(path, data, message) {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const settings = { ...config(), path }
  const remote = await getRemote(path, { parseData: false })
  const body = {
    message,
    content: encode(JSON.stringify(data, null, 2)),
    branch: settings.branch,
    ...(remote?.sha ? { sha: remote.sha } : {}),
  }
  const response = await fetch(apiUrl(settings), { method: 'PUT', headers: { ...headers(settings.token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || `GitHub sync failed (${response.status}).`)
  return { status: 'saved', path }
}

function queueTotalSummaryUpdate(changedKey, changedData) {
  if (!isGitHubSyncConfigured()) return Promise.resolve({ status: 'disabled' })
  totalSummaryQueue = totalSummaryQueue
    .catch(() => {})
    .then(async () => {
      const paths = totalSummaryPaths()
      const summary = await buildTotalSummary(changedKey, changedData)
      totalSummaryCache = summary
      return saveJsonFile(paths.totalSummary, summary, 'Update TradeMarker total summary')
    })
  return totalSummaryQueue
}

function updateTotalSummaryInBackground(changedKey, changedData) {
  queueTotalSummaryUpdate(changedKey, changedData).catch(() => {})
}

export async function loadFromGitHub({ force = false } = {}) {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const remote = await getRemote()
  if (!remote) return { status: 'empty' }
  const local = exportData()
  const remoteHasUserData = hasUserData(remote.data)
  const localHasUserData = hasUserData(local)
  if (!remoteHasUserData && localHasUserData) return { status: 'skipped-empty-remote' }
  if (remoteHasUserData && !localHasUserData) {
    importData(remote.data)
    return { status: 'loaded', updatedAt: remote.data.updatedAt }
  }
  if (force || !getDataUpdatedAt() || new Date(remote.data.updatedAt) > new Date(getDataUpdatedAt())) {
    importData(remote.data)
    return { status: 'loaded', updatedAt: remote.data.updatedAt }
  }
  return { status: 'current', updatedAt: remote.data.updatedAt }
}

export async function saveToGitHub({ skipIfRemoteCurrent = false } = {}) {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const settings = config()
  const remote = await getRemote()
  const local = exportData()
  if (!hasUserData(local)) return { status: 'skipped-empty-local' }
  if (remote && hasUserData(remote.data) && !hasUserData(local)) return { status: 'skipped-empty-local' }
  if (
    skipIfRemoteCurrent &&
    remote?.data?.updatedAt &&
    local.updatedAt &&
    new Date(remote.data.updatedAt) >= new Date(local.updatedAt)
  ) {
    return { status: 'current', updatedAt: remote.data.updatedAt }
  }
  const result = await saveJsonFile(settings.path, local, 'Update TradeMarker data')
  if (result.status === 'saved') updateTotalSummaryInBackground('trademarker', local)
  return result
}

export async function savePortfolioSummaryToGitHub(summary) {
  const settings = config()
  const path = siblingPath(settings.path, 'portfolio-summary.json')
  const result = await saveJsonFile(path, summary, 'Update TradeMarker portfolio summary')
  if (result.status === 'saved') updateTotalSummaryInBackground('portfolioSummary', summary)
  return result
}

export async function saveMarketAnalysisToGitHub(analysis) {
  const settings = config()
  const path = siblingPath(settings.path, 'market-analysis.json')
  const result = await saveJsonFile(path, analysis, 'Update TradeMarker market analysis')
  if (result.status === 'saved') updateTotalSummaryInBackground('marketAnalysis', analysis)
  return result
}

export async function saveEventsCalendarToGitHub(events) {
  const settings = config()
  const path = siblingPath(settings.path, 'events-calendar.json')
  const result = await saveJsonFile(path, events, 'Update TradeMarker events calendar')
  if (result.status === 'saved') updateTotalSummaryInBackground('eventsCalendar', events)
  return result
}

export async function saveTotalSummaryToGitHub() {
  return queueTotalSummaryUpdate('trademarker', exportData())
}

export async function loadOrderPlanFromGitHub(filename = 'order-plan.json') {
  if (!isGitHubSyncConfigured()) return { status: 'disabled' }
  const settings = config()
  const path = siblingPath(settings.path, filename)
  const remote = await getRemote(path)
  if (!remote) return { status: 'empty', path }
  return { status: 'loaded', path, data: remote.data }
}
