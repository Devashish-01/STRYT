import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import { config } from "@/config";
import type { Category, CategoryKind } from "@/types";

const MOCK_CATEGORIES: Category[] = [
  { id: "1", parentId: null, name: "Food & Drinks", slug: "food-drinks", kind: "BUSINESS", icon: "🍔", color: "#f87171" },
  { id: "2", parentId: null, name: "Home Services", slug: "home-services", kind: "SERVICE", icon: "🛠️", color: "#60a5fa" },
  { id: "3", parentId: null, name: "Salons & Wellness", slug: "salons-wellness", kind: "BOTH", icon: "💇", color: "#f472b6" },
  { id: "4", parentId: null, name: "Groceries", slug: "groceries", kind: "BUSINESS", icon: "🛒", color: "#34d399" },
  { id: "5", parentId: "1", name: "Restaurants", slug: "restaurants", kind: "BUSINESS", icon: "🍕", color: "#f87171" },
  { id: "6", parentId: "2", name: "Plumbers", slug: "plumbers", kind: "SERVICE", icon: "🚰", color: "#60a5fa" },
  { id: "7", parentId: "2", name: "Electricians", slug: "electricians", kind: "SERVICE", icon: "⚡", color: "#60a5fa" },
];

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
  if (config.useMocks) {
    return MOCK_CATEGORIES;
  }
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
    if (config.useMocks) {
      return MOCK_CATEGORIES.find((c) => c.id === id);
    }
    const sb = getSupabase();
    const { data, error } = await sb.from("categories").select("*").eq("id", id).maybeSingle();
    throwIfError(error);
    return data ? toCamel<Category>(data) : undefined;
  },

  async getCategoryCounts(): Promise<{ bizCounts: Record<string, number>; provCounts: Record<string, number> }> {
    if (config.useMocks) {
      return {
        bizCounts: { "1": 5, "4": 12, "5": 3 },
        provCounts: { "2": 8, "3": 4, "6": 2, "7": 3 },
      };
    }
    const sb = getSupabase();
    const [{ data: bizRows }, { data: provRows }] = await Promise.all([
      sb.from("businesses").select("category_id").eq("status", "ACTIVE"),
      sb.from("providers").select("category_id").eq("status", "ACTIVE"),
    ]);
    const tally = (rows: { category_id: string }[] | null) => {
      const c: Record<string, number> = {};
      for (const r of rows ?? []) if (r.category_id) c[r.category_id] = (c[r.category_id] ?? 0) + 1;
      return c;
    };
    return { bizCounts: tally(bizRows as any), provCounts: tally(provRows as any) };
  },

  async proposeCategory(name: string, parentId: string | null, kind: string) {
    if (config.useMocks) {
      return {
        id: "cat_mock_" + Date.now(),
        parentId,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        kind: kind as CategoryKind,
        icon: "⚙️",
        color: "#94a3b8",
        status: "PROPOSED",
      };
    }
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
