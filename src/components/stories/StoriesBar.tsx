import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Plus } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { socialService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { firstUnseenIndex, groupStories, orderGroups, ringTone, type StoryGroup } from "@/lib/stories";
import type { Story } from "@/types";
import { StoryViewer } from "./StoryViewer";

const PURGE_FLAG = "stryt_story_purge_ran";

/**
 * The row of rings: your story first (tap to watch, the + to add), then the people and shops near you who posted.
 * Bright ring = something new, green = something new for close friends only, grey = you have seen it all.
 */
export function StoriesBar({ variant = "hub" }: { variant?: "hub" | "home" }) {
  const { viewedStories, user, isGuest, ownedBusinessIds, ownedProviderId } = useApp();
  const { t, tf } = useI18n();
  const nav = useNavigate();
  // The viewer gets a snapshot taken at the moment of the tap. Watching marks stories seen, which re-sorts the live
  // list; a viewer reading the live list would jump to a different person halfway through.
  const [open, setOpen] = useState<{ groups: StoryGroup[]; group: number; story: number } | null>(null);

  const savedRadius = localStorage.getItem("settings_radius");
  const radius = savedRadius ? parseFloat(savedRadius) : 5;
  const { data: nearby, loading, refetch: refetchNearby } = useQueryWithRealtime(
    () => (user.lat && user.lng ? socialService.storiesNearby(user.lat, user.lng, radius) : socialService.stories()),
    "stories",
    [user.lat, user.lng, radius],
    undefined,
    `stories:nearby:${(user.lat ?? 0).toFixed(2)}:${(user.lng ?? 0).toFixed(2)}:${radius}`,
  );
  const { data: mine, refetch: refetchMine } = useQueryWithRealtime(
    () => socialService.myStories(), "stories", [user.id], undefined, `stories:mine:${user.id}`,
  );
  const { data: muted, refetch: refetchMuted } = useQuery(() => (isGuest ? Promise.resolve(new Set<string>()) : socialService.myStoryMutes()), [user.id, isGuest]);
  const { data: blocked, refetch: refetchBlocked } = useQuery(() => (isGuest ? Promise.resolve(new Set<string>()) : socialService.myBlockedIds()), [user.id, isGuest]);

  // Old stories of yours (not Highlights) are tidied up once per session, photos included.
  useEffect(() => {
    if (isGuest || !user.id) return;
    try {
      if (sessionStorage.getItem(PURGE_FLAG)) return;
      sessionStorage.setItem(PURGE_FLAG, "1");
    } catch { /* no sessionStorage: just try it */ }
    void socialService.purgeMyExpiredStories().catch(() => undefined);
  }, [isGuest, user.id]);

  const isMine = (s: Story) =>
    (!!s.userId && s.userId === user.id) ||
    (!!s.businessId && !!ownedBusinessIds?.includes(s.businessId)) ||
    (!!s.providerId && s.providerId === ownedProviderId);

  const groups = useMemo<StoryGroup[]>(() => {
    const all = new Map<string, Story>();
    for (const s of nearby ?? []) all.set(s.id, s);
    for (const s of mine ?? []) all.set(s.id, s);
    return orderGroups(
      groupStories([...all.values()], { isMine, muted: muted ?? undefined, blockedUserIds: blocked ?? undefined }),
      viewedStories,
    );
    // isMine is derived from the three values listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearby, mine, muted, blocked, viewedStories, user.id, ownedBusinessIds, ownedProviderId]);

  const myPersonal = groups.find((g) => g.isMine && g.authorType === "user");
  const others = groups.filter((g) => g !== myPersonal);

  // A visitor with nothing to watch gets no empty strip on Home (the Community page keeps its own).
  if (variant === "home" && isGuest && !loading && groups.length === 0) return null;

  function openGroup(g: StoryGroup) {
    const idx = groups.indexOf(g);
    if (idx < 0) return;
    setOpen({ groups, group: idx, story: g.isMine ? 0 : firstUnseenIndex(g, viewedStories) });
  }

  function refreshAll() {
    refetchNearby?.();
    refetchMine?.();
    refetchMuted?.();
    refetchBlocked?.();
  }

  // A plain render function, not a component: a component declared here would be a new type every render and
  // every ring would remount (and flash) each time a story is marked seen.
  const renderTile = (g: StoryGroup) => {
    const tone = ringTone(g, viewedStories);
    const isMyReel = g === myPersonal;
    const label = isMyReel ? t("story_your") : g.authorName;
    return (
      <div className="sr-tile" key={g.key}>
        <button className="sr-hit" onClick={() => openGroup(g)} aria-label={tf("story_open_of", { name: label })}>
          <span className="sr-ring" data-tone={tone}>
            <SafeImg src={isMyReel ? (g.authorAvatar || user.avatar) : g.authorAvatar} alt="" variant="avatar" />
          </span>
        </button>
        {isMyReel && (
          <button className="sr-plus" onClick={() => nav("/story/new")} aria-label={t("story_add_aria")}><Plus size={13} weight="bold" /></button>
        )}
        <span className="sr-name">{label}</span>
      </div>
    );
  };

  return (
    <>
      <div className={`sr-rail${variant === "home" ? " home" : ""}`} role="list" aria-label={t("story_rail_aria")}>
        {!isGuest && (myPersonal ? (
          renderTile(myPersonal)
        ) : (
          <div className="sr-tile">
            <button className="sr-hit" onClick={() => nav("/story/new")} aria-label={t("story_add_aria")}>
              <span className="sr-ring" data-tone="add"><Camera size={26} /></span>
            </button>
            <span className="sr-plus" aria-hidden="true"><Plus size={13} weight="bold" /></span>
            <span className="sr-name">{t("story_your")}</span>
          </div>
        ))}

        {loading && others.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="sr-tile" aria-hidden="true">
                <div className="skel sr-skel-ring" />
                <div className="skel sr-skel-name" />
              </div>
            ))
          : others.map(renderTile)}
      </div>

      {open && (
        <StoryViewer
          groups={open.groups}
          startGroupIndex={open.group}
          startStoryIndex={open.story}
          onClose={() => { setOpen(null); refreshAll(); }}
          onChanged={refreshAll}
        />
      )}
    </>
  );
}
