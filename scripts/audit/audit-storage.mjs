import { executeSql } from "../../scratch/query_db.mjs";

async function auditStorage() {
  const bucketsSql = `
    SELECT id, name, public, avif_autodetection, file_size_limit, allowed_mime_types, created_at, updated_at
    FROM storage.buckets
    ORDER BY name;
  `;

  const policiesSql = `
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
    ORDER BY tablename, policyname;
  `;

  console.log("=== STORAGE BUCKETS ===");
  const buckets = await executeSql(bucketsSql);
  console.log(JSON.stringify(buckets, null, 2));

  console.log("\n=== STORAGE POLICIES ===");
  const policies = await executeSql(policiesSql);
  console.log(JSON.stringify(policies, null, 2));
}

auditStorage().catch(console.error);
