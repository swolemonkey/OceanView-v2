import { FastifyInstance } from 'fastify';
import { placeSimOrder } from '@/execution/sim.js';

export async function registerOrderRoute(app:FastifyInstance){
  app.post('/api/order', async (req, reply)=>{
    const { symbol, side, qty, price } = req.body as any;
    if(!symbol || !side || !qty || !price)
      return reply.code(400).send({ error:'missing field' });
    if(side!=='buy' && side!=='sell')
      return reply.code(400).send({ error:'side must be buy|sell' });

    const order = await placeSimOrder(symbol, side, qty, price);
    return { ok:true, order };
  });
} 

export default registerOrderRoute; 