import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { ErrorView } from "@/components/states";
import VerificationPanel from "@/components/VerificationPanel";

export default function VerificationCenter() {
  const { id } = useParams();
  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Verification" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  return (
    <div className="screen">
      <AppBar title="Verification" />
      <VerificationPanel entityType="BUSINESS" entityId={id} />
    </div>
  );
}
