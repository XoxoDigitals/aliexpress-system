import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AppProvider } from "@/components/AppContext";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Client and team lists are only ever sent to admins.
  const people =
    user.role === "ADMIN"
      ? await prisma.user.findMany({
          where: { active: true, role: { in: ["CLIENT", "TEAM"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, role: true },
        })
      : [];
  const pick = (role: "CLIENT" | "TEAM") => people.filter((p) => p.role === role).map(({ id, name }) => ({ id, name }));

  return (
    <AppProvider role={user.role} clients={pick("CLIENT")} team={pick("TEAM")}>
      <AppShell userName={user.name}>{children}</AppShell>
    </AppProvider>
  );
}
