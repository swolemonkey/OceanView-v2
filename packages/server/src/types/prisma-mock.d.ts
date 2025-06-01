// Type definitions for mock Prisma client

interface MockPrismaClient {
  price1m: {
    upsert: () => Promise<{ id: number }>;
    findFirst: (query: { where?: any; orderBy?: any }) => Promise<any>;
  };
  order: {
    create: (args: { data: any }) => Promise<any>;
  };
  trade: {
    create: (args: { data: any }) => Promise<any>;
  };
  bot: {
    findMany: (query?: any) => Promise<any[]>;
    create: (args: { data: any }) => Promise<any>;
  };
  experience: {
    create: (args: { data: any }) => Promise<any>;
    findMany: (args?: any) => Promise<any[]>;
  };
  hyperSettings: {
    findUnique: (args: any) => Promise<any>;
    upsert: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  metric: {
    create: (args: { data: any }) => Promise<any>;
  };
  evolutionMetric: {
    create: (args: { data: any }) => Promise<any>;
    update: (args: any) => Promise<any>;
    findMany: (args?: any) => Promise<any[]>;
  };
  rLDataset: {
    findMany: () => Promise<any[]>;
    create: (args: { data: any }) => Promise<any>;
    update: (args: any) => Promise<any>;
    count: (args?: any) => Promise<number>;
  };
  rLModel: {
    findMany: () => Promise<any[]>;
    create: (args: { data: any }) => Promise<any>;
  };
  accountState: {
    findFirst: () => Promise<any>;
    update: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
    upsert: (args: any) => Promise<any>;
  };
  botHeartbeat: {
    create: (args: { data: any }) => Promise<any>;
    findFirst: (query?: any) => Promise<any>;
  };
  newsSentiment: {
    findFirst: (query?: any) => Promise<any>;
    create: (args: { data: any }) => Promise<any>;
  };
  orderBookMetric: {
    findFirst: (query?: any) => Promise<any>;
    create: (args: { data: any }) => Promise<any>;
  };
  portfolioMetric: {
    findFirst: (query?: any) => Promise<any>;
    create: (args: { data: any }) => Promise<any>;
  };
  strategyTrade: {
    count: (args?: any) => Promise<number>;
    findMany: (args?: any) => Promise<any[]>;
    create: (args: { data: any }) => Promise<any>;
  };
}

// Extend the global namespace
declare global {
  namespace NodeJS {
    interface Global {
      prisma: MockPrismaClient;
    }
  }
}

export {}; 