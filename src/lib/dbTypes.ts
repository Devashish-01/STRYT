// Convenience helpers over the generated Supabase schema types.
// Usage:  const patch: TablesUpdate<"providers"> = {}; patch.display_name = name;
import type { Database } from "@/types/database.types";

type PublicSchema = Database["public"];

/** A full row of a public table. */
export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

/** The insert shape (columns optional/required per the schema) of a public table. */
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

/** The update shape (all columns optional) of a public table. */
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
