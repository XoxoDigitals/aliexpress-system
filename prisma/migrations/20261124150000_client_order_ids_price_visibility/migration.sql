-- Per-client switch to show the processing price to that client.
ALTER TABLE "User" ADD COLUMN "showPurchasePrice" BOOLEAN NOT NULL DEFAULT false;

-- Order IDs become unique per client instead of across all clients.
-- Existing IDs are globally unique today, so they already satisfy the new rule.
CREATE UNIQUE INDEX "Order_clientId_orderNumber_key" ON "Order"("clientId", "orderNumber");
DROP INDEX "Order_orderNumber_key";
