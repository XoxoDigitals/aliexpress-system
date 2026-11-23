import { Decimal } from "decimal.js";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "./session";
import { httpError } from "./session";

export const toNumber = (v: unknown): number =>
  v === null || v === undefined ? 0 : new Decimal(v as Decimal.Value).toDecimalPlaces(2).toNumber();

/** Every order query must include this filter, so a user can only reach orders for their role. */
export function orderScope(user: CurrentUser): Prisma.OrderWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "CLIENT") return { clientId: user.id };
  return { assignedToId: user.id, status: { not: "CANCELLED" } };
}

export const orderInclude = {
  client: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  processedBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/**
 * Builds the response from an allow-list per role, so a new database column
 * can never leak to a role by default.
 */
export function serializeOrder(o: OrderRow, role: CurrentUser["role"]) {
  const base = {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    clientReference: o.clientReference,
    customerName: o.customerName,
    customerDetails: o.customerDetails,
    productUrl: o.productUrl,
    variantName: o.variantName,
    hasCard: o.cardInfoEnc !== null, // The ciphertext itself is never serialized.
    accountName: o.accountName,
    processedAt: o.processedAt?.toISOString() ?? null,
    trackingNumber: o.trackingNumber,
    carrier: o.carrier,
    completedAt: o.completedAt?.toISOString() ?? null,
    archived: o.archived,
    createdAt: o.createdAt.toISOString(),
  };
  if (role === "TEAM") return { ...base, client: o.client };
  const billing = {
    paymentStatus: o.paymentStatus,
    rate: toNumber(o.rate),
    paidAt: o.paidAt?.toISOString() ?? null,
  };
  if (role === "CLIENT") return { ...base, ...billing };
  return {
    ...base,
    ...billing,
    client: o.client,
    assignedTo: o.assignedTo,
    processedBy: o.processedBy,
    completedBy: o.completedBy,
    purchasePrice: o.purchasePrice === null ? null : toNumber(o.purchasePrice),
  };
}

/** The first non-empty pasted line is the customer's name. */
export function customerNameFrom(details: string): string {
  const first = details.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  return first.slice(0, 200);
}

export function genOrderNumber(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `ORD-${ymd}-${rand}`;
}

/** Serialises money movement per client. Call inside a transaction. */
export async function lockClient(tx: Prisma.TransactionClient, clientId: string) {
  const rows = await tx.$queryRaw<{ id: string; creditBalance: Prisma.Decimal; role: string }[]>`
    SELECT id, "creditBalance", role::text FROM "User" WHERE id = ${clientId} FOR UPDATE`;
  const client = rows[0];
  if (!client || client.role !== "CLIENT") throw httpError(404, "Client not found");
  return { id: client.id, credit: new Decimal(client.creditBalance.toString()) };
}

/** Settles a just-completed order from existing credit, if the credit covers it. */
export async function applyCreditToOrder(tx: Prisma.TransactionClient, orderId: string, clientId: string, actorId: string) {
  const { credit } = await lockClient(tx, clientId);
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { rate: true, paymentStatus: true } });
  if (!order || order.paymentStatus !== "PENDING") return false;
  const rate = new Decimal(order.rate.toString());
  if (credit.lessThan(rate)) return false;
  const now = new Date();
  await tx.user.update({ where: { id: clientId }, data: { creditBalance: credit.minus(rate).toFixed(2) } });
  await tx.order.update({
    where: { id: orderId },
    data: { paymentStatus: "PAID", paidAt: now, archived: true, archivedAt: now },
  });
  await tx.orderEvent.create({
    data: { orderId, actorId, type: "PAID", message: "Paid from account credit and archived", teamVisible: false },
  });
  return true;
}
