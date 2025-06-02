import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';

interface ControlsBody {
  equity?: number;
}

export async function registerControlsRoute(fastify: FastifyInstance) {
  fastify.post('/controls', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as ControlsBody;
      
      if (body.equity !== undefined) {
        // Update equity value in AccountState
        await prisma.accountState.upsert({
          where: { id: 1 },
          update: { equity: body.equity },
          create: { equity: body.equity }
        });
        
        return { equity: body.equity };
      }
      
      reply.code(400);
      return { error: 'No valid control parameters provided' };
    } catch (error) {
      console.error('Error updating controls:', error);
      reply.code(500);
      return { error: 'Failed to update controls' };
    }
  });
}

export default registerControlsRoute; 