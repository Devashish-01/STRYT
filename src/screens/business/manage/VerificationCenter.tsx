import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { BadgeCheck, ShieldCheck, Camera, Clock } from "lucide-react";
import { useApp } from "@/store";
import { businessService, uploadService } from "@/services";
import type { Business } from "@/types";

export default function VerificationCenter() {
  const { id } = useParams();
  const { showToast } = useApp();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"VERIFIED" | "PENDING" | "NONE">("NONE");
  const [docType, setDocType] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    businessService.get(id).then((b) => {
      if (b) {
        setBusiness(b);
        if (b.isVerified) setStatus("VERIFIED");
        else if (b.verificationStatus === "UNDER_REVIEW") setStatus("PENDING");
        else setStatus("NONE");
      }
      setLoading(false);
    });
  }, [id]);

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadService.upload(file, "verification");
      if (id) {
        await businessService.submitVerification(id, url);
        setStatus("PENDING");
        showToast("Document uploaded — under review");
      }
    } catch (err: any) {
      showToast(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
      setDocType(null);
    }
  };

  const tiers = [
    { key: "phone", label: "Phone", done: true },
    { key: "business", label: "Business doc", done: status === "VERIFIED" || status === "PENDING" },
    { key: "address", label: "Address", done: false },
    { key: "gst", label: "GST", done: false },
  ];

  if (loading) {
    return (
      <div className="screen">
        <AppBar title="Verification" />
        <div className="screen-scroll page-pad col center" style={{ paddingTop: 80 }}>
          <div className="muted small">Loading verification status...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Verification" />
      
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: "none" }}
        accept="image/*,application/pdf"
      />

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 30 }}>
        <div className="card col center" style={{ padding: 18, gap: 6, background: status === "VERIFIED" ? "#e8f7ee" : "var(--brand-50)", border: "none" }}>
          {status === "VERIFIED" ? <BadgeCheck size={42} color="var(--green-500)" /> : <Clock size={42} color="#cc4415" />}
          <div className="bold">{status === "VERIFIED" ? "Verified business" : status === "PENDING" ? "Under review" : "Not verified"}</div>
          <p className="tiny muted center" style={{ textAlign: "center" }}>
            {status === "VERIFIED" ? "Your blue tick is live on your public page." : "We review documents within ~24h."}
          </p>
        </div>

        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><ShieldCheck size={14} /> Verification tiers</div>
          <div className="card">
            {tiers.map((t, i) => (
              <div key={t.key} className="row between" style={{ padding: "13px 14px", borderBottom: i < tiers.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span className="semi small">{t.label}</span>
                {t.done ? (
                  <span className="badge badge-green">
                    <BadgeCheck size={11} /> {status === "PENDING" && t.key === "business" ? "Under review" : "Verified"}
                  </span>
                ) : (
                  <button className="tiny semi" style={{ color: "var(--brand-700)" }} onClick={() => setDocType(t.key)}>Verify</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {docType && (
          <button 
            className="col center" 
            style={{ width: "100%", padding: 22, borderRadius: 14, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 6 }} 
            onClick={triggerFileSelect}
            disabled={isUploading}
          >
            <Camera size={26} />
            <span className="small semi">
              {isUploading ? "Uploading..." : `Upload document for ${docType}`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
