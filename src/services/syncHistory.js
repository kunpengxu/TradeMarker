const SYNC_HISTORY_KEY = 'trademarker.syncHistory'
const MAX_SYNC_HISTORY = 20

const read = () => {
  try {
    const value = localStorage.getItem(SYNC_HISTORY_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

export const getSyncHistory = () => read()

export const recordSyncStatus = (detail = {}) => {
  const entry = {
    status: detail.status || 'unknown',
    message: detail.message || '',
    repo: detail.repo || '',
    branch: detail.branch || '',
    path: detail.path || '',
    local: detail.local || null,
    remote: detail.remote || null,
    at: new Date().toISOString(),
  }
  const next = [entry, ...read()].slice(0, MAX_SYNC_HISTORY)
  localStorage.setItem(SYNC_HISTORY_KEY, JSON.stringify(next))
  return next
}
