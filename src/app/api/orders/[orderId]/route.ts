import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { httpError, requireUser } from "@/lib/session";
import { orderInclude, orderScope, serializeOrder } from "@/lib/orders";

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
