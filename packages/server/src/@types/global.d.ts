// Declare modules without proper type definitions
declare module 'ioredis-mock';
declare module '@slack/web-api';
declare module 'node-fetch';
declare module 'pino';

// Fastify types
declare module 'fastify' {
  function fastify(options?: any): FastifyInstance;
  export default fastify;
  
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
    static OPEN: number;
    readyState: number;
    on(event: string, callback: (data?: any) => void): void;
    send(data: any): void;
    close(): void;
  }
  
  export namespace WebSocket {
    interface Data {}
  }
} 