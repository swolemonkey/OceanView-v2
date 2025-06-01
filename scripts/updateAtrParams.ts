import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Updating ATR parameters in HyperSettings...");
  
  try {
    // Update HyperSettings directly
    await prisma.$executeRaw`UPDATE "HyperSettings" SET 
      "atrMultiple" = 1.5, 
      "atrPeriod" = 14, 
      "symbols" = 'bitcoin,ethereum',
      "gatekeeperThresh" = 0.55,
      "strategyToggle" = '{"SMCReversal":true,"TrendFollowMA":true,"RangeBounce":false}'
      WHERE id = 1`;
    
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