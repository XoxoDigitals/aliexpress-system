"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, fmtDate, fmtMoney } from "@/lib/utils";
import { Button, Card, CardBody, CardHeader, EmptyState, ErrorNote, Field, Input, Select, Stat } from "./ui";
import { useApp } from "./AppContext";

interface Data {
  payments: { id: string; client: { name: string }; amount: number; appliedAmount: number; creditAfter: number; mode: string; note: string | null; receivedAt: string; orderCount: number }[];
  pending: { id: string; orderNumber: string; customerName: string; clientReference: string | null; rate: number; completedAt: string | null; client: { id: string; name: string } }[];
  pendingTotal: number;
  credit: number;
}

export function PaymentsClient() {
  const { role, clients, activeClientId, setActiveClientId } = useApp();
  const isAdmin = role === "ADMIN";
  const [data, setData] = useState<Data | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"AUTO" | "SELECTED">("AUTO");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const qs = isAdmin && activeClientId ? `?clientId=${encodeURIComponent(activeClientId)}` : "";
    try {
      setData(await api<Data>(`/api/payments${qs}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [isAdmin, activeClientId]);
  useEffect(() => {
    void load();
    setSelected(new Set());
  }, [load]);

  const selectedTotal = useMemo(
    () => (data?.pending ?? []).filter((o) => selected.has(o.id)).reduce((s, o) => s + Math.round(o.rate * 100), 0) / 100,
    [data, selected]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ settled: number; credit: number }>("/api/payments", {
        body: { clientId: activeClientId, amount, note, ...(mode === "SELECTED" ? { orderIds: [...selected] } : {}) },
      });
      setNotice(`${r.settled} order(s) paid and archived. Client credit: ${fmtMoney(r.credit)}.`);
      setAmount("");
      setNote("");
      setSelected(new Set());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <ErrorNote message={error} /> : <p className="text-sm text-slate-500">Loading…</p>;
  const canSelect = isAdmin && !!activeClientId && mode === "SELECTED";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payments</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Payment pending" value={fmtMoney(data.pendingTotal)} sub={`${data.pending.length} order(s)`} />
        <Stat label="Account credit" value={fmtMoney(data.credit)} />
        <Stat label="Payments recorded" value={data.payments.length} />
      </div>

      {isAdmin && (
        <Card>
          <CardHeader><h2 className="font-semibold text-slate-900">Amount in</h2></CardHeader>
          <CardBody>
            {!activeClientId ? (
              <div className="max-w-sm">
                <Field label="Choose a client to record a payment">
                  <Select value="" onChange={(e) => setActiveClientId(e.target.value)}>
                    <option value="">Select client…</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              </div>
            ) : (
              <form onSubmit={submit} className="grid items-end gap-4 md:grid-cols-4">
                <Field label="Amount *"><Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
                <Field label="Apply to">
                  <Select value={mode} onChange={(e) => setMode(e.target.value as "AUTO" | "SELECTED")}>
                    <option value="AUTO">Oldest orders first</option>
                    <option value="SELECTED">Selected orders</option>
                  </Select>
                </Field>
                <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                <Button type="submit" disabled={busy || (mode === "SELECTED" && selected.size === 0)}>Record payment</Button>
                {mode === "SELECTED" && <p className="text-sm text-slate-600 md:col-span-4">Selected total: <strong>{fmtMoney(selectedTotal)}</strong> across {selected.size} order(s).</p>}
              </form>
            )}
            <div className="mt-3 space-y-2">
              <ErrorNote message={error} />
              {notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <CardHeader><h2 className="font-semibold text-slate-900">Pending orders</h2></CardHeader>
        {data.pending.length === 0 ? (
          <div className="p-5"><EmptyState title="Nothing pending" /></div>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {canSelect && <th className="px-4 py-3"><span className="sr-only">Select</span></th>}
                <th className="px-4 py-3">Order</th>
                {isAdmin && <th className="px-4 py-3">Client</th>}
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3 text-right">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.pending.map((o) => (
                <tr key={o.id}>
                  {canSelect && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${o.orderNumber}`}
                        checked={selected.has(o.id)}
                        onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3"><Link href={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link></td>
                  {isAdmin && <td className="px-4 py-3">{o.client.name}</td>}
                  <td className="px-4 py-3">{o.customerName}</td>
                  <td className="px-4 py-3">{fmtDate(o.completedAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(o.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <CardHeader><h2 className="font-semibold text-slate-900">Payment history</h2></CardHeader>
        {data.payments.length === 0 ? (
          <div className="p-5"><EmptyState title="No payments yet" /></div>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                {isAdmin && <th className="px-4 py-3">Client</th>}
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Orders paid</th>
                <th className="px-4 py-3 text-right">Credit after</th>
                <th className="px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{fmtDate(p.receivedAt)}</td>
                  {isAdmin && <td className="px-4 py-3">{p.client.name}</td>}
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(p.amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.orderCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(p.creditAfter)}</td>
                  <td className="px-4 py-3">{p.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
