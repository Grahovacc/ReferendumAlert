🗳️ Referendum Alert Bot

A lightweight Telegram bot that sends instant alerts when someone votes on a Polkadot or Kusama referendum. Perfect for governance watchers, delegations, researchers, and on-chain communities.

✅ What It Does

⏱ Real-time notifications for new votes (Aye, Nay, or Abstain)

🌐 Supports both Polkadot & Kusama

👥 Works in private chats and group chats

🔢 Track any referendum by ID

🧾 Shows voter address, conviction, voting power, and timestamp

🚀 Commands
/watch <id> [dot|ksm]   – Start watching a referendum  
/watchdot <id>          – Watch on Polkadot  
/watchksm <id>          – Watch on Kusama  
/unwatch <id> [dot|ksm] – Stop tracking  
/list                   – Show what you're watching  
/clear                  – Unsubscribe from everything  
/help                   – Show command info


Example:

/watch 1759 dot
/watchksm 2100

🔧 Tech Stack

Cloudflare Workers (serverless runtime)

D1 (SQLite) for subscriptions + watchdog state

Subscan API for blockchain data

Telegram Bot API for messaging

📦 Setup (Self-Host)
# 1. Install dependencies
npm install

# 2. Add secrets (do NOT commit these)
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put SUBSCAN_API_KEY

# 3. Create the D1 tables
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

# 4. Deploy to Cloudflare
npx wrangler deploy
