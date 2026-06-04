# TradeMarker

TradeMarker is a personal US stock watchlist and visual trade journal. Add only the symbols you follow, record manual Buy/Sell journal entries, and see those entries as markers on deterministic mock candlestick charts.

> **Safety disclaimer:** TradeMarker is for personal journaling and visualization only. It is not financial advice, has no brokerage connection, and cannot place or execute orders.

## Features

- Personal watchlist with mock latest prices and position summaries
- Stock detail pages with daily, weekly, monthly, quarterly, and yearly candles
- Manual Buy/Sell journal entries shown as B/S chart markers
- Weighted-average position and unrealized P/L calculation
- Planned-order notes shown as horizontal chart lines
- Full trade log
- Local JSON backup, restore, and clear-data controls
- Responsive interface and GitHub Pages deployment

## Screenshots

Add dashboard and stock-detail screenshots here after deployment.

## Tech Stack

React, Vite, JavaScript, React Router, lightweight-charts, localStorage, and GitHub Pages. There is no backend and no paid market-data dependency in v1.

## Run Locally

```bash
npm install
npm run dev
```

Build and preview the production bundle:

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

The Vite base path is configured for `https://kunpengxu.github.io/TradeMarker/`.

```bash
npm run deploy
```

The app uses hash-based routing, so detail routes work correctly on GitHub Pages without server rewrites.

## Data Model

All data is stored in browser localStorage:

- `watchlist`: uppercase stock-symbol strings
- `trades`: manual Buy/Sell records with symbol, price, shares, date, and optional note
- `plannedOrders`: planning notes with side, price, shares, status, note, and created date
- `settings`: reserved preferences

Position calculations use a simple weighted-average method. FIFO tax accounting and realized P/L are intentionally outside v1.

## Market Data

`src/services/marketData.js` is the market-data abstraction. Its v1 provider creates deterministic, realistic-looking mock daily OHLCV candles per symbol. Replace this service later to connect a real market-data API without changing the UI. Do not put API secrets in frontend code.

## Import and Export

The Settings page exports all local data as JSON. Importing a valid TradeMarker JSON file replaces the current local watchlist, trades, planned orders, and settings. Keep backups somewhere private if journal notes are sensitive.
