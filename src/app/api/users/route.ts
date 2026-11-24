import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createUserSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { toNumber } from "@/lib/orders";

export const dynamic = "force-dynamic";

const select = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  ratePerOrder: true,
  creditBalance: true,
  showPurchasePrice: true,
  createdAt: true,
} as const;

export const GET = handle(async () => {
  await requireUser("ADMIN");
  const users = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], select });
  return ok(
    users.map((u) => ({
      ...u,
      ratePerOrder: u.ratePerOrder === null ? null : toNumber(u.ratePerOrder),
      creditBalance: toNumber(u.creditBalance),
    }))
  );
});

export const POST = handle(async (req: Request) => {
  const admin = await requireUser("ADMIN");
  const input = createUserSchema.parse(await parseJson(req));
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return fail("A user with this email already exists", 409);
  }
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, 12),
      ratePerOrder: input.role === "CLIENT" ? input.ratePerOrder : null,
      showPurchasePrice: input.role === "CLIENT" ? (input.showPurchasePrice ?? false) : false,
    },
    select,
  });
  await audit({ userId: admin.id, action: "CREATE", entity: "User", entityId: user.id, meta: { role: user.role } });
  return ok(
    { ...user, ratePerOrder: user.ratePerOrder === null ? null : toNumber(user.ratePerOrder), creditBalance: 0 },
    { status: 201 }
  );
});
