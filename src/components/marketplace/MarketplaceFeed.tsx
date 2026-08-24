import type { CSSProperties, ReactNode } from "react";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@/hooks/useApi";
import { discoveryService } from "@/services";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import { ListSkeleton, ErrorView } from "@/components/states";
import { EmptyState } from "@/components/common";
import { haptics } from "@/lib/haptics";
import type { Business, Category, Provider } from "@/types";

type Row =
  | { kind: "business"; item: Business }
  | { kind: "provider"; item: Provider };

/**
 * Interleaves shops and people so a category page doesn't read as "every shop,
 * then every provider" — on a street they're the same neighbourhood, and the
 * nearest few of each are what matter. Both lists arrive already
 * distance-sorted, so alternating preserves that within each kind.
 */
function blend(businesses: Business[], providers: Provider[]): Row[] {
  const out: Row[] = [];
  const max = Math.max(businesses.length, providers.length);
  for (let i = 0; i < max; i++) {
    if (businesses[i]) out.push({ kind: "business", item: businesses[i] });
    if (providers[i]) out.push({ kind: "provider", item: providers[i] });
  }
  return out;
}

/**
 * The customer front page's marketplace: shops + providers for the selected
 * category, with an optional sub-category refine row.
 *
 * `refreshToken` is bumped by Home's pull-to-refresh; it's in the query deps
 * so a refresh actually refetches rather than serving the cached page.
 */
export default function MarketplaceFeed({
  categoryIds,
  subcategories,
  subId,
  onSubChange,
  refreshToken = 0,
  header,
  blendNearby = false,
  padClassName = "page-pad",
  style,
}: {
  /** Parent + its children, or a single sub-category. Null = everything nearby. */
  categoryIds: string[] | null;
  subcategories?: Category[];
  subId: string | null;
  onSubChange: (id: string | null) => void;
  refreshToken?: number;
  header?: ReactNode;
  blendNearby?: boolean;
  padClassName?: string;
  style?: CSSProperties;
}) {
  const { user } = useApp();
  const { t } = useI18n();

  const params = {
    lat: user.lat || undefined,
    lng: user.lng || undefined,
    categoryIds: categoryIds ?? undefined,
  };
  const key = (categoryIds ?? ["nearby"]).join(",");

  const feedGeoKey = `${(user.lat ?? 0).toFixed(2)}:${(user.lng ?? 0).toFixed(2)}`;
  const { data: bizPage, loading: bizLoading, error: bizError, refetch: refetchBiz } =
    useQuery(() => discoveryService.businesses(params), [key, refreshToken, user.lat, user.lng], `mkt-feed:biz:${key}:${feedGeoKey}`);
  const { data: provPage, loading: provLoading, error: provError, refetch: refetchProv } =
    useQuery(() => discoveryService.providers(params), [key, refreshToken, user.lat, user.lng], `mkt-feed:prov:${key}:${feedGeoKey}`);

  const businesses = bizPage?.data ?? [];
  const providers = provPage?.data ?? [];
  const loading = bizLoading || provLoading;
  // Both feeds failing is a real error; one failing still leaves a usable page,
  // so it degrades rather than blanking the whole front page.
  const error = bizError && provError ? bizError : null;

  const rows: Row[] = blendNearby
    ? blend(businesses, providers)
    : [
        ...businesses.map((item) => ({ kind: "business" as const, item })),
        ...providers.map((item) => ({ kind: "provider" as const, item })),
      ];

  return (
    <div className={padClassName} style={style}>
      {header}

      {/* Sub-category refine — only where the selected category actually has
          children, so it never renders as an empty row. */}
      {subcategories && subcategories.length > 0 && (
        <div className="hscroll" style={{ paddingTop: 10 }}>
          <button
            type="button"
            className={`chip${subId === null ? " active" : ""}`}
            onClick={() => { haptics.selection(); onSubChange(null); }}
          >
            {t("explore_tab_all")}
          </button>
          {subcategories.map((s) => {
            const active = subId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className={`chip${active ? " active" : ""}`}
                onClick={() => { haptics.selection(); onSubChange(active ? null : s.id); }}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ paddingTop: 12 }}>
        {loading && rows.length === 0 ? (
          <ListSkeleton count={4} type="business" />
        ) : error ? (
          <ErrorView error={error} onRetry={() => { refetchBiz(); refetchProv(); }} />
        ) : rows.length === 0 ? (
          <EmptyState
            emoji="🛍️"
            title={t("explore_empty_title")}
            text={t("explore_empty_text")}
          />
        ) : (
          <div className="col gap-12">
            {rows.map((row) =>
              row.kind === "business"
                ? <BusinessCardWide key={`b:${row.item.id}`} b={row.item} />
                : <ProviderCard key={`p:${row.item.id}`} p={row.item} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
