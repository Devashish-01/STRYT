import io, os, re
snap = io.open("supabase/snapshots/2026-09-12_pre_reconcile.sql", encoding="utf-8").read()
d = "supabase/migrations"
migs = "\n".join(io.open(os.path.join(d,f), encoding="utf-8", errors="replace").read()
                 for f in sorted(os.listdir(d)) if f.endswith(".sql"))
pats = {"function": r"^CREATE OR REPLACE FUNCTION public\.(\w+)\(", "table": r"^CREATE TABLE public\.(\w+) \(",
        "index": r"^CREATE (?:UNIQUE )?INDEX (\w+) ON", "trigger": r"^CREATE TRIGGER (\w+) ",
        "policy": r'^CREATE POLICY ("?[^"\n]+?"?) ON public\.\w+ '}
for kind, p in pats.items():
    live = sorted(set(re.findall(p, snap, re.M)))
    gaps = [n for n in live if not re.search(r"\b" + re.escape(n.strip('"')) + r"\b", migs)]
    print(f"{kind:9} live={len(live):4} missing from repo={len(gaps)}")
    if gaps and kind in ("function", "trigger"):
        print(f"  missing {kind}: {gaps}")
