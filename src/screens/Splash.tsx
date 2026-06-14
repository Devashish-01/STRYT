import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Store, Sparkles } from "lucide-react";
import { useApp } from "@/store";

export default function Splash() {
  const nav = useNavigate();
  const { isAuthed } = useApp();

  useEffect(() => {
    if (isAuthed) nav("/home", { replace: true });
  }, [isAuthed, nav]);
  return (
    <div
      className="screen"
      style={{
        background: "linear-gradient(160deg, #6b21cc 0%, #4c1d95 60%, #2e1065 100%)",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* glow blobs */}
      <div style={blob("#a575fb", -60, -40, 220)} />
      <div style={blob("#ff8400", 240, 120, 180)} />

      <div className="screen-scroll" style={{ display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
        <div className="page-pad" style={{ paddingTop: 64, flex: 1 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "rgba(255,255,255,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.25)",
            }}
          >
            <svg width="34" height="34" viewBox="0 0 64 64">
              <path d="M18 46V18l28 28V18" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>

          <h1 style={{ fontSize: 44, fontWeight: 800, marginTop: 28, letterSpacing: -1 }}>Naya</h1>
          <p style={{ fontSize: 18, opacity: 0.92, marginTop: 6, fontWeight: 500, lineHeight: 1.4 }}>
            Your neighborhood, in one app.
          </p>
          <p style={{ opacity: 0.7, marginTop: 8, lineHeight: 1.5 }}>
            Discover what's around you, offer what you do, and ask for what you need.
          </p>

          <div className="col gap-12" style={{ marginTop: 40 }}>
            <Feature icon={<Store size={20} />} title="Discover local businesses" text="See what just opened near you" />
            <Feature icon={<Sparkles size={20} />} title="Find trusted providers" text="Plumbers, tutors, makeup artists & more" />
            <Feature icon={<MapPin size={20} />} title="Ask the neighborhood" text="Post a need, get offers nearby" />
          </div>
        </div>

        <div className="page-pad col gap-10" style={{ paddingBottom: 32 }}>
          <button className="btn btn-block" style={{ background: "#fff", color: "#4c1d95" }} onClick={() => nav("/auth/phone")}>
            Get started
          </button>
          <p className="tiny" style={{ textAlign: "center", opacity: 0.7 }}>
            By continuing you agree to our Terms & Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="row gap-12">
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "rgba(255,255,255,0.14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ opacity: 0.7, fontSize: 13 }}>{text}</div>
      </div>
    </div>
  );
}

function blob(color: string, top: number, left: number, size: number): React.CSSProperties {
  return {
    position: "absolute",
    top,
    left,
    width: size,
    height: size,
    background: color,
    borderRadius: "50%",
    filter: "blur(70px)",
    opacity: 0.5,
  };
}
