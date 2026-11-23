import { Decimal } from "decimal.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { orderScope, toNumber } from "@/lib/orders";

export const dynamic = "force-dynamic";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const sum = (values: (Prisma.Decimal | null)[]) =>
  values.reduce((s: Decimal, v) => (v ? s.plus(v.toString()) : s), new Decimal(0)).toDecimalPlaces(2).toNumber();

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 30));
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const and: Prisma.OrderWhereInput[] = [orderScope(user), { createdAt: { gte: start } }];
  const clientId = user.role === "ADMIN" ? url.searchParams.get("clientId") : null;
  if (clientId) and.push({ clientId });

  const rows = await prisma.order.findMany({
    where: { AND: and },
    select: {
      status: true,
      paymentStatus: true,
      rate: true,
      purchasePrice: true,
      createdAt: true,
      processedAt: true,
      completedAt: true,
      clientId: true,
      assignedToId: true,
      client: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
  });

  const billable = rows.filter((o) => o.status === "COMPLETED");
  const turnaround = billable.filter((o) => o.completedAt).map((o) => o.completedAt!.getTime() - o.createdAt.getTime());
  const counts = {
    total: rows.length,
    new: rows.filter((o) => o.status === "NEW").length,
    processing: rows.filter((o) => o.status === "PROCESSING").length,
    completed: billable.length,
    cancelled: rows.filter((o) => o.status === "CANCELLED").length,
    avgHoursToComplete: turnaround.length
      ? Math.round((turnaround.reduce((a, b) => a + b, 0) / turnaround.length / 36e5) * 10) / 10
      : null,
  };

  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { date: dayKey(d), orders: 0 };
  });
  const index = new Map(series.map((s, i) => [s.date, i]));
  for (const o of rows) {
    const i = index.get(dayKey(o.createdAt));
    if (i !== undefined) series[i].orders += 1;
  }

  if (user.role === "TEAM") return ok({ role: user.role, days, counts, series });

  // Balances are all-time, so old unpaid orders never drop out of the date window.
  const balanceWhere: Prisma.OrderWhereInput = user.role === "CLIENT" ? { clientId: user.id } : clientId ? { clientId } : {};
  const [pending, paid, creditAgg] = await Promise.all([
    prisma.order.aggregate({ where: { ...balanceWhere, paymentStatus: "PENDING" }, _sum: { rate: true }, _count: true }),
    prisma.order.aggregate({ where: { ...balanceWhere, paymentStatus: "PAID" }, _sum: { rate: true }, _count: true }),
    prisma.user.aggregate({
      where: { role: "CLIENT", ...(user.role === "CLIENT" ? { id: user.id } : clientId ? { id: clientId } : {}) },
      _sum: { creditBalance: true },
    }),
  ]);
  const money = {
    billed: sum(billable.map((o) => o.rate)),
    pending: toNumber(pending._sum.rate),
    pendingOrders: pending._count,
    paid: toNumber(paid._sum.rate),
    paidOrders: paid._count,
    credit: toNumber(creditAgg._sum.creditBalance),
  };
  if (user.role === "CLIENT") return ok({ role: user.role, days, counts, series, money });

  const purchaseCost = sum(billable.map((o) => o.purchasePrice));
  const group = (key: "client" | "team") => {
    const map = new Map<string, { id: string; name: string; orders: number; completed: number; billed: Decimal; cost: Decimal }>();
    for (const o of rows) {
      const id = key === "client" ? o.clientId : o.assignedToId;
      if (!id) continue;
      const name = key === "client" ? o.client.name : o.assignedTo?.name ?? "—";
      const entry = map.get(id) ?? { id, name, orders: 0, completed: 0, billed: new Decimal(0), cost: new Decimal(0) };
      entry.orders += 1;
      if (o.status === "COMPLETED") {
        entry.completed += 1;
        entry.billed = entry.billed.plus(o.rate.toString());
        if (o.purchasePrice) entry.cost = entry.cost.plus(o.purchasePrice.toString());
      }
      map.set(id, entry);
    }
    return [...map.values()]
      .map((e) => ({ ...e, billed: e.billed.toNumber(), cost: e.cost.toNumber() }))
      .sort((a, b) => b.orders - a.orders);
  };

  return ok({
    role: user.role,
    days,
    counts,
    series,
    money: { ...money, purchaseCost, margin: new Decimal(money.billed).minus(purchaseCost).toNumber() },
    byClient: group("client"),
    byTeam: group("team"),
  });
});
