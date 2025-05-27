// Mock Prisma client
export const prisma = {
    price1m: {
        upsert: async () => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock upsert called');
            return { id: 1 };
        },
        findFirst: async (query) => {
            if (process.env.NODE_ENV === 'test')
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
            if (process.env.NODE_ENV === 'test')
                console.log('No mock data for symbol:', query.where.symbol);
            return null;
        }
    },
    order: {
        create: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock order created:', args.data);
            return { id: 1, ...args.data };
        }
    },
    trade: {
        create: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock trade created:', args.data);
            return { id: 1, ...args.data };
        }
    },
    bot: {
        findMany: async (query) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock bot findMany called:', query);
            return [
                { id: 1, name: 'scalper', type: 'scalper', enabled: true, equity: 10000, pnlToday: 0 },
                { id: 2, name: 'hypertrades', type: 'hypertrades', enabled: true, equity: 10000, pnlToday: 0 }
            ];
        },
        findUnique: async (query) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock bot findUnique called:', query);
            return {
                id: query.where.id || 1,
                name: 'test-bot',
                type: 'hypertrades',
                enabled: true,
                equity: 10000,
                pnlToday: 0
            };
        },
        update: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock bot update called:', args);
            return { id: args.where.id, ...args.data };
        },
        create: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock bot created:', args.data);
            return { id: 1, ...args.data };
        }
    },
    experience: {
        create: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock experience created:', args.data);
            return { id: 1, ...args.data };
        },
        findMany: async (args) => {
            if (process.env.NODE_ENV === 'test')
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
            if (process.env.NODE_ENV === 'test')
                console.log('Mock hyperSettings findUnique called:', args);
            return { id: 1, smcThresh: 0.002, rsiOS: 35, updatedAt: new Date() };
        },
        upsert: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock hyperSettings upsert called:', args);
            return { id: 1, ...args.update };
        }
    },
    // New models added for strategy tracking
    strategyVersion: {
        upsert: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock strategyVersion upsert called:', args);
            return { id: 1, hash: args.where.hash, description: args.create.description };
        }
    },
    strategyTrade: {
        create: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock strategyTrade created:', args.data);
            return { id: 1, ...args.data };
        },
        findMany: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock strategyTrade findMany called:', args);
            return Array(5).fill({
                id: 1,
                ts: new Date(),
                botName: 'hypertrades',
                strategyVersionId: 1,
                symbol: 'bitcoin',
                side: 'buy',
                price: 50000,
                size: 0.1,
                entryReason: 'test',
                exitReason: 'test',
                pnl: 100,
                durationMs: 5000
            });
        }
    },
    dailyMetric: {
        upsert: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock dailyMetric upsert called:', args);
            return { id: 1, date: args.where.date, ...args.update };
        }
    },
    // New models for portfolio-wide metrics and RL
    portfolioMetric: {
        create: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock portfolioMetric created:', args.data);
            return { id: 1, ...args.data };
        },
        upsert: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock portfolioMetric upsert called:', args);
            return { id: 1, date: args.where.date, ...args.update };
        }
    },
    rLModel: {
        create: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock RLModel created:', args.data);
            return { id: 1, ...args.data };
        },
        findMany: async () => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock RLModel findMany called');
            // Return a properly typed model with required properties
            return [{
                    id: 1,
                    version: 'gatekeeper_v1',
                    path: './ml/gatekeeper_v1.onnx',
                    description: 'Mock model',
                    createdAt: new Date()
                }];
        },
        findFirst: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock RLModel findFirst called');
            return {
                id: 1,
                version: 'gatekeeper_v1',
                path: './ml/gatekeeper_v1.onnx',
                description: 'Mock model',
                createdAt: new Date()
            };
        }
    },
    rLDataset: {
        create: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock RLDataset created:', args.data);
            return { id: 1, ...args.data };
        },
        findMany: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock RLDataset findMany called:', args);
            // Return mock data with properly structured featureVec
            return [{
                    id: 1,
                    symbol: 'bitcoin',
                    ts: new Date(),
                    featureVec: {
                        rsi14: 35.5,
                        fastMA: 48000,
                        slowMA: 45000,
                        smcPattern: 0.75
                    },
                    action: 'buy',
                    outcome: 100,
                    strategyVersionId: 1
                }];
        },
        update: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock RLDataset update called:', args);
            return { id: args.where.id, ...args.data };
        }
    },
    accountState: {
        findFirst: async () => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock accountState findFirst called');
            return { id: 1, equity: 10000 };
        },
        upsert: async (args) => {
            if (process.env.NODE_ENV === 'test')
                console.log('Mock accountState upsert called:', args);
            return { id: args.where.id, ...args.update };
        }
    }
};
