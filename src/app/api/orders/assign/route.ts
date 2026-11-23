import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { assignSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const admin = await requireUser("ADMIN");
  const { orderIds, teamMemberId } = assignSchema.parse(await parseJson(req));
  const ids = [...new Set(orderIds)];

  let memberName: string | null = null;
  if (teamMemberId) {
    const member = await prisma.user.findFirst({
      where: { id: teamMemberId, role: "TEAM", active: true },
      select: { name: true },
    });
    if (!member) return fail("Team member not found", 404);
    memberName = member.name;
  }

  // Only open orders can move. Completed, cancelled and archived orders are left alone.
  const updated = await prisma.$transaction(async (tx) => {
    const open = await tx.order.findMany({
      where: { id: { in: ids }, archived: false, status: { in: ["NEW", "PROCESSING"] } },
      select: { id: true },
    });
    const openIds = open.map((o) => o.id);
    if (!openIds.length) return 0;
    await tx.order.updateMany({ where: { id: { in: openIds } }, data: { assignedToId: teamMemberId } });
    await tx.orderEvent.createMany({
      data: openIds.map((orderId) => ({
        orderId,
        actorId: admin.id,
        type: "ASSIGNED",
        message: memberName ? `Assigned to ${memberName}` : "Unassigned",
        clientVisible: false,
      })),
    });
    return openIds.length;
  });

  await audit({ userId: admin.id, action: "ASSIGN", entity: "Order", meta: { count: updated, teamMemberId } });
  return ok({ updated, skipped: ids.length - updated });
});
