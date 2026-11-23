"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "@/lib/utils";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Select } from "./ui";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "CLIENT" | "TEAM";
  active: boolean;
  ratePerOrder: number | null;
  creditBalance: number;
}
type Draft = { id?: string; name: string; email: string; password: string; role: UserRow["role"]; ratePerOrder: string; active: boolean };
const BLANK: Draft = { name: "", email: "", password: "", role: "CLIENT", ratePerOrder: "", active: true };

export function UsersClient({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await api<UserRow[]>("/api/users"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      if (draft.id) {
        await api(`/api/users/${draft.id}`, {
          method: "PATCH",
          body: {
            name: draft.name,
            email: draft.email,
            password: draft.password,
            active: draft.active,
            ...(draft.role === "CLIENT" ? { ratePerOrder: draft.ratePerOrder } : {}),
          },
        });
      } else {
        await api("/api/users", {
          body: { name: draft.name, email: draft.email, password: draft.password, role: draft.role, ...(draft.role === "CLIENT" ? { ratePerOrder: draft.ratePerOrder } : {}) },
        });
      }
      setDraft(null);
      await load();
      router.refresh(); // Updates the client switcher and team lists.
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const shown = users.filter((u) => !roleFilter || u.role === roleFilter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clients &amp; Team</h1>
        <div className="flex gap-2">
          <Select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="!w-36">
            <option value="">All roles</option>
            <option value="CLIENT">Clients</option>
            <option value="TEAM">Team</option>
            <option value="ADMIN">Admins</option>
          </Select>
          <Button onClick={() => { setError(null); setDraft(BLANK); }}>+ Add user</Button>
        </div>
      </div>
      {!draft && <ErrorNote message={error} />}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Rate / order</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3 capitalize">{u.role.toLowerCase()}</td>
                <td className="px-4 py-3 text-right tabular-nums">{u.role === "CLIENT" ? fmtMoney(u.ratePerOrder) : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{u.role === "CLIENT" ? fmtMoney(u.creditBalance) : "—"}</td>
                <td className="px-4 py-3"><Badge status={u.active ? "ACTIVE" : "ARCHIVED"}>{u.active ? "Active" : "Inactive"}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <Button variant="secondary" size="sm" onClick={() => { setError(null); setDraft({ id: u.id, name: u.name, email: u.email, password: "", role: u.role, ratePerOrder: u.ratePerOrder?.toString() ?? "", active: u.active }); }}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {draft && (
        <Modal title={draft.id ? `Edit ${draft.name}` : "Add user"} onClose={() => setDraft(null)}>
          <form onSubmit={save} className="space-y-4">
            {!draft.id && (
              <Field label="Role">
                <Select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRow["role"] })}>
                  <option value="CLIENT">Client</option>
                  <option value="TEAM">Team member</option>
                  <option value="ADMIN">Admin</option>
                </Select>
              </Field>
            )}
            <Field label="Name *"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></Field>
            <Field label="Email *"><Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} required /></Field>
            <Field label={draft.id ? "New password" : "Password *"} hint={draft.id ? "Leave blank to keep the current password." : "At least 8 characters."}>
              <Input type="password" autoComplete="new-password" minLength={8} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} required={!draft.id} />
            </Field>
            {draft.role === "CLIENT" && (
              <Field label="Rate per order *" hint={draft.id ? "Applies to new orders. Existing orders keep their rate." : undefined}>
                <Input type="number" min="0.01" step="0.01" value={draft.ratePerOrder} onChange={(e) => setDraft({ ...draft, ratePerOrder: e.target.value })} required />
              </Field>
            )}
            {draft.id && draft.id !== currentUserId && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                Account active
              </label>
            )}
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
