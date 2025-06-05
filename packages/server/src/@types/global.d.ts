// Declare modules without proper type definitions
declare module 'ioredis-mock';
declare module '@slack/web-api';
declare module 'node-fetch';
declare module 'pino';

// Fastify types
declare module 'fastify' {
  export interface FastifyInstance {
    [key: string]: any;
  }
  export interface FastifyRequest {
    [key: string]: any;
  }
  export interface FastifyReply {
    [key: string]: any;
  }
}

declare module '@fastify/websocket';

// Winston types
declare module 'winston';
declare module 'dotenv';

// WebSocket types
declare module 'ws' {
  export default class WebSocket {
    on(event: string, callback: (data?: any) => void): void;
    send(data: any): void;
  }
  export namespace WebSocket {
    interface Data {}
  }
} 