import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Get yesterday's date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  console.log("Starting database seeding...");

  try {
    // Bot - hypertrades
    // First check if bot exists
    const existingBot = await prisma.bot.findFirst({
      where: { name: "hypertrades" }
    });

    if (existingBot) {
      await prisma.bot.update({
        where: { id: existingBot.id },
        data: { 
          type: "hypertrades",
          enabled: true,
          equity: 10000,
          pnlToday: 0
        }
      });
    } else {
      await prisma.bot.create({
        data: {
          name: "hypertrades",
          type: "hypertrades", 
          enabled: true,
          equity: 10000,
          pnlToday: 0
        }
      });
    }

    // Run remaining operations in a transaction
    await prisma.$transaction([
      // HyperSettings with strategyToggle JSON
      prisma.hyperSettings.upsert({
        where: { id: 1 },
        update: {
          strategyToggle: JSON.stringify({
            "TrendFollowMA": true,
            "RangeBounce": false,
            "SMCReversal": true
          }),
          symbols: "bitcoin,ethereum",
          gatekeeperThresh: 0.55,
          maxDailyLoss: 0.03,
          maxOpenRisk: 0.05,
          fastMAPeriod: 50,
          slowMAPeriod: 200
        },
        create: {
          id: 1,
          smcThresh: 0.002,
          rsiOS: 35,
          rsiOB: 65,
          symbols: "bitcoin,ethereum",
          riskPct: 1,
          smcMinRetrace: 0.5,
          gatekeeperThresh: 0.55,
          maxDailyLoss: 0.03,
          maxOpenRisk: 0.05,
          fastMAPeriod: 50,
          slowMAPeriod: 200,
          strategyToggle: JSON.stringify({
            "TrendFollowMA": true,
            "RangeBounce": false,
            "SMCReversal": true
          })
        }
      }),
      
      // RLModel - gatekeeper_v1
      prisma.rLModel.upsert({
        where: { version: "gatekeeper_v1" },
        update: {
          path: "packages/server/models/gatekeeper_v1.onnx",
          description: "Baseline gatekeeper model"
        },
        create: {
          version: "gatekeeper_v1",
          path: "packages/server/models/gatekeeper_v1.onnx",
          description: "Baseline gatekeeper model"
        }
      }),
      
      // AccountState - equity = 10000
      prisma.accountState.upsert({
        where: { id: 1 },
        update: { equity: 10000 },
        create: { equity: 10000 }
      }),
      
      // PortfolioMetric - baseline with yesterday's date
      prisma.portfolioMetric.upsert({
        where: { date: yesterday },
        update: {
          equityStart: 10000,
          equityEnd: 10000,
          dailyPnl: 0,
          maxOpenRisk: 0,
          maxDrawdown: 0
        },
        create: {
          date: yesterday,
          equityStart: 10000,
          equityEnd: 10000,
          dailyPnl: 0,
          maxOpenRisk: 0,
          maxDrawdown: 0
        }
      })
    ]);

    // Update ATR parameters with direct query
    await prisma.$executeRaw`UPDATE "HyperSettings" SET 
      "atrMultiple" = 1.5, 
      "atrPeriod" = 14
      WHERE id = 1`;

    console.log("Database seeding completed successfully!");
  } catch (error) {
    console.error("Error during seeding:", error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error("Error seeding database:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect()); 