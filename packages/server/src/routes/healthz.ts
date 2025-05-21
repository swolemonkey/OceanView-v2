import { FastifyInstance } from 'fastify';

export async function registerHealthzRoute(app: FastifyInstance) {
  app.get('/healthz', async (req, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
} 