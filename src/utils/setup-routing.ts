import { makeRouter, ReqCtx, Router } from './my-router';
import { rethrowErrors } from './fix-stacktraces-hack';
import { captureError } from '@cfworker/sentry';
import { CfRequest } from './types';

declare global {
  const SENTRY_DSN: string;
}

declare global {
  let buildMetadata: { time: number };
}

async function incomingRead<R>(f: () => Promise<R>): Promise<R> {
  try {
    return await f();
  } catch (e) {
    throw new Error('RequestBodyReadError: ' + e.message);
  }
}

export function setupRouting(setupRouterFunc: (router: Router) => void): void {
  const router = makeRouter(); // ok

  setupRouterFunc(router);

  addEventListener('fetch', (event) => {
    let sentryId: string | undefined;
    let incoming: unknown;
    const logs: unknown[] = [];

    const enrichedRequest: CfRequest = {
      ...event.request,
      // body getters of request in cloudflare 2021 may throw errors without stack traces, so we need to fix that
      json: async () => (incoming = await incomingRead(async () => JSON.parse(await event.request.text()))),
      text: async () => (incoming = await incomingRead(() => event.request.text())),
      formData: async () => (incoming = await incomingRead(() => event.request.formData())),
      blob: rethrowErrors(event.request, event.request.blob),
      arrayBuffer: rethrowErrors(event.request, event.request.arrayBuffer),
      params: {},
    };

    const ctx: ReqCtx = {
      captureError: (e: Error, data?: { [s: string]: string | number | boolean }) => {
        if (!SENTRY_DSN || e.message.startsWith('RequestBodyReadError')) return;
        const sentryRes = captureError(SENTRY_DSN, 'worker', '' + buildMetadata.time, e, enrichedRequest, {
          ...(data || {}),
          logs,
          incoming,
        });
        // console.log('stack: ' + e.stack);
        sentryId = sentryRes.event_id;
        event.waitUntil(sentryRes.posted);
      },
      log: (message: string, data?: { [s: string]: string | number | boolean }) => {
        const m = { time: new Date().toISOString(), message, ...(data || {}) };
        logs.push(m);
        // console.log('log: ' + JSON.stringify(m));
      },
      event: event,
      request: enrichedRequest,
      additionalResponseHeaders: {
        'Cache-Control': 'no-store', // by default
      },
    };

    event.respondWith(
      (async function (): Promise<Response> {
        const getHeaders = () => ({
          build: JSON.stringify({ ...buildMetadata, hrbtime: new Date(buildMetadata.time).toISOString() }),
          version: new Date(buildMetadata.time).toISOString(),
          ...(sentryId ? { debugId: sentryId } : {}),
          ...ctx.additionalResponseHeaders,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,HEAD,PUT,POST,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Origin,X-Requested-With,Content-Type,Accept,Authorization',
        });
        try {
          const resp: Response = await router.handle(enrichedRequest, ctx);

          const respWithHeaders = new Response(resp.body, {
            headers: {
              ...Object.fromEntries([...(resp?.headers?.entries() || [])]),
              ...getHeaders(),
            },
            status: resp.status || 200,
            statusText: resp.statusText || 'CODE' + (resp.status || 200),
          });
          return respWithHeaders;
        } catch (e) {
          if (!e.statusCode) {
            ctx.captureError(e, { crash: true });
          }

          return new Response(JSON.stringify({ error: e.message }), {
            status: e.statusCode || 500,
            headers: getHeaders(),
          });
        }
      })()
    );
  });
}
