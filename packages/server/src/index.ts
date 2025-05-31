// Minimal server implementation
import Fastify from 'fastify';

// Create Fastify instance with logger enabled
const app = Fastify({
  logger: true
});

// Register healthcheck route
app.get('/healthz', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Get port from environment variable
const port = parseInt(process.env.PORT || '3334', 10);

// Start server
const start = async () => {
  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server started on port ${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start(); 