const fetchFn: typeof fetch = (...args: any[]) => fetch(...args);

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
      `https://api.polygon.io/v2/aggs/ticker/${this.symbol}/range/1/minute/` +
      `${startISO}/${endISO}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(await res.text());
    const { results } = await res.json();
    for (const r of results) {
      yield { ts: r.t, o: r.o, h: r.h, l: r.l, c: r.c } as PolygonCandle;
    }
  }
}
