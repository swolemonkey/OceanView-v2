import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding HyperSettings...");

  try {
    // HyperSettings with trailing stop parameters
    await prisma.hyperSettings.upsert({
      where: { id: 1 },
      update: {
        symbols: "bitcoin,ethereum",
        smcThresh: 0.002,
        rsiOS: 35,
        rsiOB: 65,
        riskPct: 1,
        smcMinRetrace: 0.5,
        atrMultiple: 1.5,
        atrPeriod: 14,
        strategyToggle: JSON.stringify({
          "SMCReversal": true,
          "TrendFollowMA": true,
          "RangeBounce": false
        })
      },
      create: {
        symbols: "bitcoin,ethereum",
        smcThresh: 0.002,
        rsiOS: 35,
        rsiOB: 65,
        riskPct: 1,
        smcMinRetrace: 0.5,
        atrMultiple: 1.5,
        atrPeriod: 14,
        strategyToggle: JSON.stringify({
          "SMCReversal": true,
          "TrendFollowMA": true,
          "RangeBounce": false
        })
      }
    });

    console.log("HyperSettings seeded successfully!");
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