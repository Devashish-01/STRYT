import { createContext, useContext } from "react";
import type { Provider } from "@/types";
import type { useProviderStatus } from "./useProviderStatus";
import type { summarizeProviderActions } from "./providerAppointments";

interface ProviderOverview {
  id: string;
  base: string;
  provider: Provider;
  status: ReturnType<typeof useProviderStatus>;
  actions: ReturnType<typeof summarizeProviderActions>;
  unhandledLeads: number;
  leadsLoading: boolean;
  leadsError: boolean;
  refetchLeads: () => void;
  openShare: () => void;
}

export const ProviderOverviewContext = createContext<ProviderOverview | null>(null);

export function useProviderOverview() {
  const data = useContext(ProviderOverviewContext);
  if (!data) throw new Error("Provider overview data requires a Provider Home or Dashboard route.");
  return data;
}
