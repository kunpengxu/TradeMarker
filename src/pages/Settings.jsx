import { useRef, useState } from 'react'
import { clearData, exportData, getSettings, importData, saveSettings } from '../services/storage'

export default function Settings() {
  const fileRef = useRef()
  const [message, setMessage] = useState('')
  const [apiKey, setApiKey] = useState(() => getSettings().twelveDataApiKey || '')
  const download = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `trademarker-${new Date().toISOString().slice(0, 10)}.json`; link.click()
    URL.revokeObjectURL(url); setMessage('Data exported.')
  }
  const upload = async (event) => {
    try {
      const data = JSON.parse(await event.target.files[0].text())
      importData(data); setMessage('Data imported successfully.')
    } catch (error) { setMessage(error.message) }
    event.target.value = ''
  }
  const clear = () => {
    if (confirm('Permanently clear your entire TradeMarker watchlist, journal, and settings?')) {
      clearData(); setMessage('All local data cleared.')
    }
  }
  const saveMarketData = (event) => {
    event.preventDefault()
    saveSettings({ ...getSettings(), twelveDataApiKey: apiKey.trim() })
    setMessage(apiKey.trim() ? 'Twelve Data API key saved in this browser.' : 'Market data API key removed.')
  }
  return (
    <section><div className="page-head"><div><p className="eyebrow">Local data</p><h1>Settings</h1><p>Your TradeMarker data stays in this browser unless you export it.</p></div></div>
      {message && <p className="notice success">{message}</p>}
      <div className="settings-grid"><form className="panel api-key-panel" onSubmit={saveMarketData}><h2>Real market data</h2><p>Enter a Twelve Data API key to load real quotes and historical daily candles. Availability and delay depend on your Twelve Data plan. <a href="https://twelvedata.com/account/api-keys" target="_blank" rel="noreferrer">Get an API key</a>.</p><label>API key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Twelve Data API key" autoComplete="off" /></label><small>The key stays in this browser and is excluded from exported backups. Because this is a frontend-only app, use a personal restricted key.</small><button type="submit">Save market data key</button></form>
        <div className="panel"><h2>Export data</h2><p>Download a JSON backup containing your watchlist, trades, and settings. Your API key is excluded.</p><button onClick={download}>Export JSON backup</button></div>
        <div className="panel"><h2>Import data</h2><p>Restore a TradeMarker JSON backup. Existing local data will be replaced.</p><input ref={fileRef} hidden type="file" accept="application/json" onChange={upload} /><button className="secondary" onClick={() => fileRef.current.click()}>Choose JSON file</button></div>
        <div className="panel danger-zone"><h2>Clear local data</h2><p>Permanently remove all TradeMarker data stored in this browser.</p><button className="danger-button" onClick={clear}>Clear all local data</button></div></div>
    </section>
  )
}
