import { describe, it, expect } from "vitest";
import { mapPost } from "./communityService";
import { sortPostsLocally } from "@/lib/feedSort";

/**
 * P12-003. A viewer whose location is unknown used to get a made-up 0.5 km on every community post. The owner
 * decided on 18 Sept 2026 that such viewers see no distance at all.
 */

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: "p1", title: "Lost wallet", body: "near the bus stop", type: "LOST_FOUND", area: "Aundh",
    lat: 18.559, lng: 73.807, likes_count: 0, comments_count: 0, created_at: "2026-09-18T10:00:00Z",
    allow_comments: true, comment_policy: "EVERYONE", media: [], poll_options: null,
    author_user_id: "u1", author_name: "A", author_type: "user", ...over,
  }) as never;

const map = (r: unknown, lat?: number, lng?: number) => mapPost(r as never, new Set(), {}, {}, lat, lng, new Set());

describe("community post distance", () => {
  it("has no distance when the viewer's location is unknown — not a made-up 0.5 km", () => {
    const p = map(row());
    expect(p.distanceKm).toBeUndefined();
  });

  it("has no distance when the post has no location", () => {
    expect(map(row({ lat: null, lng: null }), 18.52, 73.85).distanceKm).toBeUndefined();
  });

  it("is the real distance when both locations are known", () => {
    const p = map(row(), 18.5204, 73.8567); // Pune centre to Aundh: about 6.7 km
    expect(p.distanceKm).toBeGreaterThan(6);
    expect(p.distanceKm).toBeLessThan(7.5);
  });

  it("sorts posts without a distance last under 'nearest', after posts with one", () => {
    const near = { ...map(row({ id: "near" }), 18.5204, 73.8567) };
    const unknown = { ...map(row({ id: "unknown" })) };
    const sorted = sortPostsLocally([unknown, near], "nearest" as never);
    expect(sorted.map((p) => p.id)).toEqual(["near", "unknown"]);
  });
});
