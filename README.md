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

TradeMarker uses Yahoo Finance as its default reference-data provider. Yahoo covers many US, Canadian, and international securities and supplies complete daily OHLCV without an API key. Yahoo Finance does not provide an official supported public API, so its unofficial chart and search endpoints may occasionally be blocked by CORS, changed, or rate-limited. FMP and Twelve Data remain available as optional providers in Settings.

FMP's free light endpoint may provide closing prices without full daily OHLC fields. In that case, Daily displays an honest closing-price line chart; Weekly, Monthly, Quarterly, and Yearly aggregate those daily prices into candles.

Search by company name or ticker and choose the exact Yahoo symbol from the results. For example, `TSLA` is US Tesla and `TSLA.NE` is the Canadian Tesla CDR. TradeMarker keeps these securities, positions, and journal markers separate.

Yahoo's search returns up to 20 related stocks and ETFs for each query. Because the endpoints are unofficial, Yahoo may return `429 Too Many Requests` or block browser requests with CORS. Wait and retry later, or select FMP/Twelve Data in Settings when Yahoo is unavailable.

TradeMarker uses its Cloudflare Worker proxy by default in both local development and GitHub Pages. During local development, Vite's `/api/yahoo/*` proxies are used as fallbacks if the Worker is unavailable. You can override the Worker URL in Settings.

`workers/yahoo-proxy.js` is a minimal Cloudflare Worker proxy template for personal use. Create a free Cloudflare Worker, paste the file as its code, deploy it, then enter the resulting `https://...workers.dev` URL under **Settings → Yahoo proxy URL**. It only permits Yahoo search and chart paths, adds CORS headers, and caches responses for five minutes. Yahoo may still rate-limit requests because its Finance endpoints are unofficial.

Market data is used as reference context for the personal trade journal; it is not intended for live trade decisions. Availability, exchange coverage, refresh limits, and delays depend on the selected provider and plan. If no API key is configured or a request fails, TradeMarker displays an error instead of generating mock prices.

To conserve free API credits, TradeMarker refreshes reference data once when the page opens, once when Refresh is clicked, when a stock is added, and when a new Buy/Sell journal entry is saved. Selecting stocks and changing chart intervals use the current session cache without new API requests.

## Journal and Portfolio

Trade records can be edited after they are saved. The K-line chart shows a Futu-style OHLCV tooltip under the crosshair and keeps Buy/Sell markers at each journal entry's date and price.

The watchlist supports custom groups, drag-and-drop manual ordering, symbol filtering, open-position filtering, and sorting by daily percentage change or unrealized profit/loss. The Portfolio page summarizes open positions, total cost, market value, unrealized profit/loss, and nominal currency distribution.

## GitHub Backup

Settings can connect TradeMarker to a JSON file in a GitHub repository. The recommended setup is to keep this `TradeMarker` app repository public for GitHub Pages and create a separate private `TradeMarkerData` repository for personal journal data. Configure sync with `Repository: TradeMarkerData` and `JSON file path: data/trademarker.json`.

When configured, the app loads newer remote data on startup and automatically saves local watchlist, group, and journal changes. Use a fine-grained token restricted to the private data repository with **Contents: Read and write**. The token stays in the current browser and is excluded from exported and synchronized data.

To prevent accidental data loss, TradeMarker skips automatic GitHub saves when the current browser has no watchlist or trades, and skips loading an empty remote file over a browser that already has local data. If you ever need to recover a previous backup, open `data/trademarker.json` in GitHub and use **History** to restore a non-empty version.

## Import and Export

The Settings page exports all local data as JSON. Importing a valid TradeMarker JSON file replaces the current local watchlist, trades, and settings. Keep backups somewhere private if journal notes are sensitive.
