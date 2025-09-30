import { BOT_API, HEADERS_JSON, Env } from './env';

export async function tgSend(env: Env, chatId: string, text: string) {
	const r = await fetch(`${BOT_API(env)}/sendMessage`, {
		method: 'POST',
		headers: HEADERS_JSON,
		body: JSON.stringify({
			chat_id: chatId,
			text,
			parse_mode: 'HTML',
			disable_web_page_preview: true,
		}),
	});
	if (!r.ok) console.error('sendMessage failed', r.status, await r.text());
}

export async function tgSetMyCommands(env: Env) {
	const r = await fetch(`${BOT_API(env)}/setMyCommands`, {
		method: 'POST',
		headers: HEADERS_JSON,
		body: JSON.stringify({
			commands: [
				{ command: 'watch', description: 'Start watching: /watch <id> [dot|ksm]' },
				{ command: 'watchdot', description: 'Watch on Polkadot: /watchdot <id>' },
				{ command: 'watchksm', description: 'Watch on Kusama: /watchksm <id>' },
				{ command: 'unwatch', description: 'Stop watching: /unwatch <id> [dot|ksm]' },
				{ command: 'list', description: 'List watched referenda (with chain)' },
				{ command: 'clear', description: 'Clear all subscriptions' },
				{ command: 'id', description: 'Show this chat id' },
				{ command: 'help', description: 'Show help' },
			],
			scope: { type: 'default' },
		}),
	});
	if (!r.ok) console.error('setMyCommands failed', r.status, await r.text());
}
