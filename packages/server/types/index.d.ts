// Type declarations for server modules
declare module '@server/db' {
  export interface Prisma {
    price1m: {
      upsert: () => Promise<{ id: number }>;
      findFirst: (query: { where: any; orderBy: any }) => Promise<any | null>;
    };
    order: {
      create: (args: { data: any }) => Promise<any>;
    };
    trade: {
      create: (args: { data: any }) => Promise<any>;
    };
    bot: {
      findMany: (query: any) => Promise<any[]>;
      create: (args: { data: any }) => Promise<any>;
    };
    experience: {
      create: (args: { data: any }) => Promise<any>;
      findMany: (args: any) => Promise<any[]>;
    };
    hyperSettings: {
      findUnique: (args: { where: any }) => Promise<any>;
      upsert: (args: { where: any; update: any; create: any }) => Promise<any>;
      update: (args: { where: any; data: any }) => Promise<any>;
    };
    metric: {
      create: (args: { data: any }) => Promise<any>;
    };
    evolutionMetric: {
      create: (args: { data: any }) => Promise<any>;
      update: (args: { where: any; data: any }) => Promise<any>;
      findMany: (args: any) => Promise<any[]>;
    };
    rLDataset: {
      findMany: () => Promise<any[]>;
      create: (args: { data: any }) => Promise<any>;
      update: (args: { where: any; data: any }) => Promise<any>;
    };
    rLModel: {
      findMany: () => Promise<any[]>;
      create: (args: { data: any }) => Promise<any>;
    };
    accountState: {
      findFirst: () => Promise<any>;
      update: (args: { where: any; data: any }) => Promise<any>;
      create: (args: { data: any }) => Promise<any>;
    };
  }

  export const prisma: Prisma;
}

declare module '@server/lib/getVersion' {
  export function getStrategyVersion(): string;
} 