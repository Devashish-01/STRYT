import { useCallback, useEffect, useState } from "react";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { businessService, providerService, socialService } from "@/services";
import { getSupabase } from "@/lib/supabaseClient";
import { aliasName } from "@/lib/publicName";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";

type OwnerType = "user" | "business" | "provider";
interface MutedRow { key: string; ownerType: OwnerType; ownerId: string; name: string; avatar: string }

/** Display details for the people / shops / providers behind a list of mute keys (`business:<id>` …). */
async function describe(keys: string[], fallback: Record<OwnerType, string>): Promise<MutedRow[]> {
  const parsed = keys.map((key) => {
    const i = key.indexOf(":");
    return { key, ownerType: key.slice(0, i) as OwnerType, ownerId: key.slice(i + 1) };
  });

  const userIds = parsed.filter((p) => p.ownerType === "user").map((p) => p.ownerId);
  const users = new Map<string, { name: string; avatar: string }>();
  if (userIds.length > 0) {
    const { data } = await getSupabase().from("users").select("id, name, alias, avatar, show_name_publicly").in("id", userIds);
    for (const u of data ?? []) {
      users.set(u.id, { name: aliasName({ alias: u.alias, name: u.name, showNamePublicly: u.show_name_publicly }, fallback.user), avatar: u.avatar ?? "" });
    }
  }

  return Promise.all(parsed.map(async (p): Promise<MutedRow> => {
    try {
      if (p.ownerType === "business") {
        const b = await businessService.get(p.ownerId);
        return { ...p, name: b?.name || fallback.business, avatar: b?.coverImage ?? "" };
      }
      if (p.ownerType === "provider") {
        const v = await providerService.get(p.ownerId);
        return { ...p, name: v?.displayName || fallback.provider, avatar: v?.avatar ?? "" };
      }
    } catch { /* the shop or provider is gone: still listed, so it can be unmuted */ }
    const u = users.get(p.ownerId);
    return { ...p, name: u?.name ?? fallback[p.ownerType], avatar: u?.avatar ?? "" };
  }));
}

/** Settings → Privacy → Muted stories: everyone whose stories you chose not to see, each with an Unmute. */
export default function MutedStories() {
  const { t, tf } = useI18n();
  const { showToast } = useApp();
  const [rows, setRows] = useState<MutedRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const keys = [...(await socialService.myStoryMutes())];
      setRows(await describe(keys, { user: t("muted_fallback_user"), business: t("muted_fallback_shop"), provider: t("muted_fallback_provider") }));
    } catch {
      setRows([]);
      showToast(t("muted_load_failed"));
    }
  }, [t, showToast]);

  useEffect(() => { void load(); }, [load]);

  async function unmute(row: MutedRow) {
    setBusy(row.key);
    try {
      await socialService.unmuteStoryAuthor(row.ownerType, row.ownerId);
      setRows((r) => (r ?? []).filter((x) => x.key !== row.key));
      showToast(tf("story_unmuted_toast", { name: row.name }));
    } catch {
      showToast(t("story_action_failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title={t("muted_title")} subtitle={t("muted_sub")} />
      <div className="screen-scroll page-pad" style={{ paddingTop: 14, paddingBottom: 24 }}>
        {rows === null ? (
          <ListSkeleton count={3} />
        ) : rows.length === 0 ? (
          <EmptyState emoji="🔔" title={t("muted_empty_title")} text={t("muted_empty_text")} />
        ) : (
          <div className="col gap-10">
            {rows.map((r) => (
              <div key={r.key} className="card row gap-12 center-v" style={{ padding: 12 }}>
                <SafeImg src={r.avatar} variant="avatar" style={{ width: 44, height: 44 }} />
                <span className="grow semi" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-900)" }}>{r.name}</span>
                <button className="btn btn-outline btn-sm" disabled={busy === r.key} onClick={() => void unmute(r)}>{t("muted_unmute")}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
