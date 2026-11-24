import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { httpError, requireUser } from "@/lib/session";
import { updateUserSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireUser("ADMIN");
  const { id } = await ctx.params;
  const input = updateUserSchema.parse(await parseJson(req));
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) throw httpError(404);
  if (input.active === false && target.id === admin.id) return fail("You cannot deactivate your own account", 409);
  if (input.ratePerOrder !== undefined && target.role !== "CLIENT") return fail("Only clients have a rate", 422);
  if (input.showPurchasePrice !== undefined && target.role !== "CLIENT") return fail("Only clients have this setting", 422);

  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.active !== undefined) data.active = input.active;
  if (input.ratePerOrder !== undefined) data.ratePerOrder = input.ratePerOrder;
  if (input.showPurchasePrice !== undefined) data.showPurchasePrice = input.showPurchasePrice;
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, 12);
  if (input.email !== undefined) {
    const email = input.email.toLowerCase();
    const clash = await prisma.user.findFirst({ where: { email, id: { not: id } }, select: { id: true } });
    if (clash) return fail("A user with this email already exists", 409);
    data.email = email;
  }

  await prisma.user.update({ where: { id }, data });
  await audit({
    userId: admin.id,
    action: "UPDATE",
    entity: "User",
    entityId: id,
    meta: { fields: Object.keys(data).map((k) => (k === "passwordHash" ? "password" : k)) },
  });
  return ok({ id });
});
