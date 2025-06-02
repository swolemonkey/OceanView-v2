import { prisma } from '../../db.js';

export async function nightlyUpdate(){
  const exps = await prisma.experience.findMany({
    where:{ ts:{ gte: new Date(Date.now()-24*3600*1000) }}
  });
  if(exps.length < 10) return;     // not enough data
  const avgR = exps.reduce((a,b)=>a+b.reward,0)/exps.length;
  let { smcThresh, rsiOS } = await prisma.hyperSettings.findUnique({ where:{id:1}}) ?? {smcThresh:0.002,rsiOS:35};

  // simple PPO-like step: if avg reward positive lower thresh & rsiOS by 5 %, else raise
  const step = avgR > 0 ? -0.05 : 0.05;
  smcThresh *= (1+step);
  rsiOS     *= (1+step);

  await prisma.hyperSettings.upsert({
    where:{ id:1 },
    update:{ smcThresh, rsiOS },
    create:{ id:1, smcThresh, rsiOS }
  });
  console.log(`[learner] updated smcThresh=${smcThresh.toFixed(4)} rsiOS=${rsiOS.toFixed(2)}`);
} 

export default nightlyUpdate; 