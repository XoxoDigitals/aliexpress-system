"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, fmtDateTime, fmtMoney, PAYMENT_LABELS, trackingUrl } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHeader, ErrorNote, Field, Input, Select } from "./ui";
import { useApp } from "./AppContext";
import type { OrderRow } from "./OrdersClient";

interface Detail extends OrderRow {
  customerDetails: string;
  productUrl: string;
  hasCard: boolean;
  carrier: string | null;
  processedAt: string | null;
  completedAt: string | null;
  paidAt?: string | null;
  archived: boolean;
  events: { id: string; message: string; createdAt: string }[];
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children || "—"}</dd>
    </div>
  );
}

const REVEAL_MS = 30_000;

function CardInfo({ orderId, hasCard, canReveal }: { orderId: string; hasCard: boolean; canReveal: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (value === null) return;
    const t = setTimeout(() => setValue(null), REVEAL_MS);
    return () => clearTimeout(t);
  }, [value]);

  async function reveal() {
    setError(null);
    try {
      const r = await api<{ cardInfo: string }>(`/api/orders/${orderId}/card`, { method: "POST", body: {} });
      setValue(r.cardInfo);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copy() {
    if (value === null) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!hasCard) return <p className="text-sm text-slate-500">Not available</p>;
  return (
    <div className="space-y-2">
      {value === null ? (
        <p className="text-sm tracking-widest text-slate-700" aria-label="Card info hidden">••••••••••••</p>
      ) : (
        <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 font-mono text-sm text-slate-900">{value}</p>
      )}
      {canReveal && (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => (value === null ? void reveal() : setValue(null))}>
            {value === null ? "Show" : "Hide"}
          </Button>
          {value !== null && <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button>}
        </div>
      )}
      <ErrorNote message={error} />
    </div>
  );
}

export function OrderDetail({ orderId }: { orderId: string }) {
  const { role, team } = useApp();
  const [order, setOrder] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");

  const [idDraft, setIdDraft] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await api<Detail>(`/api/orders/${orderId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [orderId]);
  useEffect(() => void load(), [load]);

  async function act(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${orderId}/${path}`, { body });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reassign(teamMemberId: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/orders/assign", { body: { orderIds: [orderId], teamMemberId: teamMemberId || null } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveOrderId(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${orderId}`, { method: "PATCH", body: { orderNumber: idDraft } });
      setIdDraft(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!order) return error ? <ErrorNote message={error} /> : <p className="text-sm text-slate-500">Loading…</p>;
  const canReassign = role === "ADMIN" && (order.status === "NEW" || order.status === "PROCESSING");
  const currentMissing = order.assignedTo && !team.some((t) => t.id === order.assignedTo?.id);

  const canWork = role === "TEAM" || role === "ADMIN";
  const safeLink = /^https?:\/\//i.test(order.productUrl);

  return (
    <div className="space-y-5">
      <Link href={order.archived ? "/archive" : "/orders"} className="text-sm font-medium text-brand-700 hover:underline">
        ← Back
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        {idDraft !== null ? (
          <form onSubmit={saveOrderId} className="flex flex-wrap items-center gap-2">
            <Input aria-label="Order ID" value={idDraft} maxLength={60} required autoFocus onChange={(e) => setIdDraft(e.target.value)} className="!w-64" />
            <Button type="submit" size="sm" disabled={busy}>Save</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setIdDraft(null)}>Cancel</Button>
          </form>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{order.orderNumber}</h1>
            {role === "ADMIN" && (
              <Button variant="ghost" size="sm" onClick={() => { setError(null); setIdDraft(order.orderNumber); }}>Edit ID</Button>
            )}
          </>
        )}
        <Badge status={order.status} />
        {order.paymentStatus && <Badge status={order.paymentStatus}>{PAYMENT_LABELS[order.paymentStatus]}</Badge>}
        {role === "ADMIN" && (order.status === "NEW" || order.status === "PROCESSING") && (
          <Button variant="secondary" size="sm" className="ml-auto" disabled={busy} onClick={() => { if (window.confirm("Cancel this order?")) void act("cancel", {}); }}>
            Cancel order
          </Button>
        )}
      </div>
      <ErrorNote message={error} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {canWork && order.status === "NEW" && (
            <Card className="border-amber-200">
              <CardHeader><h2 className="font-semibold text-slate-900">Mark as Processing</h2></CardHeader>
              <CardBody>
                {role === "ADMIN" && !order.assignedTo ? (
                  <p className="text-sm text-slate-600">Choose a team member under Assigned to first.</p>
                ) : (
                  <form className="grid items-end gap-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void act("process", { accountName, purchasePrice }); }}>
                    <Field label="Account name *"><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} required /></Field>
                    <Field label="Price *"><Input type="number" min="0" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} required /></Field>
                    <Button type="submit" disabled={busy}>Set Processing</Button>
                  </form>
                )}
              </CardBody>
            </Card>
          )}
          {canWork && order.status === "PROCESSING" && (
            <Card className="border-emerald-200">
              <CardHeader><h2 className="font-semibold text-slate-900">Add tracking</h2></CardHeader>
              <CardBody>
                <form className="grid items-end gap-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void act("tracking", { trackingNumber, carrier }); }}>
                  <Field label="Tracking number *"><Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} required /></Field>
                  <Field label="Carrier">
                    <Select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                      <option value="">Not specified</option>
                      {["USPS", "UPS", "FedEx", "DHL", "Other"].map((c) => <option key={c}>{c}</option>)}
                    </Select>
                  </Field>
                  <Button type="submit" disabled={busy}>Save and complete</Button>
                </form>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader><h2 className="font-semibold text-slate-900">Order details</h2></CardHeader>
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                {role !== "CLIENT" && <Info label="Client">{order.client?.name}</Info>}
                <Info label="Client reference">{order.clientReference}</Info>
                <Info label="Customer details"><span className="whitespace-pre-line">{order.customerDetails}</span></Info>
                <Info label="Product link">
                  {safeLink ? <a href={order.productUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">{order.productUrl}</a> : order.productUrl}
                </Info>
                <Info label="Variant">{order.variantName}</Info>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Card info</dt>
                  <dd className="mt-0.5">
                    <CardInfo key={order.status} orderId={order.id} hasCard={order.hasCard} canReveal={canWork && order.status === "NEW"} />
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-900">Fulfilment</h2></CardHeader>
            <CardBody>
              <dl className="space-y-3">
                {canReassign ? (
                  <Field label="Assigned to">
                    <Select aria-label="Assign or reassign team member" value={order.assignedTo?.id ?? ""} disabled={busy} onChange={(e) => void reassign(e.target.value)}>
                      <option value="">Unassigned</option>
                      {currentMissing && <option value={order.assignedTo!.id}>{order.assignedTo!.name} (inactive)</option>}
                      {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </Field>
                ) : (
                  role === "ADMIN" && <Info label="Assigned to">{order.assignedTo?.name}</Info>
                )}
                <Info label="Account name">{order.accountName}</Info>
                <Info label="Tracking">
                  {order.trackingNumber ? (
                    <>
                      <a href={trackingUrl(order.trackingNumber)} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                        {order.trackingNumber}
                      </a>
                      {order.carrier ? ` (${order.carrier})` : ""}
                    </>
                  ) : null}
                </Info>
                {role !== "TEAM" && <Info label="Rate">{fmtMoney(order.rate)}</Info>}
                {order.purchasePrice !== undefined && <Info label="Processing price">{fmtMoney(order.purchasePrice)}</Info>}
                {role !== "TEAM" && order.paidAt && <Info label="Paid">{fmtDateTime(order.paidAt)}</Info>}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-900">Timeline</h2></CardHeader>
            <CardBody>
              <ol className="space-y-3">
                {order.events.map((ev) => (
                  <li key={ev.id}>
                    <p className="text-sm text-slate-800">{ev.message}</p>
                    <p className="text-xs text-slate-500">{fmtDateTime(ev.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
