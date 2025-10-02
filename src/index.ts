import type { Env } from './env';
import {
	handleWebhook,
	notifyNewVotes,
	debugSubs,
	notifyDummy,
	diag,
	peek,
	setCommands,
	setIdentityOverride,
	debugIdentity,
	purgeIdentityCache,
} from './routes';

function ok() {
	return new Response('ok');
}
function forbidden() {
	return new Response('forbidden', { status: 403 });
}

export default {
	async fetch(req: Request, env: Env) {
		const url = new URL(req.url);
		const path = url.pathname;

		if (req.method === 'POST' && path === '/tg-webhook') {
			if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('unauthorized', { status: 401 });
			return handleWebhook(req, env);
		}

		if (path === '/health') return ok();
		if (path === '/run') {
			await notifyNewVotes(env);
			return new Response('ran');
		}

		const key = url.searchParams.get('key');
		const guard = () => (key === env.WEBHOOK_SECRET ? null : forbidden());

		if (path === '/debug-subs') {
			const g = guard();
			if (g) return g;
			return debugSubs(env);
		}
		if (path === '/notify_dummy') {
			const g = guard();
			if (g) return g;
			return notifyDummy(env, url);
		}
		if (path === '/diag') {
			const g = guard();
			if (g) return g;
			return diag(env);
		}
		if (path === '/peek') {
			const g = guard();
			if (g) return g;
			return peek(env, url);
		}
		if (path === '/set-commands') {
			const g = guard();
			if (g) return g;
			return setCommands(env);
		}
		if (path === '/set-identity') {
			const g = guard();
			if (g) return g;
			return setIdentityOverride(env, url);
		}
		if (path === '/debug-identity') {
			const g = guard();
			if (g) return g;
			return debugIdentity(env, url);
		}
		if (path === '/purge-identity-cache') {
			const g = guard();
			if (g) return g;
			return purgeIdentityCache(env, url);
		}

		return new Response('not found', { status: 404 });
	},

	async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(notifyNewVotes(env));
	},
};
