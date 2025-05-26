import { prisma } from '../packages/server/src/db.js';
import fs from 'fs';

async function main(){
  const rows = await prisma.rLDataset.findMany();
  
  const csv = rows.map(r => {
    const features = typeof r.featureVec === 'string' 
      ? JSON.parse(r.featureVec) 
      : r.featureVec;
      
    return [
      r.symbol,
      features.rsi14,
      features.fastMA,
      features.slowMA,
      features.smcPattern,
      r.action === 'buy' ? 1 : 0,   // label 1 = trade, 0 = skip
      r.outcome > 0 ? 1 : 0         // success indicator
    ].join(',');
  });
  
  fs.writeFileSync('./ml/data_export.csv', csv.join('\n'));
  console.log('exported', rows.length);
}

main(); 