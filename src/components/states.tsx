import type { ApiError } from "@/lib/apiClient";
import { EmptyState } from "./common";

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

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="col gap-14 page-pad">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
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
      emoji={error.code === "NETWORK" ? "📡" : "⚠️"}
      title={error.code === "NETWORK" ? "Connection lost" : "Couldn't load this"}
      text={error.message}
      action={onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>Try again</button>}
    />
  );
}
