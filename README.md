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

