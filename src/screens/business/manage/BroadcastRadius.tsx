import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Skeleton, ErrorView } from "@/components/states";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import RadiusSelector from "@/components/RadiusSelector";
import { Loader } from "@/components/Icons";

// Dedicated editor for the business's service radius — how far bookings,
// community posts, and stories reach nearby customers (not general discovery).
export default function BroadcastRadius() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast } = useApp();
  const { data: b, loading, error, refetch } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  const [radius, setRadius] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (b) setRadius(b.broadcastRadius ?? 5);
  }, [b]);

  async function save() {
    setSaving(true);
    try {
      await businessService.update(id, { broadcastRadius: radius });
      showToast("Service radius updated");
      nav(-1);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't save service radius");
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="Service radius" onBack={() => nav(-1)} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 40 }}>
        {loading ? (
          <Skeleton h={140} mb={0} />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : (
          <>
            <p className="small muted" style={{ lineHeight: 1.55 }}>
              Choose how far you&apos;ll take bookings from, and how far your community posts and stories reach nearby customers. It no longer limits how far away customers can find your shop in Explore or Search.
            </p>
            <RadiusSelector
              value={radius}
              onChange={setRadius}
              label="Service radius"
              description="Customers within this distance can book you, and see your posts and stories."
            />
            <button
              className="btn btn-primary btn-block row center gap-8"
              onClick={save}
              disabled={saving}
              style={{ padding: 15, fontWeight: 700 }}
            >
              {saving ? (
                <><Loader className="spin" size={18} /> Saving…</>
              ) : (
                "Save"
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
