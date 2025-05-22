export class Perception {
    candles = [];
    addTick(price, ts) {
        const minute = Math.floor(ts / 60000) * 60000;
        let c = this.candles.at(-1);
        if (!c || c.ts !== minute) {
            c = { ts: minute, o: price, h: price, l: price, c: price };
            this.candles.push(c);
            if (this.candles.length > 500)
                this.candles.shift();
        }
        c.h = Math.max(c.h, price);
        c.l = Math.min(c.l, price);
        c.c = price;
    }
    last(n) {
        return this.candles.slice(-n);
    }
}
