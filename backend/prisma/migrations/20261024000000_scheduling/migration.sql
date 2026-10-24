-- Shop: when a closed shop opens again (set by the owner or admin)
ALTER TABLE "Shop" ADD COLUMN "reopensAt" TIMESTAMP(3);

-- PrintOrder: the time the customer booked, and a new time the shop asks for
ALTER TABLE "PrintOrder" ADD COLUMN "scheduledFor" TIMESTAMP(3),
ADD COLUMN "proposedTime" TIMESTAMP(3),
ADD COLUMN "proposedNote" TEXT;
