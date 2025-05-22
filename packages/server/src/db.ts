// Mock Prisma client
export const prisma = {
  price1m: {
    upsert: async () => {
      if (process.env.NODE_ENV === 'test') console.log('Mock upsert called');
      return { id: 1 };
    },
    findFirst: async (query: { where: any, orderBy: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock findFirst called for symbol:', query.where.symbol);
      
      // Return different mock data based on the symbol
      if (query.where.symbol === 'bitcoin') {
        return { 
          id: 1, 
          symbol: 'bitcoin', 
          timestamp: new Date(), 
          open: 50000, 
          high: 51000, 
          low: 49000, 
          close: 50500, 
          volume: 100 
        };
      } else if (query.where.symbol === 'ethereum') {
        return { 
          id: 2, 
          symbol: 'ethereum', 
          timestamp: new Date(), 
          open: 2500, 
          high: 2600, 
          low: 2400, 
          close: 2540.33, 
          volume: 50 
        };
      }
      
      // Return null if symbol is not found
      if (process.env.NODE_ENV === 'test') console.log('No mock data for symbol:', query.where.symbol);
      return null;
    }
  },
  order: {
    create: async (args: { data: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock order created:', args.data);
      return { id: 1, ...args.data };
    }
  },
  trade: {
    create: async (args: { data: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock trade created:', args.data);
      return { id: 1, ...args.data };
    }
  },
  bot: {
    findMany: async (query: { where: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock bot findMany called:', query);
      return [
        { id: 1, name: 'scalper', type: 'scalper', enabled: true, equity: 10000, pnlToday: 0 },
        { id: 2, name: 'hypertrades', type: 'hypertrades', enabled: true, equity: 10000, pnlToday: 0 }
      ];
    },
    findUnique: async (query: { where: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock bot findUnique called:', query);
      return { 
        id: query.where.id || 1, 
        name: 'test-bot', 
        type: 'hypertrades', 
        enabled: true, 
        equity: 10000,
        pnlToday: 0
      };
    },
    update: async (args: { where: any, data: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock bot update called:', args);
      return { id: args.where.id, ...args.data };
    },
    create: async (args: { data: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock bot created:', args.data);
      return { id: 1, ...args.data };
    }
  },
  experience: {
    create: async (args: { data: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock experience created:', args.data);
      return { id: 1, ...args.data };
    },
    findMany: async (args: { where: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock experience findMany called:', args);
      return Array(20).fill({ 
        id: 1, 
        symbol: 'bitcoin', 
        price: 50000, 
        smcThresh: 0.002, 
        rsiOS: 35, 
        reward: 100, 
        ts: new Date() 
      });
    }
  },
  hyperSettings: {
    findUnique: async (args: { where: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock hyperSettings findUnique called:', args);
      return { id: 1, smcThresh: 0.002, rsiOS: 35, updatedAt: new Date() };
    },
    upsert: async (args: { where: any, update: any, create: any }) => {
      if (process.env.NODE_ENV === 'test') console.log('Mock hyperSettings upsert called:', args);
      return { id: 1, ...args.update };
    }
  }
}; 