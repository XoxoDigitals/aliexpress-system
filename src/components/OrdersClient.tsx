"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, fmtMoney, PAYMENT_LABELS, trackingUrl } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Select } from "./ui";
import { useApp } from "./AppContext";
import { OrderForm } from "./OrderForm";

export interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus?: string;
  clientReference: string | null;
  customerName: string;
  variantName: string;
  accountName: string | null;
  trackingNumber: string | null;
  createdAt: string;
  rate?: number;
  purchasePrice?: number | null;
  client?: { id: string; name: string };
  assignedTo?: { id: string; name: string } | null;
}

const NO_FILTERS = { q: "", status: "", paymentStatus: "", assignedToId: "", from: "", to: "" };
const PAGE_SIZE = 25;
const QUICK_VIEWS = [
  { label: "All open", status: "", paymentStatus: "", assignedToId: "", roles: ["ADMIN", "CLIENT", "TEAM"] },
  { label: "Unassigned", status: "", paymentStatus: "", assignedToId: "UNASSIGNED", roles: ["ADMIN"] },
  { label: "Unprocessed", status: "NEW", paymentStatus: "", assignedToId: "", roles: ["ADMIN", "CLIENT", "TEAM"] },
  { label: "Processing", status: "PROCESSING", paymentStatus: "", assignedToId: "", roles: ["ADMIN", "CLIENT", "TEAM"] },
  { label: "Payment pending", status: "", paymentStatus: "PENDING", assignedToId: "", roles: ["ADMIN", "CLIENT"] },
];

export function OrdersClient({ archived }: { archived: boolean }) {
  const { role, team, activeClientId } = useApp();
  const isAdmin = role === "ADMIN";
  const showBilling = role !== "TEAM";
  const [filters, setFilters] = useState(NO_FILTERS);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), archived: String(archived) });
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    if (isAdmin && activeClientId) params.set("clientId", activeClientId);
    try {
      const data = await api<{ items: OrderRow[]; total: number }>(`/api/orders?${params}`);
      setRows(data.items);
      setTotal(data.total);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, archived, filters, isAdmin, activeClientId]);

  useEffect(() => {
    void load();
    setSelected(new Set());
  }, [load]);

  const setFilter = (key: keyof typeof NO_FILTERS, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const assignable = rows.filter((r) => r.status === "NEW" || r.status === "PROCESSING");
  const allSelected = assignable.length > 0 && assignable.every((r) => selected.has(r.id));

  async function bulkAssign() {
    if (!assignee) return;
    try {
      const res = await api<{ updated: number; skipped: number }>("/api/orders/assign", {
        body: { orderIds: [...selected], teamMemberId: assignee === "NONE" ? null : assignee },
      });
      setNotice(`${res.updated} order(s) updated${res.skipped ? `, ${res.skipped} skipped` : ""}.`);
      setAssignee("");
      setSelected(new Set());
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // The API only includes purchasePrice for admins and for clients the admin has allowed.
  const showPrice = isAdmin || rows.some((r) => r.purchasePrice !== undefined);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = search || Object.entries(filters).some(([k, v]) => k !== "q" && v);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{archived ? "Archive" : "Orders"}</h1>
          <p className="text-sm text-slate-500">{total} order{total === 1 ? "" : "s"}</p>
        </div>
        {!archived && role !== "TEAM" && <Button onClick={() => setCreating(true)}>+ New order</Button>}
      </div>

      {!archived && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Quick order views">
          {QUICK_VIEWS.filter((v) => v.roles.includes(role)).map((v) => {
            const active = filters.status === v.status && filters.paymentStatus === v.paymentStatus && filters.assignedToId === v.assignedToId;
            return (
              <button
                key={v.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFilters((f) => ({ ...f, status: v.status, paymentStatus: v.paymentStatus, assignedToId: v.assignedToId }));
                  setPage(1);
                }}
                className={
                  active
                    ? "whitespace-nowrap rounded-full bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white"
                    : "whitespace-nowrap rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                }
              >
                {v.label}
              </button>
            );
          })}
        </div>
      )}

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6 [&>*]:min-w-0">
        <Input aria-label="Search orders" placeholder="Search order, customer, ref, tracking" value={search} onChange={(e) => setSearch(e.target.value)} className="lg:col-span-2" />
        <Select aria-label="Filter by status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {(archived ? ["COMPLETED", "CANCELLED"] : ["NEW", "PROCESSING", "COMPLETED"]).map((s) => (
            <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>
          ))}
        </Select>
        {showBilling && !archived && (
          <Select aria-label="Filter by payment" value={filters.paymentStatus} onChange={(e) => setFilter("paymentStatus", e.target.value)}>
            <option value="">All payments</option>
            <option value="NOT_DUE">Not due</option>
            <option value="PENDING">Payment pending</option>
          </Select>
        )}
        {isAdmin && (
          <Select aria-label="Filter by team member" value={filters.assignedToId} onChange={(e) => setFilter("assignedToId", e.target.value)}>
            <option value="">All team</option>
            <option value="UNASSIGNED">Unassigned</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-2">
          <Input aria-label="From date" type="date" className="min-w-0 flex-1 px-2" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
          <Input aria-label="To date" type="date" className="min-w-0 flex-1 px-2" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilters(NO_FILTERS); setPage(1); }}>
            Clear filters
          </Button>
        )}
      </Card>

      {isAdmin && selected.size > 0 && (
        <Card className="flex flex-wrap items-center gap-3 border-brand-200 bg-brand-50 p-3">
          <span className="text-sm font-semibold text-brand-800">{selected.size} selected</span>
          <Select aria-label="Team member to assign" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="max-w-xs">
            <option value="">Assign or reassign to…</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="NONE">Remove assignment</option>
          </Select>
          <Button size="sm" onClick={bulkAssign} disabled={!assignee}>Apply</Button>
        </Card>
      )}
      {notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
      <ErrorNote message={error} />

      {!loading && rows.length === 0 ? (
        <EmptyState title={archived ? "Nothing archived" : "No orders found"} desc={hasFilters ? "Try changing the filters." : undefined} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {isAdmin && (
                  <th className="px-4 py-3">
                    {!archived && <input type="checkbox" aria-label="Select all orders" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(assignable.map((r) => r.id)))} />}
                  </th>
                )}
                <th className="px-4 py-3">Order</th>
                {role !== "CLIENT" && <th className="px-4 py-3">Client</th>}
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Tracking</th>
                {isAdmin && <th className="px-4 py-3">Team</th>}
                {showBilling && <th className="px-4 py-3">Payment</th>}
                {showBilling && <th className="px-4 py-3 text-right">Rate</th>}
                {showPrice && <th className="px-4 py-3 text-right">Price</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {(o.status === "NEW" || o.status === "PROCESSING") && (
                        <input type="checkbox" aria-label={`Select ${o.orderNumber}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link>
                    <p className="text-xs text-slate-500">{o.clientReference ? `${o.clientReference} · ` : ""}{fmtDate(o.createdAt)}</p>
                  </td>
                  {role !== "CLIENT" && <td className="px-4 py-3">{o.client?.name}</td>}
                  <td className="px-4 py-3">{o.customerName}</td>
                  <td className="max-w-[180px] truncate px-4 py-3" title={o.variantName}>{o.variantName}</td>
                  <td className="px-4 py-3"><Badge status={o.status} /></td>
                  <td className="px-4 py-3">{o.accountName || "—"}</td>
                  <td className="px-4 py-3">
                    {o.trackingNumber ? (
                      <a href={trackingUrl(o.trackingNumber)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                        {o.trackingNumber}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  {isAdmin && <td className="px-4 py-3">{o.assignedTo?.name || <span className="text-slate-400">Unassigned</span>}</td>}
                  {showBilling && <td className="px-4 py-3"><Badge status={o.paymentStatus}>{PAYMENT_LABELS[o.paymentStatus ?? ""]}</Badge></td>}
                  {showBilling && <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(o.rate)}</td>}
                  {showPrice && <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(o.purchasePrice)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      {creating && <OrderForm onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setNotice("Order created."); void load(); }} />}
    </div>
  );
}
