import { useRef, useState } from 'react'
import { clearData, exportData, getSettings, getTrades, getWatchlist, importData, saveSettings, saveTrades, saveWatchlist } from '../services/storage'
import { loadFromGitHub, saveToGitHub } from '../services/githubSync'
import { getMarketSnapshot } from '../services/marketData'
import { buildWealthsimpleActivities, buildWealthsimpleHoldings, createImportedTrade } from '../services/wealthsimpleImport'

export default function Settings() {
  const fileRef = useRef()
  const wealthsimpleRef = useRef()
  const wealthsimpleActivitiesRef = useRef()
  const [message, setMessage] = useState('')
  const [isImportingWealthsimple, setIsImportingWealthsimple] = useState(false)
  const [isImportingActivities, setIsImportingActivities] = useState(false)
  const [provider, setProvider] = useState(() => getSettings().marketDataProviderChosen ? getSettings().marketDataProvider : 'yahoo')
  const [fmpApiKey, setFmpApiKey] = useState(() => getSettings().fmpApiKey || '')
  const [twelveDataApiKey, setTwelveDataApiKey] = useState(() => getSettings().twelveDataApiKey || '')
  const [yahooProxyUrl, setYahooProxyUrl] = useState(() => getSettings().yahooProxyUrl || '')
  const [githubOwner, setGithubOwner] = useState(() => getSettings().githubOwner || 'kunpengxu')
  const [githubRepo, setGithubRepo] = useState(() => getSettings().githubRepo || 'TradeMarkerData')
  const [githubBranch, setGithubBranch] = useState(() => getSettings().githubBranch || 'main')
  const [githubDataPath, setGithubDataPath] = useState(() => getSettings().githubDataPath || 'data/trademarker.json')
  const [githubToken, setGithubToken] = useState(() => getSettings().githubToken || '')
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
  const importWealthsimple = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    try {
      setIsImportingWealthsimple(true)
      const existingWatchlist = getWatchlist()
      const { holdings, totalRows, skippedExisting, skippedRows } = buildWealthsimpleHoldings(await file.text(), file.name, existingWatchlist)
      if (!holdings.length) {
        setMessage(`No new Wealthsimple holdings to import. Skipped ${skippedExisting} symbols already in your watchlist.`)
        return
      }

      const trades = []
      let dateMatches = 0
      for (const holding of holdings) {
        setMessage(`Matching ${holding.symbol} avg cost to Yahoo candles…`)
        let tradeDate = holding.reportDate
        try {
          const snapshot = await getMarketSnapshot(holding.symbol)
          const match = [...snapshot.candles]
            .reverse()
            .find((candle) => holding.avgCost >= Number(candle.low) && holding.avgCost <= Number(candle.high))
          if (match) {
            tradeDate = match.time
            dateMatches += 1
          }
        } catch {
          // If Yahoo cannot load this symbol, still import the position using the report date.
        }
        trades.push(createImportedTrade(holding, tradeDate))
      }

      saveWatchlist([...existingWatchlist, ...holdings.map((holding) => holding.symbol)])
      saveTrades(trades)
      window.dispatchEvent(new CustomEvent('trademarker:data-imported'))
      setMessage(`Imported ${holdings.length} new Wealthsimple symbols from ${totalRows} rows. Skipped ${skippedExisting} already in watchlist and ${skippedRows} invalid rows. Matched ${dateMatches} buy dates by avg cost; unmatched used the report date.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsImportingWealthsimple(false)
      event.target.value = ''
    }
  }
  const importWealthsimpleActivities = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    try {
      setIsImportingActivities(true)
      const { trades, symbols, totalRows, skippedRows, skippedDuplicates } = buildWealthsimpleActivities(await file.text(), getTrades())
      if (!trades.length) {
        setMessage(`No new Wealthsimple trades to import. Skipped ${skippedDuplicates} duplicates and ${skippedRows} non-trade rows.`)
        return
      }
      saveWatchlist([...getWatchlist(), ...symbols])
      saveTrades(trades)
      window.dispatchEvent(new CustomEvent('trademarker:data-imported'))
      setMessage(`Imported ${trades.length} Wealthsimple trades from ${totalRows} activity rows. Added ${symbols.length} symbols to Watchlist if missing. Skipped ${skippedDuplicates} duplicates and ${skippedRows} non-trade rows.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsImportingActivities(false)
      event.target.value = ''
    }
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
      yahooProxyUrl: yahooProxyUrl.trim(),
    })
    setMessage(`${provider === 'yahoo' ? 'Yahoo Finance' : provider === 'fmp' ? 'Financial Modeling Prep' : 'Twelve Data'} selected as the market data provider.`)
  }
  const saveGitHubSettings = (event) => {
    event.preventDefault()
    saveSettings({ ...getSettings(), githubOwner: githubOwner.trim(), githubRepo: githubRepo.trim(), githubBranch: githubBranch.trim(), githubDataPath: githubDataPath.trim(), githubToken: githubToken.trim() })
    setMessage('GitHub sync settings saved. Changes will now sync automatically.')
  }
  const runGitHubSync = async (direction) => {
    try {
      setMessage(direction === 'load' ? 'Loading data from GitHub…' : 'Saving data to GitHub…')
      const result = direction === 'load' ? await loadFromGitHub({ force: true }) : await saveToGitHub()
      const labels = {
        empty: 'No TradeMarker data file exists in GitHub yet.',
        'skipped-empty-local': 'Skipped GitHub save because this browser has no watchlist or trades.',
        'skipped-empty-remote': 'Skipped GitHub load because the remote file is empty and local data exists.',
      }
      setMessage(labels[result.status] || `GitHub sync ${result.status}.`)
      if (result.status === 'loaded') window.location.reload()
    } catch (error) { setMessage(error.message) }
  }
  return (
    <section><div className="page-head"><div><p className="eyebrow">Local data</p><h1>Settings</h1><p>Your TradeMarker data stays in this browser unless you export it.</p></div></div>
      {message && <p className="notice success">{message}</p>}
      <div className="settings-grid"><form className="panel api-key-panel" onSubmit={saveMarketData}><h2>Reference market data</h2><p>Yahoo Finance is the recommended default for this personal journal because it covers US and Canadian symbols and returns complete daily OHLCV without an API key.</p>
        <label>Data provider<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="yahoo">Yahoo Finance (recommended)</option><option value="fmp">Financial Modeling Prep</option><option value="twelveData">Twelve Data</option></select></label>
        {provider === 'yahoo' ? <><p>TradeMarker uses its Cloudflare Worker by default in both local development and GitHub Pages. Enter another Worker URL only to override it.</p><label>Yahoo proxy URL override<input value={yahooProxyUrl} onChange={(event) => setYahooProxyUrl(event.target.value)} placeholder="Optional, e.g. https://your-worker.workers.dev" autoComplete="off" /></label></> : provider === 'fmp' ? <><label>FMP API key<input type="password" value={fmpApiKey} onChange={(event) => setFmpApiKey(event.target.value)} placeholder="Financial Modeling Prep API key" autoComplete="off" /></label><p><a href="https://site.financialmodelingprep.com/developer/docs" target="_blank" rel="noreferrer">Get an FMP API key</a>.</p></> : <><label>Twelve Data API key<input type="password" value={twelveDataApiKey} onChange={(event) => setTwelveDataApiKey(event.target.value)} placeholder="Twelve Data API key" autoComplete="off" /></label><p><a href="https://twelvedata.com/account/api-keys" target="_blank" rel="noreferrer">Get a Twelve Data API key</a>.</p></>}
        <small>Keys stay in this browser and are excluded from exported backups. Because this is a frontend-only app, use personal restricted keys.</small><button type="submit">Save market data settings</button></form>
        <form className="panel api-key-panel" onSubmit={saveGitHubSettings}><h2>GitHub automatic backup</h2><p>Keep this app repository public for GitHub Pages, and save private journal data to a separate private repository such as TradeMarkerData.</p>
          <div className="form-row"><label>Owner<input value={githubOwner} onChange={(event) => setGithubOwner(event.target.value)} required /></label><label>Repository<input value={githubRepo} onChange={(event) => setGithubRepo(event.target.value)} required /></label></div>
          <div className="form-row"><label>Branch<input value={githubBranch} onChange={(event) => setGithubBranch(event.target.value)} required /></label><label>JSON file path<input value={githubDataPath} onChange={(event) => setGithubDataPath(event.target.value)} required /></label></div>
          <label>Fine-grained GitHub token<input type="password" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder="Contents: Read and write" autoComplete="off" required /></label>
          <small>The token stays only in this browser. Give it access only to the private data repository with Contents: Read and write. Do not point this at the public TradeMarker app repo if your journal data should remain private.</small><button type="submit">Save GitHub sync settings</button>
          <div className="sync-actions"><button type="button" className="secondary" onClick={() => runGitHubSync('load')}>Load from GitHub</button><button type="button" className="secondary" onClick={() => runGitHubSync('save')}>Save now</button></div>
        </form>
        <div className="panel"><h2>Import Wealthsimple holdings</h2><p>Upload a Wealthsimple holdings CSV to add only symbols that are not already in your Watchlist. Each new symbol gets one imported BUY record using Book Value (Market) / Quantity as avg cost.</p><input ref={wealthsimpleRef} hidden type="file" accept=".csv,text/csv" onChange={importWealthsimple} /><button className="secondary" disabled={isImportingWealthsimple} onClick={() => wealthsimpleRef.current.click()}>{isImportingWealthsimple ? 'Importing…' : 'Choose Wealthsimple holdings CSV'}</button></div>
        <div className="panel"><h2>Import Wealthsimple activities</h2><p>Upload activities after your holdings baseline to append new BUY and SELL trades. Re-importing the same CSV is safe, but importing old overlapping activities after a holdings snapshot may double-count positions.</p><input ref={wealthsimpleActivitiesRef} hidden type="file" accept=".csv,text/csv" onChange={importWealthsimpleActivities} /><button className="secondary" disabled={isImportingActivities} onClick={() => wealthsimpleActivitiesRef.current.click()}>{isImportingActivities ? 'Importing…' : 'Choose Wealthsimple activities CSV'}</button></div>
        <div className="panel"><h2>Export data</h2><p>Download a JSON backup containing your watchlist, trades, and settings. Your API key is excluded.</p><button onClick={download}>Export JSON backup</button></div>
        <div className="panel"><h2>Import data</h2><p>Restore a TradeMarker JSON backup. Existing local data will be replaced.</p><input ref={fileRef} hidden type="file" accept="application/json" onChange={upload} /><button className="secondary" onClick={() => fileRef.current.click()}>Choose JSON file</button></div>
        <div className="panel danger-zone"><h2>Clear local data</h2><p>Permanently remove all TradeMarker data stored in this browser.</p><button className="danger-button" onClick={clear}>Clear all local data</button></div></div>
    </section>
  )
}
