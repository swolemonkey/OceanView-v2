// Mock Prisma client
export const prisma = {
  price1m: {
    upsert: async () => {
      console.log('Mock upsert called');
      return { id: 1 };
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