import type { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./db";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export function httpError(status: number, message?: string): Error {
  const err = new Error(message ?? String(status)) as Error & { status?: number; expose?: boolean };
  err.status = status;
  err.expose = !!message;
  return err;
}

/** Loads the user from the database on every call, so deactivation and role changes apply at once. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function requireUser(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw httpError(401);
  if (roles.length && !roles.includes(user.role)) throw httpError(403);
  return user;
}
