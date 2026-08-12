import { useNavigate } from "react-router-dom";
import { Eye, Camera, UserCircle, ChevronRight } from "@/components/Icons";
import { useApp } from "@/store";

/** Quick actions for your own avatar — tap to view the photo full-screen,
 *  jump to changing it, or open your public profile. Snapchat-style tap
 *  affordance on an avatar that used to be purely decorative. */
export default function AvatarActionSheet({
  onClose,
  onViewPhoto,
}: {
  onClose: () => void;
  onViewPhoto: () => void;
}) {
  const nav = useNavigate();
  const { user } = useApp();

  const rows: { icon: React.ReactNode; label: string; onClick: () => void }[] = [
    { icon: <Eye size={19} />, label: "View photo", onClick: onViewPhoto },
    { icon: <Camera size={19} />, label: "Change photo", onClick: () => { onClose(); nav("/profile/edit"); } },
    { icon: <UserCircle size={19} />, label: "View public profile", onClick: () => { onClose(); nav(`/u/${user.id}`); } },
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 className="bold h2" style={{ marginBottom: 14 }}>Profile photo</h3>
        <div className="col gap-8">
          {rows.map((r) => (
            <button key={r.label} className="pf-row" onClick={r.onClick}>
              <span className="pf-row-icon">{r.icon}</span>
              <span className="semi grow" style={{ fontSize: 14 }}>{r.label}</span>
              <ChevronRight size={18} color="var(--ink-300)" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
