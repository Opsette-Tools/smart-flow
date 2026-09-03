import { useNavigate } from "react-router-dom";
import { discoverySessionsRepo } from "@/db/discoverySessionsRepo";
import { setActiveDiscoverySessionId } from "@/lib/activeDiscoverySession";
import { useDiscoverySessions } from "@/layout/DiscoveryContext";

/** Mirrors useCreateFlow.ts: "create, make it active, open it" in one place
 *  so every entry point stays in sync. */
export function useCreateDiscoverySession() {
  const navigate = useNavigate();
  const { refresh } = useDiscoverySessions();

  const openSession = (id: string) => {
    setActiveDiscoverySessionId(id);
    navigate(`/discovery/${id}`);
  };

  const createSession = async (name?: string) => {
    const session = await discoverySessionsRepo.create({ name });
    refresh();
    openSession(session.id);
    return session;
  };

  return { openSession, createSession };
}
