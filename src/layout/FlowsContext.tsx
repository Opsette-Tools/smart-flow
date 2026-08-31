import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { flowsRepo } from "@/db/flowsRepo";
import type { Flow } from "@/db/types";

interface FlowsCtx {
  flows: Flow[];
  refresh: () => void;
}

const Ctx = createContext<FlowsCtx | null>(null);

/** Shared flow list — the sidebar reads it to render the menu, FlowPage calls
 *  `refresh()` after a rename/duplicate/delete so the sidebar never drifts
 *  out of sync with the flow you're actually looking at. */
export function FlowsProvider({ children }: { children: ReactNode }) {
  const [flows, setFlows] = useState<Flow[]>([]);

  const refresh = useCallback(() => {
    flowsRepo.list().then(setFlows);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ flows, refresh }}>{children}</Ctx.Provider>;
}

export function useFlows() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFlows must be used inside FlowsProvider");
  return ctx;
}
