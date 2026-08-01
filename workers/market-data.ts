interface BatchRequest {
  urls?: unknown;
}

function isAllowed(value: string): boolean {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "query2.finance.yahoo.com" &&
    url.pathname.startsWith("/v8/finance/chart/")
  );
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/batch") {
      return new Response("Not found", { status: 404 });
    }
    const payload = await request.json<BatchRequest>();
    if (!Array.isArray(payload.urls) || payload.urls.length === 0 || payload.urls.length > 50) {
      return Response.json({ error: "Invalid batch" }, { status: 400 });
    }
    const urls = payload.urls.filter((item): item is string => typeof item === "string");
    if (urls.length !== payload.urls.length || !urls.every(isAllowed)) {
      return Response.json({ error: "Invalid URL" }, { status: 400 });
    }
    const responses = await Promise.all(
      urls.map((item) => fetch(item, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } })),
    );
    const retryBudget = Math.max(0, 50 - urls.length);
    const failedIndexes = responses.flatMap((response, index) => (response.ok ? [] : [index])).slice(0, retryBudget);
    await Promise.all(
      failedIndexes.map(async (index) => {
        const retryUrl = new URL(urls[index]);
        retryUrl.hostname = "query1.finance.yahoo.com";
        responses[index] = await fetch(retryUrl, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        });
      }),
    );
    const results = await Promise.all(
      responses.map(async (response) => ({
        status: response.status,
        contentType: response.headers.get("Content-Type"),
        body: await response.text(),
      })),
    );
    return Response.json(results);
  },
} satisfies ExportedHandler;
