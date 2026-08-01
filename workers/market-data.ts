const YAHOO_HOST = "query2.finance.yahoo.com";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.hostname !== YAHOO_HOST || !url.pathname.startsWith("/v8/finance/chart/")) {
      return new Response("Not found", { status: 404 });
    }
    return fetch(request);
  },
} satisfies ExportedHandler;
