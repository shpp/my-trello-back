import { CfRequest } from './types';

// NOTE: IT WAS STOLEN FROM itty-router

export interface ReqCtx {
  captureError: (error: Error, data?: { [s: string]: string | number | boolean }) => void;
  log: (message: string, data?: { [s: string]: string | number | boolean }) => void;
  event: FetchEvent | ScheduledEvent;
  request: CfRequest;
  additionalResponseHeaders: { [header: string]: string };
}

export type RouterHandler = (
  request: CfRequest,
  ctx: ReqCtx,
  ...extra: unknown[]
) => Promise<Response> | Response;

export type Router = {
  handle: RouterHandler;
} & {
  [any: string]: (path: string, ...handlers: RouterHandler[]) => Promise<Response>;
};

export const makeRouter = (o = {}): Router =>
  new Proxy(o, {
    get: (
      t: {
        base: string;
        r: [string, RouterHandler[], string][];
      },
      method: string,
      c
    ) =>
      method === 'handle'
        ? async (r: CfRequest, ctx: ReqCtx, ...a: unknown[]) => {
            for (const [p, hs] of t.r.filter((i) => i[2] === r.method || i[2] === 'ALL')) {
              let m, s, u;
              if ((m = (u = new URL(r.url)).pathname.match(p))) {
                r.params = m.groups || {};
                r.query = r.query || Object.fromEntries(u.searchParams.entries());

                for (const h of hs) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  if ((s = await h((r as any).proxy || r, ctx, ...a)) !== undefined) return s;
                }
              }
            }
          }
        : (path: string, ...hs: RouterHandler[]) =>
            (t.r ||= []).push([
              `^${((t.base || '') + path)
                .replace(/(\/?)\*/g, '(?<rest>$1.*)?')
                .replace(/\/$/, '')
                .replace(/:(\w+|\()(\?)?(\.)?/g, '$2(?<$1>[^/$3]+)$2$3')
                .replace(/\.(?=[\w(])/, '\\.')}/*$`,
              hs,
              method.toUpperCase(),
            ]) && c,
  }) as Router;
