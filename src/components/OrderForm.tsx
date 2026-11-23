"use client";
import { useState } from "react";
import { api } from "@/lib/utils";
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from "./ui";
import { useApp } from "./AppContext";

const EMPTY = { clientReference: "", customerDetails: "", productUrl: "", variantName: "", cardInfo: "" };
const ADDRESS_EXAMPLE = "Full name\nStreet address\nCity, State ZIP\nCountry\nPhone";

export function OrderForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { role, clients, team, activeClientId } = useApp();
  const [form, setForm] = useState(EMPTY);
  const [clientId, setClientId] = useState(activeClientId);
  const [assignedToId, setAssignedToId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = role === "ADMIN";
  const set = (key: keyof typeof EMPTY, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/orders", {
        body: {
          customerDetails: form.customerDetails,
          productUrl: form.productUrl,
          variantName: form.variantName,
          cardInfo: form.cardInfo,
          ...(isAdmin ? { clientId, assignedToId: assignedToId || null, clientReference: form.clientReference } : {}),
        },
      });
      setForm(EMPTY);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal title="New order" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" autoComplete="off">
        {isAdmin && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Client *">
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Assign to">
              <Select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                <option value="">Leave unassigned</option>
                {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Client reference">
              <Input value={form.clientReference} onChange={(e) => set("clientReference", e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Customer details *">
          <Textarea rows={5} required autoFocus placeholder={ADDRESS_EXAMPLE} value={form.customerDetails} onChange={(e) => set("customerDetails", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product link *">
            <Input type="url" required placeholder="https://" value={form.productUrl} onChange={(e) => set("productUrl", e.target.value)} />
          </Field>
          <Field label="Variant name *">
            <Input required value={form.variantName} onChange={(e) => set("variantName", e.target.value)} />
          </Field>
        </div>
        <Field label="Card info" hint="Masked and encrypted after saving, then deleted once the order is processing.">
          <Textarea
            rows={3}
            aria-label="Card info"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            value={form.cardInfo}
            onChange={(e) => set("cardInfo", e.target.value)}
          />
        </Field>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create order"}</Button>
        </div>
      </form>
    </Modal>
  );
}
