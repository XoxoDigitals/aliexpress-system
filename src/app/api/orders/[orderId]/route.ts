import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { httpError, requireUser } from "@/lib/session";
import { orderUpdateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { orderInclude, orderScope, serializeOrder } from "@/lib/orders";
import { decryptForOrder, encryptForOrder } from "@/lib/secure";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const user = await requireUser();
  const { orderId } = await ctx.params;
  const order = await prisma.order.findFirst({
    where: { AND: [{ id: orderId }, orderScope(user)] },
    include: orderInclude,
  });
  if (!order) throw httpError(404);

  const eventWhere: Prisma.OrderEventWhereInput = { orderId };
  if (user.role === "CLIENT") eventWhere.clientVisible = true;
  if (user.role === "TEAM") eventWhere.teamVisible = true;
  const events = await prisma.orderEvent.findMany({
    where: eventWhere,
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, message: true, createdAt: true },
  });
  return ok({ ...serializeOrder(order, user.role), events });
});

/** Admin only: change the order ID. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const admin = await requireUser("ADMIN");
  const { orderId } = await ctx.params;
  const { orderNumber } = orderUpdateSchema.parse(await parseJson(req));

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, clientId: true, cardInfoEnc: true },
    });
    if (!current) throw httpError(404);
    if (current.orderNumber === orderNumber) return null;
    const clash = await tx.order.findUnique({
      where: { clientId_orderNumber: { clientId: current.clientId, orderNumber } },
      select: { id: true },
    });
    if (clash) throw httpError(409, `Order ID ${orderNumber} already exists for this client`);

    // Card info is encrypted against the order ID, so it must be re-encrypted under the new one.
    const cardInfoEnc = current.cardInfoEnc
      ? encryptForOrder(decryptForOrder(current.cardInfoEnc, current.orderNumber), orderNumber)
      : null;
    await tx.order.update({ where: { id: orderId }, data: { orderNumber, cardInfoEnc } });
    await tx.orderEvent.create({
      data: { orderId, actorId: admin.id, type: "ORDER_ID_CHANGED", message: `Order ID changed from ${current.orderNumber} to ${orderNumber}` },
    });
    return current.orderNumber;
  });
  if (result === null) return fail("That is already the order ID", 422);

  await audit({ userId: admin.id, action: "UPDATE_ORDER_ID", entity: "Order", entityId: orderId, meta: { from: result, to: orderNumber } });
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  return ok(serializeOrder(order, admin.role));
});
