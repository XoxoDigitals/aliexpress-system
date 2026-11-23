"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Role = "ADMIN" | "CLIENT" | "TEAM";
export interface PersonLite {
  id: string;
  name: string;
}

interface AppState {
  role: Role;
  clients: PersonLite[];
  team: PersonLite[];
  /** Admin's selected client. Empty string means all clients. */
  activeClientId: string;
  setActiveClientId: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);
const KEY = "order-system.active-client";

export function AppProvider({
  role,
  clients,
  team,
  children,
}: {
  role: Role;
  clients: PersonLite[];
  team: PersonLite[];
  children: React.ReactNode;
}) {
  const [activeClientId, setId] = useState("");

  useEffect(() => {
    if (role !== "ADMIN") return;
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && clients.some((c) => c.id === saved)) setId(saved);
    } catch {
      // Storage can be unavailable; the switcher still works for this page view.
    }
  }, [role, clients]);

  const setActiveClientId = useCallback((id: string) => {
    setId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // See above.
    }
  }, []);

  const value = useMemo(
    () => ({ role, clients, team, activeClientId, setActiveClientId }),
    [role, clients, team, activeClientId, setActiveClientId]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
