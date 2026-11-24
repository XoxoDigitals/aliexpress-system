import type { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { orderCreateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { customerNameFrom, genOrderNumber, orderInclude, orderScope, serializeOrder } from "@/lib/orders";
import { encryptForOrder } from "@/lib/secure";

export const dynamic = "force-dynamic";

const STATUSES: OrderStatus[] = ["NEW", "PROCESSING", "COMPLETED", "CANCELLED"];
const PAYMENTS: PaymentStatus[] = ["NOT_DUE", "PENDING", "PAID"];

function parseDate(value: string | null, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const p = url.searchParams;
  const page = Math.max(1, Number(p.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(p.get("pageSize")) || 25));

  const and: Prisma.OrderWhereInput[] = [orderScope(user), { archived: p.get("archived") === "true" }];

  const status = p.get("status") as OrderStatus | null;
  if (status) {
    if (!STATUSES.includes(status)) return fail("Invalid status");
    and.push({ status });
  }
  const payment = p.get("paymentStatus") as PaymentStatus | null;
  if (payment && user.role !== "TEAM") {
    if (!PAYMENTS.includes(payment)) return fail("Invalid payment status");
    and.push({ paymentStatus: payment });
  }
  if (user.role === "ADMIN") {
    const clientId = p.get("clientId");
    if (clientId) and.push({ clientId });
    const assignee = p.get("assignedToId");
    if (assignee === "UNASSIGNED") and.push({ assignedToId: null });
    else if (assignee) and.push({ assignedToId: assignee });
  }
  const from = parseDate(p.get("from"));
  const to = parseDate(p.get("to"), true);
  if (from || to) and.push({ createdAt: { gte: from, lte: to } });

  const q = p.get("q")?.trim();
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { orderNumber: contains },
        { customerDetails: contains },
        { clientReference: contains },
        { variantName: contains },
        { trackingNumber: contains },
        { accountName: contains },
      ],
    });
  }

  const where: Prisma.OrderWhereInput = { AND: and };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return ok({ items: rows.map((o) => serializeOrder(o, user.role)), total, page, pageSize });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser("ADMIN", "CLIENT");
  const { clientId: requestedClient, assignedToId, cardInfo, orderNumber: requestedNumber, ...body } = orderCreateSchema.parse(
    await parseJson(req)
  );

  const clientId = user.role === "CLIENT" ? user.id : requestedClient;
  if (!clientId) return fail("Select a client", 422);
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT", active: true },
    select: { id: true, ratePerOrder: true },
  });
  if (!client) return fail("Client not found", 404);
  if (!client.ratePerOrder || client.ratePerOrder.lte(0)) return fail("This client has no rate set", 409);

  const assignee = user.role === "ADMIN" && assignedToId ? assignedToId : null;
  if (assignee) {
    const member = await prisma.user.findFirst({ where: { id: assignee, role: "TEAM", active: true }, select: { id: true } });
    if (!member) return fail("Team member not found", 404);
  }

  let orderNumber = requestedNumber ?? genOrderNumber();
  const taken = (n: string) =>
    prisma.order.findUnique({ where: { clientId_orderNumber: { clientId: client.id, orderNumber: n } }, select: { id: true } });
  if (requestedNumber) {
    if (await taken(requestedNumber)) return fail(`Order ID ${requestedNumber} already exists for this client`, 409);
  } else {
    while (await taken(orderNumber)) orderNumber = genOrderNumber();
  }

  const order = await prisma.order.create({
    data: {
      ...body,
      orderNumber,
      customerName: customerNameFrom(body.customerDetails),
      cardInfoEnc: cardInfo ? encryptForOrder(cardInfo, orderNumber) : null,
      clientId: client.id,
      createdById: user.id,
      assignedToId: assignee,
      rate: client.ratePerOrder,
      events: {
        create: [
          { actorId: user.id, type: "CREATED", message: "Order created" },
          ...(assignee
            ? [{ actorId: user.id, type: "ASSIGNED", message: "Assigned to team member", clientVisible: false }]
            : []),
        ],
      },
    },
    include: orderInclude,
  });
  await audit({ userId: user.id, action: "CREATE", entity: "Order", entityId: order.id });
  return ok(serializeOrder(order, user.role), { status: 201 });
});
