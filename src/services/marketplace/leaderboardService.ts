import { getSupabase } from "@/lib/supabaseClient";

export const leaderboardService = {
  async addPoints(userId: string, points: number): Promise<void> {
    if (!userId || points <= 0) return;
    const sb = getSupabase();
    const { data } = await sb
      .from("leaderboard_points")
      .select("points")
      .eq("user_id", userId)
      .maybeSingle();
    await sb.from("leaderboard_points").upsert(
      { user_id: userId, points: (data?.points ?? 0) + points, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  },
};
