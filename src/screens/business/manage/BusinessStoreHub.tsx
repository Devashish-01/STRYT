import { useNavigate, useParams } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ErrorView, Skeleton } from "@/components/states";
import { ChevronRight, Clock, ExternalLink, FileText, Image, Store } from "@/components/Icons";
import ManageNav from "./ManageNav";

export default function BusinessStoreHub() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: business, loading } = useQuery(() => businessService.get(id), [id]);
  const base = `/business/${id}/manage`;

  if (!id) return <div className="screen"><AppBar title="Store" /><ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} /></div>;

  const sections = [
    { icon: <FileText size={20} color="var(--brand-600)" />, title: "Menu & catalog", text: "Services, prices, offers and stock", to: `${base}/catalog` },
    { icon: <Image size={20} color="var(--pink-500)" />, title: "Portfolio", text: "Show customers your best work", to: `${base}/portfolio` },
    { icon: <Clock size={20} color="var(--blue-500)" />, title: "Opening hours", text: "Keep availability and booking hours current", to: `${base}/hours` },
    { icon: <Store size={20} color="var(--orange-500)" />, title: "Business details", text: "Name, cover, contact and location", to: `${base}/profile` },
  ];

  return (
    <div className="screen with-nav">
      <AppBar title="Store" subtitle="Keep your customer-facing storefront current" />
      <div className="screen-scroll">
        <div className="page-pad col gap-14">
          {loading ? <Skeleton h={170} /> : (
            <button className="card" style={{ padding: 0, overflow: "hidden", textAlign: "left" }} onClick={() => nav(`/business/${id}`)}>
              <SafeImg src={business?.coverImage} variant="photo" style={{ width: "100%", height: 120, objectFit: "cover" }} />
              <div className="row gap-12 center-v" style={{ padding: 14 }}>
                <div className="grow"><div className="tiny semi" style={{ color: "var(--brand-700)", textTransform: "uppercase" }}>Public preview</div><div className="bold" style={{ marginTop: 2 }}>{business?.name ?? "Your business"}</div><div className="tiny muted">See exactly what customers see</div></div>
                <ExternalLink size={19} color="var(--brand-600)" />
              </div>
            </button>
          )}
          <div>
            <div className="small semi muted" style={{ marginBottom: 8 }}>Storefront</div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {sections.map((section, index) => (
                <button key={section.title} className="row gap-12 center-v" style={{ width: "100%", padding: "14px 16px", textAlign: "left", borderTop: index ? "1px solid var(--line)" : "none" }} onClick={() => nav(section.to)}>
                  <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ink-50)", display: "grid", placeItems: "center" }}>{section.icon}</span>
                  <div className="grow"><div className="semi small">{section.title}</div><div className="tiny muted">{section.text}</div></div>
                  <ChevronRight size={17} color="var(--ink-300)" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}
