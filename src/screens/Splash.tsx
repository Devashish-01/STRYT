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
        background: "linear-gradient(160deg, #8b47f5 0%, #7c3aed 55%, #4c1d95 100%)",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* glow blobs */}
      <div style={blob("#c084fc", -60, -40, 220)} />
      <div style={blob("#ff9500", 240, 120, 180)} />

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
            <svg width="40" height="40" viewBox="0 0 64 64">
              <path d="M32 11 C21.5 11 13 19.5 13 30 C13 43 32 56 32 56 C32 56 51 43 51 30 C51 19.5 42.5 11 32 11 Z" fill="#fff" />
              <path d="M32 41 C24 35 40 24 32 17" stroke="#7c3aed" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M32 41 C24 35 40 24 32 17" stroke="#ffb020" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeDasharray="0.5 3.8" />
            </svg>
          </div>

          <h1 style={{ fontSize: 46, fontWeight: 800, marginTop: 28, letterSpacing: 1 }}>STRYT</h1>
          <p style={{ fontSize: 18, opacity: 0.92, marginTop: 6, fontWeight: 500, lineHeight: 1.4 }}>
            Your street. Your people.
          </p>
          <p style={{ opacity: 0.7, marginTop: 8, lineHeight: 1.5 }}>
            Discover what's on your street, offer what you do, and ask for what you need.
          </p>

          <div className="col gap-12" style={{ marginTop: 40 }}>
            <Feature icon={<Store size={20} />} title="Discover local spots" text="See what just opened on your street" />
            <Feature icon={<Sparkles size={20} />} title="Find trusted people" text="Plumbers, tutors, makeup artists & more" />
            <Feature icon={<MapPin size={20} />} title="Ask your street" text="Post a need, get offers nearby" />
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
