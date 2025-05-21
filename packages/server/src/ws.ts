import fp from 'fastify-plugin';
import Websocket from '@fastify/websocket';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export default fp(async (app) => {
  await app.register(Websocket);

  app.get('/ws/ticks', { websocket: true }, (conn) => {
    const sub = new Redis(process.env.REDIS_URL!);
    sub.subscribe('chan:ticks');

    sub.on('message', (_chan, msg) => {
      conn.socket.send(msg);
    });

    conn.socket.on('close', () => {
      sub.unsubscribe();
      sub.quit();
    });
  });
}); 