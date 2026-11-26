import type { ReactNode } from "react";

/** Visual slots shared by console headers. Each console supplies its own actions and theme. */
export default function ConsoleHeader({ background, backdrop, brand, primary, identity, actions }: {
  background: string;
  backdrop?: ReactNode;
  brand: ReactNode;
  primary: ReactNode;
  identity: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="living-sky-header console-header" style={{ background }}>
      {backdrop && <div className="console-header-backdrop" aria-hidden="true">{backdrop}</div>}
      <div className="console-header-content">
        <div className="console-header-top">
          {brand}
          <div className="console-header-primary">{primary}</div>
        </div>
        <div className="console-header-identity">{identity}</div>
        {actions && <div className="console-header-actions">{actions}</div>}
      </div>
    </header>
  );
}
