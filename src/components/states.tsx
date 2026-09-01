import type { ApiError } from "@/lib/apiClient";
import { EmptyState } from "./common";
import { NetworkErrorIllustration } from "./illustrations";

export function Skeleton({ h = 16, w = "100%", r = 8, mb = 0 }: { h?: number; w?: number | string; r?: number; mb?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, marginBottom: mb }} />;
}

export function CardSkeleton() {
  return (
    <div className="card card-condensed">
      <Skeleton h={140} r={14} mb={10} />
      <Skeleton h={16} w="70%" mb={8} />
      <Skeleton h={12} w="45%" />
    </div>
  );
}

export function BusinessCardSkeleton() {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row gap-12" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Skeleton h={72} w={72} r={16} />
        <div className="grow col gap-6" style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div className="row between" style={{ display: "flex", justifyContent: "space-between" }}>
            <Skeleton h={15} w="55%" />
            <Skeleton h={15} w="15%" />
          </div>
          <Skeleton h={11} w="40%" />
          <div className="row gap-8" style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <Skeleton h={11} w="20%" />
            <Skeleton h={11} w="15%" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProviderCardSkeleton() {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row gap-12" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Skeleton h={64} w={64} r={32} />
        <div className="grow col gap-6" style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div className="row between" style={{ display: "flex", justifyContent: "space-between" }}>
            <Skeleton h={15} w="50%" />
            <Skeleton h={15} w="10%" />
          </div>
          <Skeleton h={11} w="45%" />
          <div className="row gap-8" style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <Skeleton h={11} w="20%" />
            <Skeleton h={11} w="20%" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RequestCardSkeleton() {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row gap-10" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Skeleton h={40} w={40} r={20} />
        <div className="grow col gap-6" style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row between" style={{ display: "flex", justifyContent: "space-between" }}>
            <Skeleton h={14} w="40%" />
            <Skeleton h={12} w="20%" />
          </div>
          <Skeleton h={12} w="30%" />
        </div>
      </div>
      <div className="row gap-8" style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-start" }}>
        <div className="grow col gap-8" style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="row gap-6" style={{ display: "flex", gap: 6 }}>
            <Skeleton h={18} w={50} r={6} />
            <Skeleton h={18} w={60} r={6} />
          </div>
          <Skeleton h={16} w="80%" />
          <Skeleton h={12} w="100%" />
        </div>
        <Skeleton h={64} w={64} r={12} />
      </div>
    </div>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="card community-card-squircle">
      <div className="row gap-10" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Skeleton h={36} w={36} r={18} />
        <div className="grow col gap-6" style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton h={13} w="35%" />
          <Skeleton h={11} w="25%" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Skeleton h={13} w="100%" mb={6} />
        <Skeleton h={13} w="90%" mb={6} />
        <Skeleton h={13} w="60%" />
      </div>
    </div>
  );
}

export function AppointmentCardSkeleton() {
  return (
    <div className="card col gap-10" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
      <div className="row between center-v" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="col gap-6" style={{ display: "flex", flexDirection: "column", gap: 6, width: "60%" }}>
          <Skeleton h={14} w="80%" />
          <Skeleton h={11} w="60%" />
        </div>
        <Skeleton h={20} w="25%" r={10} />
      </div>
      <Skeleton h={12} w="40%" />
      <Skeleton h={12} w="100%" />
    </div>
  );
}

export function ExploreSkeleton({ tab = "all" }: { tab?: "all" | "business" | "provider" }) {
  return (
    <div className="col gap-14 page-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {tab === "business" && Array.from({ length: 3 }).map((_, i) => <BusinessCardSkeleton key={i} />)}
      {tab === "provider" && Array.from({ length: 3 }).map((_, i) => <ProviderCardSkeleton key={i} />)}
      {tab === "all" && (
        <>
          <BusinessCardSkeleton />
          <ProviderCardSkeleton />
          <BusinessCardSkeleton />
        </>
      )}
    </div>
  );
}

export function ListSkeleton({ count = 4, type = "card" }: { count?: number; type?: "card" | "business" | "provider" | "request" | "appointment" | "post" }) {
  const renderItem = (key: number) => {
    switch (type) {
      case "business":
        return <BusinessCardSkeleton key={key} />;
      case "provider":
        return <ProviderCardSkeleton key={key} />;
      case "request":
        return <RequestCardSkeleton key={key} />;
      case "appointment":
        return <AppointmentCardSkeleton key={key} />;
      case "post":
        return <PostCardSkeleton key={key} />;
      case "card":
      default:
        return <CardSkeleton key={key} />;
    }
  };

  return (
    <div className="col gap-14 page-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => renderItem(i))}
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="card row gap-12" style={{ padding: 12 }}>
      <Skeleton h={48} w={48} r={12} />
      <div className="grow col gap-8">
        <Skeleton h={14} w="60%" />
        <Skeleton h={11} w="40%" />
      </div>
    </div>
  );
}

export function ErrorView({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <EmptyState
      illustration={error.code === "NETWORK" ? <NetworkErrorIllustration /> : undefined}
      emoji={error.code === "NETWORK" ? "📡" : "⚠️"}
      title={error.code === "NETWORK" ? "Connection lost" : "Couldn't load this"}
      text={error.message}
      action={onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>Try again</button>}
    />
  );
}
