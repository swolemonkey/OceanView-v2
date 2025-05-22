// Mock Prisma client
export const prisma = {
    price1m: {
        upsert: async () => {
            console.log('Mock upsert called');
            return { id: 1 };
        },
        findFirst: async (query) => {
            console.log('Mock findFirst called for symbol:', query.where.symbol);
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
            }
            else if (query.where.symbol === 'ethereum') {
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
            console.log('No mock data for symbol:', query.where.symbol);
            return null;
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
    },
    bot: {
        findMany: async (query) => {
            console.log('Mock bot findMany called:', query);
            return [
                { id: 1, name: 'scalper', type: 'scalper', enabled: true },
                { id: 2, name: 'hypertrades', type: 'hypertrades', enabled: true }
            ];
        },
        create: async (args) => {
            console.log('Mock bot created:', args.data);
            return { id: 1, ...args.data };
        }
    },
    experience: {
        create: async (args) => {
            console.log('Mock experience created:', args.data);
            return { id: 1, ...args.data };
        },
        findMany: async (args) => {
            console.log('Mock experience findMany called:', args);
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
        findUnique: async (args) => {
            console.log('Mock hyperSettings findUnique called:', args);
            return { id: 1, smcThresh: 0.002, rsiOS: 35, updatedAt: new Date() };
        },
        upsert: async (args) => {
            console.log('Mock hyperSettings upsert called:', args);
            return { id: 1, ...args.update };
        }
    }
};
