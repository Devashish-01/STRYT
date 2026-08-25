import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { EmptyListIllustration } from "@/components/illustrations";
import { Plus, ChevronRight, Users, Store } from "@/components/Icons";
import { useApp } from "@/store";
import { businessService, providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import type { Business, Provider } from "@/types";
import { useI18n } from "@/lib/i18n";

const emojis = ["🌟", "🍽️", "🚨", "🧸", "💎", "🎁", "🏠", "💇", "🛍️", "❤️"];

export default function Lists() {
  const nav = useNavigate();
  const { lists, createList, user } = useApp();
  const { t, tf } = useI18n();
  // The open list lives in the URL (`?list=<id>`), not component state, so
  // hardware/browser back closes the list instead of leaving the whole screen,
  // and an open list survives a refresh.
  const [params, setParams] = useSearchParams();
  const open = params.get("list");
  const setOpen = (id: string | null) => setParams(id ? { list: id } : {});
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🌟");

  const active = lists.find((l) => l.id === open);

  // Fetched by ID, not the generic "nearby" feed filtered client-side — that
  // feed is capped and radius-scoped, so a saved item outside it (or just
  // outside the user's current location radius) would silently never
  // render here even though it's genuinely in the list.
  const bizIds = Array.from(new Set((active?.items ?? []).filter((it) => it.type === "BUSINESS").map((it) => it.id)));
  const provIds = Array.from(new Set((active?.items ?? []).filter((it) => it.type === "PROVIDER").map((it) => it.id)));
  const { data: bizData } = useQuery(async () => {
    const rows = await Promise.all(bizIds.map((id) => businessService.get(id).catch(() => undefined)));
    return rows.filter((b): b is Business => !!b);
  }, [bizIds.join(",")], `lists:biz-by-id:${active?.id}:${bizIds.join(",")}`);
  const { data: provData } = useQuery(async () => {
    const rows = await Promise.all(provIds.map((id) => providerService.get(id).catch(() => undefined)));
    return rows.filter((p): p is Provider => !!p);
  }, [provIds.join(",")], `lists:prov-by-id:${active?.id}:${provIds.join(",")}`);
  const businesses = bizData ?? [];
  const providers = provData ?? [];

  if (active) {
    return (
      <div className="screen">
        {/* No Share button: user_lists' SELECT policy is strictly
            `user_id = auth.uid()` with no exception for `shared`, so a copied
            link is unreadable by anyone else. It copied window.location.href
            (always "/lists") on top of that. Re-add this when server-side list
            sharing actually exists. */}
        <AppBar
          title={`${active.emoji} ${active.name}`}
          subtitle={tf("n_saved", { n: active.items.length })}
          onBack={() => setOpen(null)}
        />
        <div className="screen-scroll page-pad col gap-12">
          {active.items.length === 0 ? (
            <EmptyState
              illustration={<EmptyListIllustration />}
              emoji="📂"
              title={t("nothing_saved_yet")}
              text={t("nothing_saved_desc")}
              action={
                <button className="btn btn-outline row gap-6 center" onClick={() => nav("/explore")}>
                  <Store size={16} /> {t("explore_nearby")}
                </button>
              }
            />
          ) : (
            active.items.map((it, i) => {
              const b = it.type === "BUSINESS" ? businesses.find((x) => x.id === it.id) : undefined;
              const p = it.type === "PROVIDER" ? providers.find((x) => x.id === it.id) : undefined;
              const name = b?.name ?? p?.displayName ?? t("item_fallback");
              const img = b?.coverImage ?? p?.avatar ?? "";
              const sub = b?.subCategory ?? p?.categoryName ?? "";
              return (
                <button key={it.id} className="card row gap-12" style={{ padding: 12, textAlign: "left" }} onClick={() => nav(it.type === "BUSINESS" ? `/business/${it.id}` : `/provider/${it.id}`)}>
                  <SafeImg src={img} variant={it.type === "PROVIDER" ? "avatar" : "photo"} className="thumb" style={{ width: 56, height: 56, borderRadius: 12 }} />
                  <div className="grow">
                    <div className="semi small">{name}</div>
                    <div className="tiny muted">{sub}</div>
                  </div>
                  <ChevronRight size={18} color="var(--ink-300)" />
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title={t("my_lists")} right={<button className="icon-btn" onClick={() => setCreating(true)}><Plus size={20} /></button>} />
      <div className="screen-scroll page-pad col gap-12">
        {creating && (
          <div className="card">
            <div className="row gap-8" style={{ overflowX: "auto", marginBottom: 10 }}>
              {emojis.map((e) => (
                <button key={e} onClick={() => setEmoji(e)} style={{ fontSize: 22, opacity: emoji === e ? 1 : 0.4, transform: emoji === e ? "scale(1.2)" : "scale(1)" }}>{e}</button>
              ))}
            </div>
            <input className="input" placeholder={t("list_name_placeholder")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="row gap-8" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost grow btn-sm" onClick={() => { setCreating(false); setName(""); }}>{t("cancel_action")}</button>
              <button className="btn btn-primary grow btn-sm" disabled={name.trim().length < 2} onClick={() => { createList(name.trim(), emoji); setName(""); setCreating(false); }}>{t("create_word")}</button>
            </div>
          </div>
        )}

        {/* Feedback #15 — "my list page when empty should see some good
            background". This case had NO empty state at all: with no lists,
            the map below rendered nothing and the screen was genuinely blank
            under the AppBar. The illustration + a first-run action give it
            something to be. */}
        {lists.length === 0 && !creating && (
          <EmptyState
            illustration={<EmptyListIllustration />}
            emoji="🌟"
            title={t("no_lists_yet")}
            text={t("no_lists_desc")}
            action={
              <button className="btn btn-primary row gap-6 center" onClick={() => setCreating(true)}>
                <Plus size={16} /> {t("create_first_list")}
              </button>
            }
          />
        )}

        {lists.map((l) => (
          <button key={l.id} className="card row gap-12" style={{ padding: 14, textAlign: "left" }} onClick={() => setOpen(l.id)}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{l.emoji}</div>
            <div className="grow">
              <div className="semi">{l.name}</div>
              <div className="tiny muted row gap-6">{tf("n_saved", { n: l.items.length })} {l.shared && <span className="row gap-4"><Users size={11} /> {t("shared_word")}</span>}</div>
            </div>
            <ChevronRight size={18} color="var(--ink-300)" />
          </button>
        ))}
      </div>
    </div>
  );
}
