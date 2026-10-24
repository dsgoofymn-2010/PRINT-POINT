-- Data integrity constraints Prisma cannot express directly
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_amounts_non_negative" CHECK ("subtotal" >= 0 AND "deliveryFee" >= 0 AND "discount" >= 0 AND "tax" >= 0 AND "total" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_copies_positive" CHECK ("copies" > 0 AND "printedPages" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_rates_non_negative" CHECK ("bwSingle" >= 0 AND "bwDouble" >= 0 AND "colorSingle" >= 0 AND "colorDouble" >= 0 AND "a3Multiplier" > 0 AND "legalMultiplier" > 0 AND "taxPercent" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_has_identifier" CHECK ("email" IS NOT NULL OR "mobile" IS NOT NULL);
-- Only one active pricing rule per shop
CREATE UNIQUE INDEX "PricingRule_one_active_per_shop" ON "PricingRule" ("shopId") WHERE "isActive" = true;
