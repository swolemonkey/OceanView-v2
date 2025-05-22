import fp from 'fastify-plugin';
import Websocket from '@fastify/websocket';
import IoRedisMock from 'ioredis-mock';
// Use Redis mock for development
// @ts-ignore - Working around type issues with ioredis-mock
const redis = new IoRedisMock();
export default fp(async (app) => {
    await app.register(Websocket);
    app.get('/ws/ticks', { websocket: true }, (conn) => {
        console.log('Client connected to /ws/ticks');
        // @ts-ignore - Working around type issues with ioredis-mock
        const sub = new IoRedisMock();
        sub.subscribe('chan:ticks');
        sub.on('message', (_chan, msg) => {
            console.log('Sending tick message to client');
            conn.socket.send(msg);
        });
        conn.socket.on('close', () => {
            console.log('Client disconnected from /ws/ticks');
            sub.unsubscribe();
            sub.quit();
        });
    });
    app.get('/ws/metrics', { websocket: true }, (conn) => {
        console.log('Client connected to /ws/metrics');
        // @ts-ignore - Working around type issues with ioredis-mock
        const sub = new IoRedisMock();
        sub.subscribe('chan:metrics');
        sub.on('message', (_c, msg) => {
            console.log('Received metrics from Redis:', msg);
            conn.socket.send(msg);
            console.log('Sent metrics to client');
        });
        conn.socket.on('close', () => {
            console.log('Client disconnected from /ws/metrics');
            sub.quit();
        });
    });
});
