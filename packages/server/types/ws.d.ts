declare module 'ws' {
  import { EventEmitter } from 'events';
  
  namespace WebSocket {
    export type Data = string | Buffer | ArrayBuffer | Buffer[];
  }
  
  class WebSocket extends EventEmitter {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;
    
    readyState: number;
    
    constructor(address: string, options?: any);
    
    close(code?: number, data?: string): void;
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    send(data: any, cb?: (err?: Error) => void): void;
    send(data: any, options: { mask?: boolean; binary?: boolean }, cb?: (err?: Error) => void): void;
    
    on(event: 'close', listener: (code: number, reason: string) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'message', listener: (data: WebSocket.Data) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }
  
  export = WebSocket;
} 