import { prisma } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { httpError, requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { orderScope } from "@/lib/orders";
import { decryptForOrder } from "@/lib/secure";

export const dynamic = "force-dynamic";

/** POST so the value is never cached or prefetched. Every reveal is recorded, without the value. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const user = await requireUser("TEAM", "ADMIN");
  const { orderId } = await ctx.params;
  const order = await prisma.order.findFirst({
    where: { AND: [{ id: orderId }, orderScope(user)] },
    select: { orderNumber: true, status: true, archived: true, cardInfoEnc: true },
  });
  if (!order) throw httpError(404);
  if (order.status !== "NEW" || order.archived || !order.cardInfoEnc) {
    throw httpError(409, "Card info is no longer available");
  }
  const cardInfo = decryptForOrder(order.cardInfoEnc, order.orderNumber);
  await prisma.orderEvent.create({
    data: { orderId, actorId: user.id, type: "CARD_VIEWED", message: `Card info viewed by ${user.name}`, clientVisible: false, teamVisible: false },
  });
  await audit({ userId: user.id, action: "CARD_VIEW", entity: "Order", entityId: orderId });
  return ok({ cardInfo }, { headers: { "Cache-Control": "no-store" } });
});
