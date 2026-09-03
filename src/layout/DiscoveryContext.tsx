import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { discoverySessionsRepo } from "@/db/discoverySessionsRepo";
import type { DiscoverySession } from "@/db/discoveryTypes";

interface DiscoveryCtx {
  sessions: DiscoverySession[];
  refresh: () => void;
}

const Ctx = createContext<DiscoveryCtx | null>(null);

/** Mirrors FlowsContext.tsx: shared session list so the sidebar/library never
 *  drift out of sync with whichever session is open. */
export function DiscoveryProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<DiscoverySession[]>([]);

  const refresh = useCallback(() => {
    discoverySessionsRepo.list().then(setSessions);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ sessions, refresh }}>{children}</Ctx.Provider>;
}

export function useDiscoverySessions() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDiscoverySessions must be used inside DiscoveryProvider");
  return ctx;
}
