import { useCallback, useEffect, useRef, useState } from "react";
import { socialService } from "@/services";
import { getSupabase } from "@/lib/supabaseClient";
import { aliasName } from "@/lib/publicName";
import { storyAge } from "@/lib/stories";
import type { Story } from "@/types";

export interface StoryViewerRow {
  userId: string;
  name: string;
  avatar: string;
  reaction: string | null;
  /** Compact age of the view ("5m"), already translated. */
  when: string;
}

export interface PrivacyUser { id: string; name: string; avatar: string }

type AgeFmt = (unit: "now" | "m" | "h" | "d", n: number) => string;

/**
 * Who watched one of your own stories, live, plus who it was shared with / hidden from. Only runs for the author
 * (the database only lets the author — and a shop's team — read this anyway), and only for the story on screen.
 */
export function useStoryViews(story: Story | undefined, enabled: boolean, fmtAge: AgeFmt) {
  const [viewers, setViewers] = useState<StoryViewerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [privacyUsers, setPrivacyUsers] = useState<PrivacyUser[]>([]);
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);
  const fmtRef = useRef(fmtAge);
  useEffect(() => { fmtRef.current = fmtAge; });

  const storyId = story?.id;
  const visibility = story?.visibility;
  const listIds = visibility === "close_friends" ? story?.allowedUserIds : story?.hiddenUserIds;
  const listKey = (listIds ?? []).join(",");

  const load = useCallback(async () => {
    if (!storyId) return;
    try {
      const rows = await socialService.getStoryViewers(storyId);
      setViewers(rows.map((r) => ({
        userId: r.userId, name: r.name, avatar: r.avatar ?? "", reaction: r.reaction ?? null,
        when: storyAge(r.viewedAt, fmtRef.current),
      })));
    } catch (err) {
      console.warn("getStoryViewers failed:", err);
    }
  }, [storyId]);

  // Viewers: load when the story changes, then keep current while it is on screen.
  useEffect(() => {
    if (!enabled || !storyId) { setViewers([]); return; }
    let live = true;
    setLoading(true);
    void load().finally(() => { if (live) setLoading(false); });
    const sb = getSupabase();
    const channel = sb
      .channel(`rt:story_views:${storyId}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "story_views", filter: `story_id=eq.${storyId}` }, () => { void load(); })
      .subscribe();
    return () => { live = false; void sb.removeChannel(channel); };
  }, [enabled, storyId, load]);

  // Audience lists: shown by the public alias, never the real name.
  useEffect(() => {
    if (!enabled || !storyId || !listKey) { setPrivacyUsers([]); return; }
    let live = true;
    setLoadingPrivacy(true);
    void (async () => {
      try {
        const { data, error } = await getSupabase()
          .from("users")
          .select("id, name, alias, avatar, show_name_publicly")
          .in("id", listKey.split(","));
        if (!live) return;
        if (!error && data) {
          setPrivacyUsers(data.map((u) => ({
            id: u.id,
            name: aliasName({ alias: u.alias, name: u.name, showNamePublicly: u.show_name_publicly }, "Neighbor"),
            avatar: u.avatar ?? "",
          })));
        }
      } catch (err) {
        console.warn("Failed to fetch privacy users:", err);
      } finally {
        if (live) setLoadingPrivacy(false);
      }
    })();
    return () => { live = false; };
  }, [enabled, storyId, listKey]);

  return { viewers, loading, privacyUsers, loadingPrivacy, reload: load };
}
