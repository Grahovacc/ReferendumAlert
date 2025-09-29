# Referendum Alert

Notifies a Telegram chat/group about new votes on Polkadot OpenGov referenda.

## Quick start

```bash
# install deps (wrangler already in devDependencies if you used create-cloudflare)
npm i

# set Worker secrets (never commit these)
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put SUBSCAN_API_KEY

# ensure D1 tables exist
npx wrangler d1 execute referendum_bot_db --remote --command "
CREATE TABLE IF NOT EXISTS subs (chat_id TEXT NOT NULL, ref_id INTEGER NOT NULL, PRIMARY KEY (chat_id, ref_id));
CREATE TABLE IF NOT EXISTS wm   (ref_id INTEGER PRIMARY KEY, since_sec INTEGER NOT NULL);
"

# deploy
npx wrangler deploy
```
