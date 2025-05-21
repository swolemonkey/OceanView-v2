declare module 'pino' {
  interface LoggerOptions {
    transport?: {
      target: string;
      options: {
        colorize: boolean;
      };
    };
  }
  
  interface Logger {
    info(msg: string, ...args: any[]): void;
    info(obj: object, msg?: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    error(obj: object, msg?: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
    warn(obj: object, msg?: string, ...args: any[]): void;
    debug(msg: string, ...args: any[]): void;
    debug(obj: object, msg?: string, ...args: any[]): void;
    fatal(msg: string, ...args: any[]): void;
    fatal(obj: object, msg?: string, ...args: any[]): void;
  }
  
  function pino(options?: LoggerOptions): Logger;
  
  namespace pino {
    export type { Logger, LoggerOptions };
  }
  
  export = pino;
} 