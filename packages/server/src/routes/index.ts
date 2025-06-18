import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { retrainGatekeeper } from '../rl/retrainJob.js';

export default async function registerApiRoutes(fastify: any) {
  // API endpoint for retraining the gatekeeper model
  fastify.post('/api/retrain-gatekeeper', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Trigger retraining in the background
      retrainGatekeeper()
        .then(() => console.log('Gatekeeper retraining completed'))
        .catch(err => console.error('Gatekeeper retraining failed:', err));
      
      // Return immediately with a success response
      return { status: 'queued' };
    } catch (error) {
      console.error('Error queuing gatekeeper retraining:', error);
      reply.code(500);
      return { error: 'Failed to queue retraining job' };
    }
  });
} 