import { prisma } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { httpError, requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { orderInclude, serializeOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const admin = await requireUser("ADMIN");
  const { orderId } = await ctx.params;
  const order = await prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["NEW", "PROCESSING"] }, archived: false },
      data: { status: "CANCELLED", paymentStatus: "NOT_DUE", archived: true, archivedAt: new Date(), cardInfoEnc: null },
    });
    if (moved.count !== 1) throw httpError(409, "Only open orders can be cancelled");
    await tx.orderEvent.create({ data: { orderId, actorId: admin.id, type: "CANCELLED", message: "Order cancelled" } });
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  });
  await audit({ userId: admin.id, action: "CANCEL", entity: "Order", entityId: orderId });
  return ok(serializeOrder(order, "ADMIN"));
});
