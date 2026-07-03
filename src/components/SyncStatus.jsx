import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'

const toneFor = (status) => {
  if (status === 'error' || status === 'remote-newer') return 'warning'
  if (status === 'saved' || status === 'loaded' || status === 'current') return 'ok'
  if (status === 'saving' || status === 'pending-save') return 'busy'
  return 'muted'
}

export default function SyncStatus() {
  const { t } = useI18n()
  const [sync, setSync] = useState(null)

  useEffect(() => {
    let timer
    const onStatus = (event) => {
      window.clearTimeout(timer)
      setSync({ ...(event.detail || {}), at: new Date() })
      if (['saved', 'loaded', 'current'].includes(event.detail?.status)) {
        timer = window.setTimeout(() => setSync(null), 5000)
      }
    }
    window.addEventListener('trademarker:auto-sync-status', onStatus)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('trademarker:auto-sync-status', onStatus)
    }
  }, [])

  const text = useMemo(() => {
    if (!sync) return ''
    if (sync.status === 'pending-save') return t('syncPendingSave')
    if (sync.status === 'saving') return t('syncSaving')
    if (sync.status === 'saved') return t('syncSaved')
    if (sync.status === 'loaded') return t('syncLoaded')
    if (sync.status === 'remote-newer') return t('syncRemoteNewer')
    if (sync.status === 'missing-github-settings' || sync.status === 'disabled') return t('syncMissingSettings')
    if (sync.status === 'error') return `${t('syncError')}: ${sync.message || ''}`
    if (sync.status === 'current') return t('syncCurrent')
    return sync.status || ''
  }, [sync, t])

  if (!sync || !text) return null
  return <div className={`sync-status ${toneFor(sync.status)}`}><span />{text}</div>
}
