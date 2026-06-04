# TradeMarker

TradeMarker is a personal US stock watchlist and visual trade journal. Add only the symbols you follow, record manual Buy/Sell journal entries, and see those entries as markers on real market-data candlestick charts.

> **Safety disclaimer:** TradeMarker is for personal journaling and visualization only. It is not financial advice, has no brokerage connection, and cannot place or execute orders.

## Features

- Personal watchlist with mock latest prices and position summaries
- Stock detail pages with daily, weekly, monthly, quarterly, and yearly candles
- Manual Buy/Sell journal entries shown as B/S chart markers
- Weighted-average position and unrealized P/L calculation
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
- `settings`: reserved preferences

Position calculations use a simple weighted-average method. FIFO tax accounting and realized P/L are intentionally outside v1.

## Market Data

TradeMarker supports Financial Modeling Prep and Twelve Data for reference quotes and historical daily OHLCV candles. Financial Modeling Prep is the recommended default because its free plan is better suited to end-of-day personal journaling. Select a provider and add your personal API key on the Settings page. Keys stay in browser localStorage, are excluded from JSON exports, and are never committed to Git.

Market data is used as reference context for the personal trade journal; it is not intended for live trade decisions. Availability, exchange coverage, refresh limits, and delays depend on the selected provider and plan. If no API key is configured or a request fails, TradeMarker displays an error instead of generating mock prices.

To conserve free API credits, TradeMarker refreshes reference data once when the page opens, once when Refresh is clicked, when a stock is added, and when a new Buy/Sell journal entry is saved. Selecting stocks and changing chart intervals use the current session cache without new API requests.

## Import and Export

The Settings page exports all local data as JSON. Importing a valid TradeMarker JSON file replaces the current local watchlist, trades, and settings. Keep backups somewhere private if journal notes are sensitive.
