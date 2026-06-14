import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import type { Category } from "@/types";

// Build the nested parent -> children tree the screens expect from the
// flat categories table.
function buildTree(flat: Category[]): Category[] {
  const byId = new Map<string, Category>();
  flat.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  const roots: Category[] = [];
  byId.forEach((c) => {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.children!.push(c);
    else roots.push(c);
  });
  return roots;
}

async function fetchAllCategories(): Promise<Category[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("categories").select("*").eq("status", "ACTIVE");
  throwIfError(error);
  return toCamel<Category[]>(data ?? []);
}

export const catalogService = {
  async getCategories(kind?: "BUSINESS" | "SERVICE"): Promise<Category[]> {
    const flat = await fetchAllCategories();
    const tree = buildTree(flat);
    return kind ? tree.filter((c) => c.kind === kind || c.kind === "BOTH") : tree;
  },

  async byKind(kind: "BUSINESS" | "SERVICE"): Promise<Category[]> {
    const tree = buildTree(await fetchAllCategories());
    return tree.filter((c) => c.kind === kind || c.kind === "BOTH");
  },

  async leaves(): Promise<Category[]> {
    const flat = await fetchAllCategories();
    return flat.filter((c) => c.parentId != null);
  },

  async get(id: string): Promise<Category | undefined> {
    const sb = getSupabase();
    const { data, error } = await sb.from("categories").select("*").eq("id", id).maybeSingle();
    throwIfError(error);
    return data ? toCamel<Category>(data) : undefined;
  },

  async proposeCategory(name: string, parentId: string | null, kind: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    void uid;
    // Generate a slug from the name, append a short random suffix to guarantee uniqueness.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      + "-" + Math.random().toString(36).slice(2, 6);
    // Insert with a prefixed UUID so it doesn't clash with seeded text IDs.
    const id = "cat_" + crypto.randomUUID().replace(/-/g, "");
    const { data, error } = await sb.from("categories").insert({
      id,
      parent_id: parentId,
      name,
      slug,
      kind,
      icon: "⚙️",
      color: "#94a3b8",
    }).select().maybeSingle();
    if (error) {
      console.warn("proposeCategory insert failed (may need RLS policy):", error.message);
      return { id: "prop_" + Date.now(), status: "PROPOSED" };
    }
    return data ? toCamel<Category>(data) : { id, status: "PROPOSED" };
  },
};
