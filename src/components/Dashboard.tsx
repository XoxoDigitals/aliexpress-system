"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, fmtMoney } from "@/lib/utils";
import { Card, CardBody, CardHeader, ErrorNote, Select, Stat } from "./ui";
import { useApp } from "./AppContext";

interface Group { id: string; name: string; orders: number; completed: number; billed: number; cost: number }
interface Analytics {
  counts: { total: number; new: number; processing: number; completed: number; cancelled: number; avgHoursToComplete: number | null };
  series: { date: string; orders: number }[];
  money?: { billed: number; pending: number; pendingOrders: number; paid: number; paidOrders: number; credit: number; purchaseCost?: number; margin?: number };
  byClient?: Group[];
  byTeam?: Group[];
}

const shortDate = (v: string) => new Date(`${v}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Breakdown({ title, rows, first }: { title: string; rows: Group[]; first: string }) {
  return (
    <Card className="overflow-x-auto">
      <CardHeader><h2 className="font-semibold text-slate-900">{title}</h2></CardHeader>
      {rows.length === 0 ? (
        <CardBody><p className="text-sm text-slate-500">No orders in this period.</p></CardBody>
      ) : (
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{first}</th>
              <th className="px-4 py-3 text-right">Orders</th>
              <th className="px-4 py-3 text-right">Completed</th>
              <th className="px-4 py-3 text-right">Billed</th>
              <th className="px-4 py-3 text-right">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.orders}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.completed}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(r.billed)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(r.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function Dashboard() {
  const { role, clients, activeClientId } = useApp();
  const [days, setDays] = useState("30");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ days });
    if (role === "ADMIN" && activeClientId) params.set("clientId", activeClientId);
    api<Analytics>(`/api/analytics?${params}`)
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [days, role, activeClientId]);

  const scope = role === "ADMIN" ? clients.find((c) => c.id === activeClientId)?.name ?? "All clients" : "My performance";
  if (!data) return error ? <ErrorNote message={error} /> : <p className="text-sm text-slate-500">Loading…</p>;
  const { counts, money } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">{scope}</p>
        </div>
        <Select aria-label="Date range" value={days} onChange={(e) => setDays(e.target.value)} className="!w-40">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 12 months</option>
        </Select>
      </div>
      <ErrorNote message={error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Orders" value={counts.total} />
        <Stat label="New" value={counts.new} />
        <Stat label="Processing" value={counts.processing} />
        <Stat label="Completed" value={counts.completed} />
        <Stat label="Avg. completion" value={counts.avgHoursToComplete === null ? "—" : `${counts.avgHoursToComplete}h`} />
      </div>

      {money && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Payment pending" value={fmtMoney(money.pending)} sub={`${money.pendingOrders} order(s), all time`} />
          <Stat label="Paid" value={fmtMoney(money.paid)} sub={`${money.paidOrders} order(s), all time`} />
          <Stat label="Billed in period" value={fmtMoney(money.billed)} />
          {role === "ADMIN" ? (
            <Stat label="Margin in period" value={fmtMoney(money.margin)} sub={`Price paid ${fmtMoney(money.purchaseCost)}`} />
          ) : (
            <Stat label="Account credit" value={fmtMoney(money.credit)} />
          )}
        </div>
      )}

      <Card>
        <CardHeader><h2 className="font-semibold text-slate-900">Orders per day</h2></CardHeader>
        <CardBody>
          <div className="h-64" role="img" aria-label={`Bar chart of orders per day. ${counts.total} orders in the selected period.`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <Tooltip labelFormatter={(v) => shortDate(String(v))} cursor={{ fill: "#f1f5f9" }} formatter={(v) => [String(v), "Orders"]} />
                <Bar dataKey="orders" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {role === "ADMIN" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Breakdown title="By client" first="Client" rows={data.byClient ?? []} />
          <Breakdown title="By team member" first="Team member" rows={data.byTeam ?? []} />
        </div>
      )}
    </div>
  );
}
