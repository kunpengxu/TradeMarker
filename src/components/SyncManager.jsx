import { useEffect } from 'react'
import { isGitHubSyncConfigured, loadFromGitHub, saveToGitHub } from '../services/githubSync'

export default function SyncManager() {
  useEffect(() => {
    let timer
    const save = () => {
      clearTimeout(timer)
      timer = setTimeout(() => saveToGitHub().catch(() => {}), 1200)
    }
    if (isGitHubSyncConfigured()) loadFromGitHub().then((result) => {
      if (result.status === 'loaded') window.location.reload()
    }).catch(() => {})
    window.addEventListener('trademarker:data-changed', save)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('trademarker:data-changed', save)
    }
  }, [])
  return null
}
