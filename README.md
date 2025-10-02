# 1. Install dependencies
npm install

# 2. Add required secrets (do NOT commit these)
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put SUBSCAN_API_KEY

# 3. Create the D1 tables (Cloudflare SQLite)
npx wrangler d1 execute referendum_bot_db --remote --command "
CREATE TABLE IF NOT EXISTS subs (
  chat_id TEXT NOT NULL,
  ref_id  INTEGER NOT NULL,
  chain   TEXT NOT NULL DEFAULT 'dot',
  PRIMARY KEY (chat_id, ref_id, chain)
);
CREATE TABLE IF NOT EXISTS wm (
  ref_id    INTEGER PRIMARY KEY,
  chain     TEXT NOT NULL DEFAULT 'dot',
  since_sec INTEGER NOT NULL
);
"

# 4. Deploy to Cloudflare Workers
npx wrangler deploy
