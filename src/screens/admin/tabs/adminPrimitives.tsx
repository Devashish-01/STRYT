

export function Stat({ label, value }: { label: string; value: string }) {
  return <div className="grow col center" style={{ gap: 2 }}><span className="bold">{value}</span><span className="tiny muted">{label}</span></div>;
}
export function Sep() { return <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />; }
