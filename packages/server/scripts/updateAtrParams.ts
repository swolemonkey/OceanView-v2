import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Updating ATR parameters in HyperSettings...");
  
  try {
    // Update HyperSettings with upsert
    await prisma.hyperSettings.upsert({
      where: { id: 1 },
      update: {
        symbols: "bitcoin,ethereum",
        atrMultiple: 1.5,
        atrPeriod: 14
      },
      create: {
        id: 1,
        smcThresh: 0.002,
        rsiOS: 35,
        symbols: "bitcoin,ethereum",
        riskPct: 1,
        atrMultiple: 1.5,
        atrPeriod: 14
      }
    });
    
    console.log("ATR parameters updated successfully!");
  } catch (error) {
    console.error("Error updating ATR parameters:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error("Script error:", error);
    process.exit(1);
  }); 