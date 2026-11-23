"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useApp } from "./AppContext";

const NAV = [
  { href: "/", label: "Dashboard", roles: ["ADMIN", "CLIENT", "TEAM"] },
  { href: "/orders", label: "Orders", roles: ["ADMIN", "CLIENT", "TEAM"] },
  { href: "/payments", label: "Payments", roles: ["ADMIN", "CLIENT"] },
  { href: "/archive", label: "Archive", roles: ["ADMIN", "CLIENT", "TEAM"] },
  { href: "/users", label: "Clients & Team", roles: ["ADMIN"] },
];

export function AppShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { role, clients, activeClientId, setActiveClientId } = useApp();
  const links = NAV.filter((n) => n.roles.includes(role));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const switcher =
    role === "ADMIN" ? (
      <div>
        <label htmlFor="client-switch" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Viewing client
        </label>
        <select
          id="client-switch"
          value={activeClientId}
          onChange={(e) => setActiveClientId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:bg-white"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white lg:flex">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-[15px] font-bold tracking-tight text-slate-900">Order System</p>
          <p className="text-[11px] font-medium capitalize text-slate-400">{role.toLowerCase()} workspace</p>
        </div>
        {switcher && <div className="px-4 pt-4">{switcher}</div>}
        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-3.5 py-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "block rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
                isActive(l.href) ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <p className="truncate text-xs font-semibold text-slate-800">{userName}</p>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="mt-0.5 text-[11px] font-medium text-slate-500 hover:text-rose-600">
            Sign out
          </button>
        </div>
      </aside>

      <header className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-900">Order System</p>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs font-medium text-slate-500">
            Sign out
          </button>
        </div>
        {switcher && <div className="mt-3">{switcher}</div>}
        <nav className="-mx-1 mt-3 flex gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
                isActive(l.href) ? "bg-brand-600 text-white" : "text-slate-600"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
