import { useRef, useState } from 'react'
import { clearData, exportData, getSettings, importData, saveSettings } from '../services/storage'

export default function Settings() {
  const fileRef = useRef()
  const [message, setMessage] = useState('')
  const [provider, setProvider] = useState(() => getSettings().marketDataProviderChosen ? getSettings().marketDataProvider : 'yahoo')
  const [fmpApiKey, setFmpApiKey] = useState(() => getSettings().fmpApiKey || '')
  const [twelveDataApiKey, setTwelveDataApiKey] = useState(() => getSettings().twelveDataApiKey || '')
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
    saveSettings({
      ...getSettings(),
      marketDataProvider: provider,
      marketDataProviderChosen: true,
      fmpApiKey: fmpApiKey.trim(),
      twelveDataApiKey: twelveDataApiKey.trim(),
    })
    setMessage(`${provider === 'yahoo' ? 'Yahoo Finance' : provider === 'fmp' ? 'Financial Modeling Prep' : 'Twelve Data'} selected as the market data provider.`)
  }
  return (
    <section><div className="page-head"><div><p className="eyebrow">Local data</p><h1>Settings</h1><p>Your TradeMarker data stays in this browser unless you export it.</p></div></div>
      {message && <p className="notice success">{message}</p>}
      <div className="settings-grid"><form className="panel api-key-panel" onSubmit={saveMarketData}><h2>Reference market data</h2><p>Yahoo Finance is the recommended default for this personal journal because it covers US and Canadian symbols and returns complete daily OHLCV without an API key.</p>
        <label>Data provider<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="yahoo">Yahoo Finance (recommended)</option><option value="fmp">Financial Modeling Prep</option><option value="twelveData">Twelve Data</option></select></label>
        {provider === 'yahoo' ? <p>Yahoo uses an unofficial, no-key endpoint. It may occasionally be blocked by browser CORS rules or rate limiting.</p> : provider === 'fmp' ? <><label>FMP API key<input type="password" value={fmpApiKey} onChange={(event) => setFmpApiKey(event.target.value)} placeholder="Financial Modeling Prep API key" autoComplete="off" /></label><p><a href="https://site.financialmodelingprep.com/developer/docs" target="_blank" rel="noreferrer">Get an FMP API key</a>.</p></> : <><label>Twelve Data API key<input type="password" value={twelveDataApiKey} onChange={(event) => setTwelveDataApiKey(event.target.value)} placeholder="Twelve Data API key" autoComplete="off" /></label><p><a href="https://twelvedata.com/account/api-keys" target="_blank" rel="noreferrer">Get a Twelve Data API key</a>.</p></>}
        <small>Keys stay in this browser and are excluded from exported backups. Because this is a frontend-only app, use personal restricted keys.</small><button type="submit">Save market data settings</button></form>
        <div className="panel"><h2>Export data</h2><p>Download a JSON backup containing your watchlist, trades, and settings. Your API key is excluded.</p><button onClick={download}>Export JSON backup</button></div>
        <div className="panel"><h2>Import data</h2><p>Restore a TradeMarker JSON backup. Existing local data will be replaced.</p><input ref={fileRef} hidden type="file" accept="application/json" onChange={upload} /><button className="secondary" onClick={() => fileRef.current.click()}>Choose JSON file</button></div>
        <div className="panel danger-zone"><h2>Clear local data</h2><p>Permanently remove all TradeMarker data stored in this browser.</p><button className="danger-button" onClick={clear}>Clear all local data</button></div></div>
    </section>
  )
}
