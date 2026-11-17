import React from "react";
import AccessibleSheet from "./AccessibleSheet";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    if (busy) return;
    await onConfirm();
  };

  return (
    <AccessibleSheet
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      variant="dialog"
      role="alertdialog"
      title={title}
      description={description}
      maxWidth={400}
    >
      <div className="row gap-10" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          disabled={busy}
          style={{ minHeight: 44, padding: "0 18px" }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${destructive ? "btn-danger" : "btn-primary"}`}
          onClick={handleConfirm}
          disabled={busy}
          style={{
            minHeight: 44,
            padding: "0 18px",
            ...(destructive ? { background: "var(--red-600)", color: "var(--white)" } : {}),
          }}
        >
          {busy ? "..." : confirmLabel}
        </button>
      </div>
    </AccessibleSheet>
  );
}

export default ConfirmDialog;
