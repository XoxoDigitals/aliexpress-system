import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { httpError, requireUser } from "@/lib/session";
import { trackingSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { applyCreditToOrder, orderInclude, orderScope, serializeOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const user = await requireUser("TEAM", "ADMIN");
  const { orderId } = await ctx.params;
  const body = trackingSchema.parse(await parseJson(req));

  const order = await prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: { AND: [{ id: orderId, status: "PROCESSING", archived: false }, orderScope(user)] },
      data: {
        status: "COMPLETED",
        paymentStatus: "PENDING",
        trackingNumber: body.trackingNumber,
        carrier: body.carrier,
        completedById: user.id,
        completedAt: new Date(),
      },
    });
    if (moved.count !== 1) throw httpError(409, "Order must be processing before adding tracking");
    await tx.orderEvent.create({
      data: { orderId, actorId: user.id, type: "COMPLETED", message: `Tracking added: ${body.trackingNumber}` },
    });
    const { clientId } = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { clientId: true } });
    await applyCreditToOrder(tx, orderId, clientId, user.id);
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  });

  await audit({ userId: user.id, action: "COMPLETE", entity: "Order", entityId: orderId });
  return ok(serializeOrder(order, user.role));
});
