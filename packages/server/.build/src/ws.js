import fp from 'fastify-plugin';
import Websocket from '@fastify/websocket';
import RedisMock from 'ioredis-mock';
// Use Redis mock for development
const redis = new RedisMock();
export default fp(async (app) => {
    await app.register(Websocket);
    app.get('/ws/ticks', { websocket: true }, (conn) => {
        const sub = new RedisMock();
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
