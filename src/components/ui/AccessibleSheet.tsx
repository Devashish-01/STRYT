import React, { useEffect, useId, useRef } from "react";

export interface AccessibleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  variant?: "bottom-sheet" | "dialog";
  role?: "dialog" | "alertdialog";
  maxWidth?: number | string;
  className?: string;
  style?: React.CSSProperties;
  showGrab?: boolean;
}

export function AccessibleSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  variant = "bottom-sheet",
  role = "dialog",
  maxWidth,
  className = "",
  style,
  showGrab = true,
}: AccessibleSheetProps) {
  const titleId = useId();
  const descId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const prevFocusedElement = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    prevFocusedElement.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // A confirmation dialog can be opened inside a sheet. Only the topmost
      // dialog should handle keyboard input, especially Escape.
      const openDialogs = document.querySelectorAll('[aria-modal="true"]');
      if (openDialogs[openDialogs.length - 1] !== sheetRef.current) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []).filter((element) => element.getClientRects().length > 0);
        if (focusable.length === 0) {
          e.preventDefault();
          sheetRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || !sheetRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !sheetRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Initial focus into sheet or first focusable element
    const timer = setTimeout(() => {
      if (!sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.getClientRects().length > 0);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        sheetRef.current.focus();
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      if (prevFocusedElement.current?.isConnected) {
        prevFocusedElement.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isDialog = variant === "dialog";

  return (
    <div
      className="overlay"
      data-back-close="true"
      onClick={onClose}
      style={{
        zIndex: 1000,
        alignItems: isDialog ? "center" : "flex-end",
      }}
    >
      <div
        ref={sheetRef}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={isDialog ? `card modal-dialog ${className}` : `sheet ${className}`}
        style={{
          width: "100%",
          maxWidth: maxWidth || (isDialog ? 440 : "var(--maxw)"),
          maxHeight: isDialog ? "90vh" : "88vh",
          overflowY: "auto",
          ...(isDialog
            ? {
                background: "var(--surface)",
                borderRadius: 24,
                padding: "20px 20px calc(20px + var(--safe-area-bottom))",
                margin: "auto 16px",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-lg)",
                animation: "scaleUp .18s cubic-bezier(0.16, 1, 0.3, 1)",
              }
            : undefined),
          ...style,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isDialog && showGrab && <div className="sheet-grab" />}
        {title && (
          <div style={{ marginBottom: description ? 4 : 12 }}>
            <h2 id={titleId} className="bold h3" style={{ margin: 0, color: "var(--ink-900)" }}>
              {title}
            </h2>
            {description && (
              <p id={descId} className="small muted" style={{ margin: "4px 0 0" }}>
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default AccessibleSheet;
