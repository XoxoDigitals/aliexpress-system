import { Decimal } from "decimal.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { httpError, requireUser } from "@/lib/session";
import { paymentSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { lockClient, toNumber } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const user = await requireUser("ADMIN", "CLIENT");
  const requested = new URL(req.url).searchParams.get("clientId");
  const clientId = user.role === "CLIENT" ? user.id : requested || undefined;
  const where: Prisma.PaymentWhereInput = clientId ? { clientId } : {};
  const orderWhere: Prisma.OrderWhereInput = { paymentStatus: "PENDING", ...(clientId ? { clientId } : {}) };

  const [payments, pending, credit] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: { client: { select: { id: true, name: true } }, _count: { select: { orders: true } } },
    }),
    prisma.order.findMany({
      where: orderWhere,
      orderBy: { completedAt: "asc" },
      take: 1000,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        clientReference: true,
        rate: true,
        completedAt: true,
        client: { select: { id: true, name: true } },
      },
    }),
    prisma.user.aggregate({
      where: { role: "CLIENT", ...(clientId ? { id: clientId } : {}) },
      _sum: { creditBalance: true },
    }),
  ]);

  return ok({
    payments: payments.map((p) => ({
      id: p.id,
      client: p.client,
      amount: toNumber(p.amount),
      appliedAmount: toNumber(p.appliedAmount),
      creditAfter: toNumber(p.creditAfter),
      mode: p.mode,
      note: p.note,
      receivedAt: p.receivedAt.toISOString(),
      orderCount: p._count.orders,
    })),
    pending: pending.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      clientReference: o.clientReference,
      rate: toNumber(o.rate),
      completedAt: o.completedAt?.toISOString() ?? null,
      client: o.client,
    })),
    pendingTotal: pending.reduce((sum, o) => sum.plus(o.rate.toString()), new Decimal(0)).toNumber(),
    credit: toNumber(credit._sum.creditBalance),
  });
});

export const POST = handle(async (req: Request) => {
  const admin = await requireUser("ADMIN");
  const body = paymentSchema.parse(await parseJson(req));
  const amount = new Decimal(body.amount).toDecimalPlaces(2);
  if (amount.lte(0)) throw httpError(422, "Amount must be greater than 0");
  const selected = body.orderIds?.length ? [...new Set(body.orderIds)] : null;

  const result = await prisma.$transaction(async (tx) => {
    const { credit } = await lockClient(tx, body.clientId);
    let available = credit.plus(amount);

    const pending = await tx.order.findMany({
      where: { clientId: body.clientId, paymentStatus: "PENDING", ...(selected ? { id: { in: selected } } : {}) },
      orderBy: [{ completedAt: "asc" }, { id: "asc" }],
      select: { id: true, rate: true },
    });

    let toSettle: typeof pending = [];
    if (selected) {
      if (pending.length !== selected.length) throw httpError(409, "Some selected orders are no longer pending");
      const due = pending.reduce((s, o) => s.plus(o.rate.toString()), new Decimal(0));
      if (available.lessThan(due)) {
        throw httpError(422, `Amount plus credit (${available.toFixed(2)}) is less than selected total (${due.toFixed(2)})`);
      }
      toSettle = pending;
      available = available.minus(due);
    } else {
      // Oldest first; stop at the first order the money cannot fully cover.
      for (const o of pending) {
        const rate = new Decimal(o.rate.toString());
        if (available.lessThan(rate)) break;
        available = available.minus(rate);
        toSettle.push(o);
      }
    }

    const applied = credit.plus(amount).minus(available);
    const now = new Date();
    const payment = await tx.payment.create({
      data: {
        clientId: body.clientId,
        recordedById: admin.id,
        amount: amount.toFixed(2),
        appliedAmount: applied.toFixed(2),
        creditAfter: available.toFixed(2),
        mode: selected ? "SELECTED" : "AUTO",
        note: body.note,
      },
    });
    await tx.user.update({ where: { id: body.clientId }, data: { creditBalance: available.toFixed(2) } });
    if (toSettle.length) {
      const ids = toSettle.map((o) => o.id);
      await tx.order.updateMany({
        where: { id: { in: ids } },
        data: { paymentStatus: "PAID", paidAt: now, paymentId: payment.id, archived: true, archivedAt: now },
      });
      await tx.orderEvent.createMany({
        data: ids.map((orderId) => ({
          orderId,
          actorId: admin.id,
          type: "PAID",
          message: "Payment received and order archived",
          teamVisible: false,
        })),
      });
    }
    return { paymentId: payment.id, settled: toSettle.length, credit: available.toNumber() };
  });

  await audit({
    userId: admin.id,
    action: "PAYMENT",
    entity: "Payment",
    entityId: result.paymentId,
    meta: { clientId: body.clientId, amount: amount.toNumber(), settled: result.settled },
  });
  return ok(result, { status: 201 });
});
