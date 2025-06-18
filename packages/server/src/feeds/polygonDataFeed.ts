const fetchFn = async (url: string, init?: RequestInit) => {
  const mod = await import('node-fetch');
  return (mod.default as any)(url, init);
};

export type PolygonCandle = {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

export class PolygonDataFeed {
  constructor(private symbol: string) {}

  async *iterate(startISO: string, endISO: string): AsyncGenerator<PolygonCandle> {
    const key = process.env.POLYGON_API_KEY!;
    let url =
      `https://api.polygon.io/v2/aggs/ticker/${this.symbol}/range/5/minute/` +
      `${startISO}/${endISO}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;
    console.log(`🔍 DEBUG: Fetching data from URL: ${url}`);
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(await res.text());
    const { results } = await res.json();
    console.log(`🔍 DEBUG: Received ${results?.length || 0} data points from Polygon API`);
    if (results && results.length > 0) {
      console.log(`🔍 DEBUG: First data point: ${new Date(results[0].t).toISOString()} price=${results[0].c}`);
      console.log(`🔍 DEBUG: Last data point: ${new Date(results[results.length-1].t).toISOString()} price=${results[results.length-1].c}`);
    }
    for (const r of results) {
      yield { ts: r.t, o: r.o, h: r.h, l: r.l, c: r.c } as PolygonCandle;
    }
  }
}
