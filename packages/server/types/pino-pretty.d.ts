declare module 'pino-pretty' {
  interface PinoPrettyOptions {
    colorize?: boolean;
  }
  
  function pinoPretty(options?: PinoPrettyOptions): NodeJS.WritableStream;
  
  export = pinoPretty;
} 