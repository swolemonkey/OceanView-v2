/**
 * Types for the evolution module
 */

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

// Declare module augmentation for the Prisma client
declare global {
  namespace PrismaClient {
    interface PrismaClient {
      evolutionMetric: {
        create: (args: { data: any }) => Promise<any>;
        update: (args: { where: any; data: any }) => Promise<any>;
        findMany: (args: any) => Promise<any[]>;
      };
      hyperSettings: {
        findUnique: (args: { where: any }) => Promise<any>;
        upsert: (args: { where: any; update: any; create: any }) => Promise<any>;
        update: (args: { where: any; data: any }) => Promise<any>;
      };
    }
  }
} 