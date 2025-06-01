import { prisma } from '../src/db.js';
import fs from 'fs';

(async () => {
  const rows = await prisma.rLDataset.findMany();
  const csv = rows.map(r => [
    r.featureVec.rsi14,
    r.featureVec.adx14,
    r.featureVec.fastMASlowDelta,
    r.featureVec.bbWidth,
    r.featureVec.avgSent,
    r.featureVec.avgOB,
    r.action === 'buy' ? 1 : 0,
    r.outcome > 0 ? 1 : 0  // label
  ].join(','));
  
  fs.writeFileSync('./ml/data_export.csv', csv.join('\n'));
  console.log('exported', rows.length);
})(); 