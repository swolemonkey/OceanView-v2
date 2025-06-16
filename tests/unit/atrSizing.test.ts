import { atrSizingDemo } from '../helpers/atrDemo.js';

test('ATR factor shrinks size in high vol', () => {
  const lowVolQty = atrSizingDemo(0.002); // 0.2% ATR
  const highVolQty = atrSizingDemo(0.01); // 1% ATR
  expect(highVolQty).toBeLessThan(lowVolQty);
});
