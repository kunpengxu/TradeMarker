# TradeMarker Auth Worker

This optional Worker lets TradeMarker sync API keys and GitHub backup settings across browsers after GitHub login.

## Cloudflare setup

1. Create a KV namespace, for example `TRADEMARKER_AUTH`.
2. Create a GitHub OAuth app:
   - Homepage URL: your GitHub Pages TradeMarker URL
   - Authorization callback URL: `https://YOUR-AUTH-WORKER.workers.dev/auth/github/callback`
3. Deploy `workers/trademarker-auth.js` as a Cloudflare Worker.
4. Bind the KV namespace as `TRADEMARKER_AUTH`.
5. Add Worker secrets:

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET
wrangler secret put CONFIG_ENCRYPTION_KEY
```

`JWT_SECRET` and `CONFIG_ENCRYPTION_KEY` should be long random strings. Keep them private.

## App setup

In TradeMarker Settings:

1. Enter the Auth Worker URL.
2. Click `Login with GitHub`.
3. Configure your API keys and GitHub sync settings.
4. Click `Save settings to account`.

On another browser, enter the same Auth Worker URL, login with GitHub, then click `Load settings from account`.

The Worker stores only configuration needed to restore TradeMarker settings:

- Market data provider and API keys
- Yahoo proxy URL
- GitHub data repo/path/branch
- GitHub token

Journal data still syncs through your private `TradeMarkerData` repository.
