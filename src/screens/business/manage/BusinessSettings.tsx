import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { UserPlus, Crown, Power, Bell } from "lucide-react";
import { useApp } from "@/store";
import { copyText } from "@/lib/clipboard";
import type { TeamMember } from "@/types";
import ManageNav from "./ManageNav";

export default function BusinessSettings() {
  const { id = "b1" } = useParams();
  const nav = useNavigate();
  const { showToast, setContext } = useApp();
  const { data: team } = useQuery<TeamMember[]>(() => businessService.team(id) as any, [id]);
  const [leads, setLeads] = useState(true);
  const [reviewsN, setReviewsN] = useState(true);
  const [requests, setRequests] = useState(true);

  return (
    <div className="screen with-nav">
      <AppBar title="Business settings" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 20 }}>
        {/* Notifications */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Bell size={14} /> Notifications</div>
          <div className="card">
            <Toggle label="New leads" on={leads} set={setLeads} />
            <Toggle label="New reviews" on={reviewsN} set={setReviewsN} />
            <Toggle label="Matching requests" on={requests} set={setRequests} last />
          </div>
        </div>

        {/* Team */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Team</div>
          <div className="card">
            {(team ?? []).map((m, i) => (
              <div key={m.id} className="row gap-12" style={{ padding: "12px 14px", borderBottom: i < (team!.length - 1) ? "1px solid var(--line)" : "none" }}>
                <SafeImg src={m.avatar} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
                <div className="grow"><div className="semi small">{m.name}</div><div className="tiny muted">{m.phone}</div></div>
                <span className={`badge ${m.role === "OWNER" ? "badge-purple" : "badge-gray"}`}>{m.role === "OWNER" && <Crown size={10} />} {m.role}</span>
              </div>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-block btn-sm"
            style={{ marginTop: 10 }}
            onClick={async () => {
              const link = `${window.location.origin}/business/${id}`;
              const ok = await copyText(link);
              showToast(ok ? "Invite link copied" : "Couldn't copy link");
            }}
          ><UserPlus size={16} /> Invite team member</button>
        </div>

        {/* Danger */}
        <div className="card" style={{ padding: 14 }}>
          <button
            className="row gap-10 semi small"
            style={{ color: "#dc2626" }}
            onClick={async () => {
              try {
                await businessService.update(id, { isOpenNow: false });
                showToast("Shop marked closed — update your hours to reopen");
              } catch { showToast("Couldn't update. Try again."); }
            }}
          >
            <Power size={18} /> Temporarily close shop
          </button>
        </div>

        <button className="btn btn-ghost btn-block" onClick={() => { setContext({ type: "customer", id: null, name: "Personal" }); nav("/home"); }}>
          Exit business mode
        </button>
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}

function Toggle({ label, on, set, last }: { label: string; on: boolean; set: (v: boolean) => void; last?: boolean }) {
  return (
    <div className="row between" style={{ padding: "13px 14px", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <span className="semi small">{label}</span>
      <button onClick={() => set(!on)} style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--brand-600)" : "var(--ink-200)", position: "relative" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </button>
    </div>
  );
}
