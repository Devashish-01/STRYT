import { useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import ShareCard from "@/components/ShareCard";
import { ErrorView, Skeleton } from "@/components/states";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { useI18n } from "@/lib/i18n";
import { ApiError } from "@/lib/apiClient";
import { providerService } from "@/services/marketplace/providerService";
import ProviderConsoleHeader from "@/components/console/ProviderConsoleHeader";
import ProviderManageNav from "@/screens/provider/manage/ProviderManageNav";
import { summarizeProviderActions, useProviderAppointments } from "./providerAppointments";
import { ProviderOverviewContext } from "./providerOverview";
import { useProviderStatus } from "./useProviderStatus";

export default function ProviderOverviewLayout() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [share, setShare] = useState(false);
  const { data: provider, loading, error, refetch } = useQueryWithRealtime(
    () => providerService.get(id), "providers", [id], `id=eq.${id}`, `provider:${id}`,
  );
  const status = useProviderStatus(id, provider, refetch);
  const { data: appointments } = useProviderAppointments();
  const leads = useQueryWithRealtime(
    () => providerService.leads(id), "leads", [id], `provider_id=eq.${id}`, `provider:${id}:leads`,
  );
  const unhandledLeads = (leads.data ?? []).filter((lead) => !lead.handled).length;
  const actions = summarizeProviderActions(appointments ?? [], unhandledLeads);

  if (!provider) {
    return (
      <div className="screen with-nav">
        <AppBar title={t("home")} />
        {loading ? (
          <div className="page-pad col gap-14">
            <Skeleton h={120} r={20} />
            <Skeleton h={90} r={16} />
          </div>
        ) : <ErrorView error={error ?? new ApiError(404, { code: "NOT_FOUND", message: t("provider_console_unavailable") })} onRetry={refetch} />}
        <ProviderManageNav pid={id} />
      </div>
    );
  }

  const base = `/provider/${id}/manage`;
  const openShare = () => setShare(true);
  return (
    <ProviderOverviewContext.Provider value={{
      id, base, provider, status, actions, unhandledLeads,
      leadsLoading: leads.loading && !leads.data, leadsError: Boolean(leads.error),
      refetchLeads: leads.refetch, openShare,
    }}>
      <div className="screen with-nav">
        <ProviderConsoleHeader provider={provider} available={status.available} onShare={openShare} />
        <div className="screen-scroll">
          <Outlet />
        </div>
        <ProviderManageNav pid={id} />
        {share && <ShareCard
          subjects={{
            kind: "provider", id, viewerManages: true,
            upiId: provider.upiId || undefined,
            paymentQrUrl: localStorage.getItem(`stryt_upi_qr_${id}`) || undefined,
            title: provider.displayName,
            subtitle: [provider.categoryName, provider.subCategory].filter(Boolean).join(" · "),
            image: provider.avatar || "",
            meta: `⭐ ${provider.ratingAvg || 0} (${provider.ratingCount || 0})`,
          }}
          onClose={() => setShare(false)}
        />}
      </div>
    </ProviderOverviewContext.Provider>
  );
}
