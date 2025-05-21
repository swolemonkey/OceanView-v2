// Mock Prisma client
export const prisma = {
  price1m: {
    upsert: async () => {
      console.log('Mock upsert called');
      return { id: 1 };
    },
    findFirst: async () => {
      console.log('Mock findFirst called');
      // Return a mock price record
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
    }
  },
  order: {
    create: async (args) => {
      console.log('Mock order created:', args.data);
      return { id: 1, ...args.data };
    }
  },
  trade: {
    create: async (args) => {
      console.log('Mock trade created:', args.data);
      return { id: 1, ...args.data };
    }
  }
}; 