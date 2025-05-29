// Types for the evolution module
declare module '@server/evolution/types' {
  // Result from a child bot run
  export interface EvolutionResult {
    trades: any[];
    childParams: any;
  }
  
  // Evaluation of a child bot's performance
  export interface EvolutionEvaluation {
    childId: number;
    parentId: number;
    sharpe: number;
    drawdown: number;
    childParams: any;
    promoted: boolean;
  }
}

declare module '@server/evolution/parameterManager' {
  /**
   * Mutates strategy parameters by a small amount
   * @param params The original parameters
   * @returns The mutated parameters
   */
  export function mutate(params: any): any;
  
  /**
   * Scores a set of trades using performance metrics
   * @param trades Array of trades with pnl values
   * @returns Object with performance metrics
   */
  export function score(trades: any[]): { sharpe: number; drawdown: number };
} 