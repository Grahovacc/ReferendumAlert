export interface Env {
	TELEGRAM_TOKEN: string; // wrangler secret
	WEBHOOK_SECRET: string; // wrangler secret (use same when setting webhook)
	SUBSCAN_API_KEY?: string; // wrangler secret
	DB: D1Database; // D1 binding named "DB"
}

export const BOT_API = (env: Env) => `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}`;
export const HEADERS_JSON = { 'content-type': 'application/json' } as const;
