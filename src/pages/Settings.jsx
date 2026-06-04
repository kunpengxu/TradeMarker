import { useRef, useState } from 'react'
import { clearData, exportData, importData } from '../services/storage'

export default function Settings() {
  const fileRef = useRef()
  const [message, setMessage] = useState('')
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
    if (confirm('Permanently clear your entire TradeMarker watchlist, journal, planned orders, and settings?')) {
      clearData(); setMessage('All local data cleared.')
    }
  }
  return (
    <section><div className="page-head"><div><p className="eyebrow">Local data</p><h1>Settings</h1><p>Your TradeMarker data stays in this browser unless you export it.</p></div></div>
      {message && <p className="notice success">{message}</p>}
      <div className="settings-grid"><div className="panel"><h2>Export data</h2><p>Download a JSON backup containing your watchlist, trades, planned orders, and settings.</p><button onClick={download}>Export JSON backup</button></div>
        <div className="panel"><h2>Import data</h2><p>Restore a TradeMarker JSON backup. Existing local data will be replaced.</p><input ref={fileRef} hidden type="file" accept="application/json" onChange={upload} /><button className="secondary" onClick={() => fileRef.current.click()}>Choose JSON file</button></div>
        <div className="panel danger-zone"><h2>Clear local data</h2><p>Permanently remove all TradeMarker data stored in this browser.</p><button className="danger-button" onClick={clear}>Clear all local data</button></div></div>
    </section>
  )
}
