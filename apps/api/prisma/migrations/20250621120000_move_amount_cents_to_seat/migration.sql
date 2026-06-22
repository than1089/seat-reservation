-- AlterTable
ALTER TABLE "Seat" ADD COLUMN "amountCents" INTEGER NOT NULL DEFAULT 2500;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "amountCents";
