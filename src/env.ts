export interface Env {
	TELEGRAM_TOKEN: string;
	WEBHOOK_SECRET: string;
	SUBSCAN_API_KEY?: string;
	DB: D1Database;
}

export const BOT_API = (env: Env) => `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}`;
export const HEADERS_JSON = { 'content-type': 'application/json' } as const;
