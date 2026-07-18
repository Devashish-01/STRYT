/**
 * UserProfileSheet — a globally-triggered bottom sheet showing a mini profile
 * card for any USER, BUSINESS, or PROVIDER. Opens instantly with pre-filled
 * name/avatar (no flicker), then fetches and renders detailed stats, ratings,
 * badges, and contextual action buttons (Follow/Unfollow, Message, View Details).
 *
 * Trigger from anywhere:
 *   import { openProfile } from "@/lib/profileSheet";
 *   openProfile(id, "USER" | "BUSINESS" | "PROVIDER", { name: "Rahul", avatar: avatarUrl });
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { _subscribeProfileSheet, type ProfileSheetPayload } from "@/lib/profileSheet";
import { userService, chatService, businessService, providerService } from "@/services";
import { SafeImg } from "@/components/common";
import { useApp } from "@/store";
import { aliasName } from "@/lib/publicName";
import {
  Star,
  BadgeCheck,
  MessageSquareText,
  UserPlus,
  UserCheck,
  ExternalLink,
  X,
} from "@/components/Icons";

interface MiniProfile {
  id: string;
  type: "USER" | "BUSINESS" | "PROVIDER";
  name: string;
  avatar?: string;
  subtitle?: string;
  area?: string;
  ratingAvg: number;
  ratingCount: number;
  badges: string[];
  verifications: string[];
  memberSince?: string;
  distanceKm?: number;
  ownerUserId?: string;
}

export default function UserProfileSheet() {
  const nav = useNavigate();
  const { user: me, showToast, isFollowing, toggleFollow } = useApp();

  const [payload, setPayload] = useState<ProfileSheetPayload | null>(null);
  const [profile, setProfile] = useState<MiniProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatting, setChatting] = useState(false);

  // Register as the one global listener
  useEffect(() => {
    return _subscribeProfileSheet((p) => {
      setPayload(p);
      setProfile(null);
    });
  }, []);

  // Fetch profile data whenever a new payload arrives
  useEffect(() => {
    if (!payload) return;
    setLoading(true);

    const { id, type } = payload;
    const lat = me.lat || undefined;
    const lng = me.lng || undefined;

    if (type === "USER") {
      userService
        .publicProfile(id)
        .then((u) => {
          if (!u) return;
          setProfile({
            id: u.id,
            type: "USER",
            name: aliasName(u),
            avatar: u.avatar,
            area: u.area,
            ratingAvg: u.ratingAvg,
            ratingCount: u.ratingCount,
            badges: u.badges ?? [],
            verifications: u.verifications ?? [],
            memberSince: u.memberSince,
            ownerUserId: u.id,
          });
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else if (type === "BUSINESS") {
      businessService
        .get(id, lat, lng)
        .then((b) => {
          if (!b) return;
          setProfile({
            id: b.id,
            type: "BUSINESS",
            name: b.name,
            avatar: b.coverImage,
            subtitle: b.subCategory || b.categoryName,
            area: b.city,
            ratingAvg: b.ratingAvg,
            ratingCount: b.ratingCount,
            badges: b.isVerified ? ["Verified Business"] : [],
            verifications: b.isVerified ? ["Verified Business"] : [],
            distanceKm: b.distanceKm,
            ownerUserId: b.ownerUserId,
          });
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else if (type === "PROVIDER") {
      providerService
        .get(id, lat, lng)
        .then((p) => {
          if (!p) return;
          setProfile({
            id: p.id,
            type: "PROVIDER",
            name: p.displayName,
            avatar: p.avatar,
            subtitle: p.categoryName,
            area: p.bio ? p.bio.slice(0, 80) + (p.bio.length > 80 ? "..." : "") : undefined,
            ratingAvg: p.ratingAvg,
            ratingCount: p.ratingCount,
            badges: p.isVerified ? ["Verified Provider"] : [],
            verifications: p.isVerified ? ["Verified Provider"] : [],
            distanceKm: p.distanceKm,
            ownerUserId: p.userId,
          });
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [payload?.id, payload?.type, me.lat, me.lng]);

  if (!payload) return null;

  const { id, type } = payload;
  const isSelf = profile?.ownerUserId ? me.id === profile.ownerUserId : me.id === id;
  const following = isFollowing(type, id);

  // Displayed immediately from hint while full profile loads
  const displayName = profile?.name ?? payload.hint?.name ?? "…";
  const displayAvatar = profile?.avatar ?? payload.hint?.avatar;
  const displaySubtitle = profile?.subtitle;

  async function handleChat() {
    const ownerId = profile?.ownerUserId || id;
    if (chatting || !ownerId) return;
    setChatting(true);
    try {
      let conv;
      if (type === "BUSINESS") {
        conv = await chatService.getOrCreate(ownerId, {
          type: "business",
          id,
          name: displayName,
          avatar: displayAvatar || "",
          ownerUserId: ownerId,
        });
        businessService.recordInteraction(id, "MESSAGE").catch(() => {});
      } else if (type === "PROVIDER") {
        conv = await chatService.getOrCreate(ownerId, {
          type: "provider",
          id,
          name: displayName,
          avatar: displayAvatar || "",
          ownerUserId: ownerId,
        });
        providerService.recordInteraction(id, "MESSAGE").catch(() => {});
      } else {
        conv = await chatService.getOrCreate(ownerId);
      }
      close();
      nav(`/chat/${conv.id}`);
    } catch (err: any) {
      showToast(err.message || "Couldn't start chat");
    } finally {
      setChatting(false);
    }
  }

  function handleViewFull() {
    close();
    if (type === "BUSINESS") {
      nav(`/business/${id}`);
    } else if (type === "PROVIDER") {
      nav(`/provider/${id}`);
    } else {
      nav(`/u/${id}`);
    }
  }

  const close = () => setPayload(null);

  // Dynamic color rings based on profile type
  const ringGradient =
    type === "BUSINESS"
      ? "linear-gradient(135deg, var(--orange-400), var(--orange-600))"
      : type === "PROVIDER"
      ? "linear-gradient(135deg, var(--green-400), var(--green-600))"
      : "linear-gradient(135deg, var(--amber-500), var(--pink-500), var(--brand-500))";

  return (
    <div className="overlay" onClick={close} style={{ zIndex: 9999 }}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
      >
        <div className="sheet-grab" />

        {/* Close button */}
        <button
          className="icon-btn"
          onClick={close}
          aria-label="Close"
          style={{ position: "absolute", top: 16, right: 16, zIndex: 1 }}
        >
          <X size={18} />
        </button>

        {/* ── Hero: avatar + name + rating ── */}
        <div className="col center" style={{ paddingTop: 8, paddingBottom: 20 }}>
          {/* Gradient ring */}
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: type === "BUSINESS" ? 18 : "50%",
              padding: 3,
              background: ringGradient,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              marginBottom: 12,
            }}
          >
            <SafeImg
              src={displayAvatar}
              variant={type === "USER" ? "avatar" : "photo"}
              style={{
                width: 78,
                height: 78,
                borderRadius: type === "BUSINESS" ? 15 : "50%",
                objectFit: "cover",
                border: "2.5px solid var(--bg)",
                display: "block",
              }}
            />
          </div>

          <div className="bold" style={{ fontSize: 18, letterSpacing: -0.3 }}>
            {displayName}
          </div>

          {displaySubtitle && (
            <div className="small text-brand font-medium" style={{ marginTop: 2 }}>
              {displaySubtitle}
            </div>
          )}

          {profile?.area && (
            <div className="tiny muted" style={{ marginTop: 3 }}>
              📍 {profile.area}
              {profile.distanceKm !== undefined && ` • ${profile.distanceKm.toFixed(1)} km`}
            </div>
          )}

          {/* Rating pill */}
          {!loading && profile && (
            <div
              className="row center gap-4"
              style={{
                marginTop: 8,
                background: "var(--ink-50)",
                border: "1px solid var(--line)",
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <Star size={13} fill="var(--amber-500)" color="var(--amber-500)" />
              {profile.ratingCount > 0 ? (
                <>
                  {profile.ratingAvg.toFixed(1)}{" "}
                  <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>
                    ({profile.ratingCount})
                  </span>
                </>
              ) : (
                <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>New {type.toLowerCase()}</span>
              )}
              {profile.memberSince && (
                <>
                  <span style={{ color: "var(--ink-300)" }}>•</span>
                  <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>
                    Since {profile.memberSince}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Verified badges */}
          {profile && profile.verifications.length > 0 && (
            <div className="row center gap-6" style={{ marginTop: 8, flexWrap: "wrap" }}>
              {profile.verifications.map((v) => (
                <span
                  key={v}
                  className="row gap-4"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--green-600)",
                    background: "var(--green-50)",
                    border: "1px solid var(--green-200)",
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  <BadgeCheck size={11} />
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Skeleton while loading ── */}
        {loading && !profile && (
          <div className="col gap-8" style={{ marginBottom: 20 }}>
            <div
              style={{
                height: 14,
                borderRadius: 8,
                background: "var(--ink-100)",
                width: "55%",
                margin: "0 auto",
                animation: "pulse 1.4s ease-in-out infinite",
              }}
            />
            <div
              style={{
                height: 14,
                borderRadius: 8,
                background: "var(--ink-100)",
                width: "40%",
                margin: "0 auto",
                animation: "pulse 1.4s ease-in-out infinite",
              }}
            />
          </div>
        )}

        {/* ── Action buttons ── */}
        {!isSelf && (
          <div className="col gap-10">
            <div className="row gap-10">
              {/* Follow / Unfollow */}
              <button
                className={`btn btn-sm grow row center gap-6 ${following ? "btn-outline" : ""}`}
                style={
                  following
                    ? { borderColor: "var(--brand-300)", color: "var(--brand-600)" }
                    : {
                        background: "var(--brand-600)",
                        color: "#fff",
                      }
                }
                onClick={() => toggleFollow(type, id, displayName)}
              >
                {following ? (
                  <>
                    <UserCheck size={15} /> Following
                  </>
                ) : (
                  <>
                    <UserPlus size={15} /> Follow
                  </>
                )}
              </button>

              {/* Message */}
              <button
                className="btn btn-outline btn-sm grow row center gap-6"
                onClick={handleChat}
                disabled={chatting}
              >
                <MessageSquareText size={15} />
                {chatting ? "Opening…" : "Message"}
              </button>
            </div>

            {/* View full profile */}
            <button
              className="btn btn-outline btn-sm row center gap-6"
              style={{ width: "100%" }}
              onClick={handleViewFull}
            >
              <ExternalLink size={14} />
              View full details
            </button>
          </div>
        )}

        {isSelf && (
          <button
            className="btn btn-outline btn-sm row center gap-6"
            style={{ width: "100%" }}
            onClick={handleViewFull}
          >
            <ExternalLink size={14} />
            View my listing/profile
          </button>
        )}
      </div>
    </div>
  );
}
