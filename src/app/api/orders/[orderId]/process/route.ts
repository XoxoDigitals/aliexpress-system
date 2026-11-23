import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { httpError, requireUser } from "@/lib/session";
import { processSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { orderInclude, orderScope, serializeOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const user = await requireUser("TEAM", "ADMIN");
  const { orderId } = await ctx.params;
  const body = processSchema.parse(await parseJson(req));

  const order = await prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: { AND: [{ id: orderId, status: "NEW", archived: false, assignedToId: { not: null } }, orderScope(user)] },
      data: {
        status: "PROCESSING",
        accountName: body.accountName,
        purchasePrice: body.purchasePrice,
        processedById: user.id,
        processedAt: new Date(),
        cardInfoEnc: null, // Destroyed in the same write that starts processing.
      },
    });
    if (moved.count !== 1) throw httpError(409, "Order must be new and assigned before processing");
    await tx.orderEvent.create({
      data: { orderId, actorId: user.id, type: "PROCESSING", message: `Processing with account ${body.accountName}` },
    });
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  });

  await audit({ userId: user.id, action: "PROCESS", entity: "Order", entityId: orderId });
  return ok(serializeOrder(order, user.role));
});
