import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import VerificationPanel from "@/components/VerificationPanel";

export default function VerificationCenter() {
  const { id } = useParams();
  if (!id) return null;
  return (
    <div className="screen">
      <AppBar title="Verification" />
      <VerificationPanel entityType="BUSINESS" entityId={id} />
    </div>
  );
}
