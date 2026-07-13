/** Minimal Cloudflare runtime bindings used by the vinext worker build. */
declare type D1Database = any;

declare interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: Record<string, any>;
}
