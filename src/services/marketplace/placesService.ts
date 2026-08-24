import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";
import type { Place } from "@/types";

// Staff-curated (or user-suggested) points of interest. request() is the
// customer path — always lands PENDING, needs admin approval (adminService
// picks these up the same way it already does businesses/providers).
// createAsAdmin() is the same shape but inserts ACTIVE directly, which RLS
// only allows when the caller is actually an admin (insert_places policy).
export const placesService = {
  async request(data: Partial<Place>): Promise<Place> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Sign in to suggest a place");
    const row = { ...toSnake(data), submitted_by_user_id: uid, status: "PENDING" } as Record<string, unknown>;
    const { data: created, error } = await sb.from("places").insert(row as any).select().maybeSingle();
    throwIfError(error);
    return toCamel<Place>(created);
  },

  async createAsAdmin(data: Partial<Place>): Promise<Place> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Sign in first");
    const row = { ...toSnake(data), submitted_by_user_id: uid, status: "ACTIVE" } as Record<string, unknown>;
    const { data: created, error } = await sb.from("places").insert(row as any).select().maybeSingle();
    throwIfError(error);
    return toCamel<Place>(created);
  },

  async get(id: string): Promise<Place | undefined> {
    const sb = getSupabase();
    const { data, error } = await sb.from("places").select("*").eq("id", id).maybeSingle();
    throwIfError(error);
    return data ? toCamel<Place>(data) : undefined;
  },

  async update(id: string, patch: Partial<Place>): Promise<Place> {
    const sb = getSupabase();
    const { data, error } = await sb.from("places").update(toSnake(patch)).eq("id", id).select().maybeSingle();
    throwIfError(error);
    if (!data) throw new Error("Couldn't save — you may not have permission to change this.");
    return toCamel<Place>(data);
  },
};
