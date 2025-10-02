# 🗳️ Referendum Alert Bot

A Telegram bot that sends **instant notifications** when someone votes on a **Polkadot or Kusama** referendum. Designed for governance participants, analysts, DAOs, and on-chain communities.

---

## ✅ Features

- 🔔 Real-time alerts for new votes (Aye / Nay / Abstain)
- 🌐 Supports **Polkadot** and **Kusama**
- 👥 Works in **private chats** and **groups**
- 🔍 Track any referendum by ID
- 📊 Shows conviction, voting power, address, timestamp

---

## 🛠 Commands

```bash
/watch <id> [dot|ksm]     # Start watching a referendum
/watchdot <id>            # Watch on Polkadot
/watchksm <id>            # Watch on Kusama
/unwatch <id> [dot|ksm]   # Stop tracking a referendum
/list                     # Show all active watches
/clear                    # Unsubscribe from everything
/help                     # Command overview
Examples:

bash
Copy code
/watch 1759 dot
/watchksm 2100
/unwatch 1759
🌐 Tech Stack
Cloudflare Workers (serverless backend)

D1 (Cloudflare SQLite) for storage

Subscan API for vote data

Telegram Bot API for messaging

🚀 Self-Hosting Setup
bash
Copy code
# 1. Install dependencies
npm install

# 2. Add required secrets (do NOT commit these)
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

# 4. Deploy to Cloudflare Workers
npx wrangler deploy
📌 Why Use It?
Track whale governance activity

Monitor your own referenda proposals

Follow treasury and OpenGov movements

Use in group chats for community oversight

🔗 Links
GitHub: https://github.com/your-repo-here
Telegram Bot: https://t.me/your-bot-link
Landing Page (optional): https://your-site.com
