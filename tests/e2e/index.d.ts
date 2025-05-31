// Type declarations for tests
declare module '../../packages/server/src/bots/hypertrades/assetAgent' {
  export class AssetAgent {
    symbol: string;
    risk: any;
    perception: any;
    constructor(symbol: string, config: any, botId: number, versionId: number);
    setDataFeed(dataFeed: any): void;
    setExecutionEngine(executionEngine: any): void;
    onCandleClose(candle: any): Promise<void>;
    closePositions(currentPrice: number): Promise<void>;
  }
}

declare module '../../packages/server/src/risk/portfolioRisk' {
  export class PortfolioRiskManager {
    openRiskPct: number;
    maxOpenRisk: number;
    dayPnl: number;
    equity: number;
    init(): Promise<void>;
    canTrade(): boolean;
    recalc(agents: Map<string, any>): void;
  }
}

declare module '../../packages/server/src/rl/gatekeeper' {
  export interface FeatureVector {
    symbol: string;
    price: number;
    rsi: number;
    adx: number;
    volatility: number;
    recentTrend: number;
    dayOfWeek: number;
    hourOfDay: number;
    [key: string]: any;
  }
  
  export class RLGatekeeper {
    constructor(versionId?: number);
    scoreIdea(features: any, action: string): Promise<{score: number, id: number}>;
    updateOutcome(id: number, pnl: number): Promise<void>;
    static getTradeStats(): {vetoed: number, executed: number};
  }
}

declare module '../../packages/server/src/execution/sim' {
  export class SimEngine {
    constructor(botId?: number);
    place(order: any): Promise<any>;
  }
}

declare module '../../packages/server/src/bots/hypertrades/config' {
  export function loadConfig(): Promise<any>;
}

declare module '../../packages/server/src/feeds/interface' {
  export interface Tick {
    symbol: string;
    price: number;
    timestamp: number;
  }
  
  export interface DataFeed {
    subscribe(symbol: string, cb: (tick: Tick) => void): void;
  }
}

declare module '../../packages/server/src/bots/hypertrades/perception' {
  export interface Candle {
    ts: number;
    o: number;
    h: number;
    l: number;
    c: number;
  }
} 