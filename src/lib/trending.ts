import type { CommunityPost } from "@/types";

/** Engagement decayed by age (Reddit-style "hot" ranking) — powers the community feed's "Trending nearby" sort. */
export function trendingScore(post: CommunityPost): number {
  const ageHours = post.createdAtISO
    ? Math.max(0, (Date.now() - new Date(post.createdAtISO).getTime()) / 3600000)
    : 0;
  const engagement = post.likes + post.commentsCount * 2;
  return engagement / Math.pow(ageHours + 2, 1.5);
}
