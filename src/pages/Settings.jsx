import { useEffect, useRef, useState } from 'react'
import { clearData, exportData, getSettings, getTrades, getWatchlist, importData, saveSettings, saveTrades, saveWatchlist } from '../services/storage'
import { loadFromGitHub, saveToGitHub } from '../services/githubSync'
import { getMarketSnapshot } from '../services/marketData'
import { buildWealthsimpleActivities, buildWealthsimpleHoldings, createImportedTrade } from '../services/wealthsimpleImport'
import { clearAuthToken, getAuthUser, getAuthWorkerUrl, loadSettingsFromAccount, saveAuthTokenFromHash, saveSettingsToAccount, startGitHubLogin } from '../services/authSync'

export default function Settings() {
  const fileRef = useRef()
  const wealthsimpleRef = useRef()
  const wealthsimpleActivitiesRef = useRef()
  const settings = getSettings()
  const [message, setMessage] = useState('')
  const [isImportingWealthsimple, setIsImportingWealthsimple] = useState(false)
  const [isImportingActivities, setIsImportingActivities] = useState(false)
  const [provider, setProvider] = useState(() => settings.marketDataProviderChosen ? settings.marketDataProvider : 'yahoo')
  const [fmpApiKey, setFmpApiKey] = useState(() => settings.fmpApiKey || '')
  const [twelveDataApiKey, setTwelveDataApiKey] = useState(() => settings.twelveDataApiKey || '')
  const [marketauxApiKey, setMarketauxApiKey] = useState(() => settings.marketauxApiKey || '')
  const [yahooProxyUrl, setYahooProxyUrl] = useState(() => settings.yahooProxyUrl || '')
  const [githubOwner, setGithubOwner] = useState(() => settings.githubOwner ?? 'kunpengxu')
  const [githubRepo, setGithubRepo] = useState(() => settings.githubRepo ?? 'TradeMarkerData')
  const [githubBranch, setGithubBranch] = useState(() => settings.githubBranch ?? 'main')
  const [githubDataPath, setGithubDataPath] = useState(() => settings.githubDataPath ?? 'data/trademarker.json')
  const [githubToken, setGithubToken] = useState(() => settings.githubToken || '')
  const [authWorkerUrl, setAuthWorkerUrl] = useState(() => settings.authWorkerUrl ?? getAuthWorkerUrl())
  const [authUser, setAuthUser] = useState(null)
  const [isAuthBusy, setIsAuthBusy] = useState(false)

  const refreshAuthUser = async () => {
    try {
      setAuthUser(await getAuthUser())
    } catch {
      clearAuthToken()
      setAuthUser(null)
    }
  }
  const applySettingsToForm = () => {
    const settings = getSettings()
    setProvider(settings.marketDataProviderChosen ? settings.marketDataProvider : 'yahoo')
    setFmpApiKey(settings.fmpApiKey || '')
    setTwelveDataApiKey(settings.twelveDataApiKey || '')
    setMarketauxApiKey(settings.marketauxApiKey || '')
    setYahooProxyUrl(settings.yahooProxyUrl || '')
    setGithubOwner(settings.githubOwner ?? 'kunpengxu')
    setGithubRepo(settings.githubRepo ?? 'TradeMarkerData')
    setGithubBranch(settings.githubBranch ?? 'main')
    setGithubDataPath(settings.githubDataPath ?? 'data/trademarker.json')
    setGithubToken(settings.githubToken || '')
    setAuthWorkerUrl(settings.authWorkerUrl ?? getAuthWorkerUrl())
  }

  useEffect(() => {
    const loggedIn = saveAuthTokenFromHash()
    refreshAuthUser()
    if (loggedIn) setMessage('GitHub login connected. TradeMarker will load your synced settings and data automatically.')
    const onAccountSettingsSynced = (event) => {
      refreshAuthUser()
      applySettingsToForm()
      if (event.detail?.status === 'loaded') {
        setMessage('Loaded synced account settings. GitHub data sync is running automatically.')
      } else if (event.detail?.status === 'empty') {
        setMessage('No synced account settings found yet. Saved this browser’s settings to your account.')
      }
    }
    window.addEventListener('trademarker:account-settings-synced', onAccountSettingsSynced)
    return () => window.removeEventListener('trademarker:account-settings-synced', onAccountSettingsSynced)
  }, [])
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
  const clearSettingsFields = () => {
    if (!confirm('Clear all Settings form fields in this browser? This will not delete your watchlist, trades, portfolio, or saved cloud account settings.')) return
    saveSettings({
      ...getSettings(),
      marketDataProvider: 'yahoo',
      marketDataProviderChosen: false,
      fmpApiKey: '',
      twelveDataApiKey: '',
      marketauxApiKey: '',
      yahooProxyUrl: '',
      githubOwner: '',
      githubRepo: '',
      githubBranch: '',
      githubDataPath: '',
      githubToken: '',
      authWorkerUrl: '',
    })
    setProvider('yahoo')
    setFmpApiKey('')
    setTwelveDataApiKey('')
    setMarketauxApiKey('')
    setYahooProxyUrl('')
    setGithubOwner('')
    setGithubRepo('')
    setGithubBranch('')
    setGithubDataPath('')
    setGithubToken('')
    setAuthWorkerUrl('')
    setMessage('Settings form fields cleared in this browser. Your journal data was not deleted.')
  }
  const saveMarketData = (event) => {
    event.preventDefault()
    saveSettings({
      ...getSettings(),
      marketDataProvider: provider,
      marketDataProviderChosen: true,
      fmpApiKey: fmpApiKey.trim(),
      twelveDataApiKey: twelveDataApiKey.trim(),
      marketauxApiKey: marketauxApiKey.trim(),
      yahooProxyUrl: yahooProxyUrl.trim(),
    })
    setMessage(`${provider === 'yahoo' ? 'Yahoo Finance' : provider === 'fmp' ? 'Financial Modeling Prep' : 'Twelve Data'} selected as the market data provider.`)
  }
  const saveGitHubSettings = (event) => {
    event.preventDefault()
    saveSettings({ ...getSettings(), githubOwner: githubOwner.trim(), githubRepo: githubRepo.trim(), githubBranch: githubBranch.trim(), githubDataPath: githubDataPath.trim(), githubToken: githubToken.trim() })
    setMessage('GitHub sync settings saved. Changes will now sync automatically.')
  }
  const saveAuthWorkerSetting = () => {
    saveSettings({ ...getSettings(), authWorkerUrl: authWorkerUrl.trim() })
  }
  const loginWithGitHub = () => {
    saveAuthWorkerSetting()
    startGitHubLogin()
  }
  const logout = () => {
    clearAuthToken()
    setAuthUser(null)
    setMessage('Signed out from TradeMarker account sync on this browser.')
  }
  const saveCloudSettings = async () => {
    try {
      setIsAuthBusy(true)
      saveMarketData({ preventDefault() {} })
      saveSettings({ ...getSettings(), githubOwner: githubOwner.trim(), githubRepo: githubRepo.trim(), githubBranch: githubBranch.trim(), githubDataPath: githubDataPath.trim(), githubToken: githubToken.trim(), authWorkerUrl: authWorkerUrl.trim() })
      await saveSettingsToAccount()
      setMessage('Saved API keys and GitHub sync settings to your signed-in account.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsAuthBusy(false)
    }
  }
  const loadCloudSettings = async () => {
    try {
      setIsAuthBusy(true)
      const result = await loadSettingsFromAccount()
      applySettingsToForm()
      setMessage(result.status === 'empty' ? 'No synced settings found for this account yet.' : 'Loaded API keys and GitHub sync settings from your account.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsAuthBusy(false)
    }
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
      <div className="settings-grid"><div className="panel api-key-panel auth-panel"><h2>Account settings sync</h2><p>Optional GitHub login for syncing API keys and GitHub backup settings across browsers. Your journal data still syncs through your private TradeMarkerData repository.</p>
        <label>Auth Worker URL<input value={authWorkerUrl} onChange={(event) => setAuthWorkerUrl(event.target.value)} placeholder="https://trademarker-auth.your-name.workers.dev" autoComplete="off" /></label>
        {authUser ? <div className="auth-user"><img src={authUser.avatarUrl} alt="" /><div><strong>{authUser.name || authUser.login}</strong><span>@{authUser.login}</span></div></div> : <p className="auth-status">Not signed in.</p>}
        <div className="sync-actions">{authUser ? <button type="button" className="secondary" onClick={logout}>Sign out</button> : <button type="button" onClick={loginWithGitHub}>Login with GitHub</button>}<button type="button" className="secondary" onClick={saveAuthWorkerSetting}>Save Worker URL</button></div>
        <div className="sync-actions"><button type="button" disabled={!authUser || isAuthBusy} onClick={loadCloudSettings}>Load settings from account</button><button type="button" className="secondary" disabled={!authUser || isAuthBusy} onClick={saveCloudSettings}>Save settings to account</button></div>
        <small>This sync stores market-data keys and GitHub sync settings in your Cloudflare Worker KV. Deploy your own Worker and use restricted personal API keys.</small>
      </div>
      <form className="panel api-key-panel" onSubmit={saveMarketData}><h2>Reference market data</h2><p>Yahoo Finance is the recommended default for this personal journal because it covers US and Canadian symbols and returns complete daily OHLCV without an API key.</p>
        <label>Data provider<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="yahoo">Yahoo Finance (recommended)</option><option value="fmp">Financial Modeling Prep</option><option value="twelveData">Twelve Data</option></select></label>
        {provider === 'yahoo' ? <><p>TradeMarker uses its Cloudflare Worker by default in both local development and GitHub Pages. Enter another Worker URL only to override it.</p><label>Yahoo proxy URL override<input value={yahooProxyUrl} onChange={(event) => setYahooProxyUrl(event.target.value)} placeholder="Optional, e.g. https://your-worker.workers.dev" autoComplete="off" /></label></> : provider === 'fmp' ? <><label>FMP API key<input type="password" value={fmpApiKey} onChange={(event) => setFmpApiKey(event.target.value)} placeholder="Financial Modeling Prep API key" autoComplete="off" /></label><p><a href="https://site.financialmodelingprep.com/developer/docs" target="_blank" rel="noreferrer">Get an FMP API key</a>.</p></> : <><label>Twelve Data API key<input type="password" value={twelveDataApiKey} onChange={(event) => setTwelveDataApiKey(event.target.value)} placeholder="Twelve Data API key" autoComplete="off" /></label><p><a href="https://twelvedata.com/account/api-keys" target="_blank" rel="noreferrer">Get a Twelve Data API key</a>.</p></>}
        <label>Marketaux news API key<input type="password" value={marketauxApiKey} onChange={(event) => setMarketauxApiKey(event.target.value)} placeholder="Optional news API key for Events" autoComplete="off" /></label>
        <p><a href="https://www.marketaux.com/" target="_blank" rel="noreferrer">Get a free Marketaux key</a>. TradeMarker uses it only for stock news/events, not prices.</p>
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
        <div className="panel danger-zone"><h2>Clear settings fields</h2><p>Remove API keys, proxy URL, GitHub sync fields, and Auth Worker URL saved in this browser. Watchlist and trades stay untouched.</p><button className="secondary" onClick={clearSettingsFields}>Clear Settings fields only</button></div>
        <div className="panel danger-zone"><h2>Clear local data</h2><p>Permanently remove all TradeMarker data stored in this browser.</p><button className="danger-button" onClick={clear}>Clear all local data</button></div></div>
    </section>
  )
}
