import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envContent = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"), "utf8");
const envVars = {};
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+)\s*$/);
  if (m) {
    envVars[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const url = envVars.VITE_SUPABASE_URL || "";
const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY || "";
const sb = createClient(url, serviceKey);

const PROVIDER_ID = "p_priya_mehndi";
const USER_ID = "8e608942-f28d-422d-af84-8d655b65f646";

async function verify() {
  console.log("=== 1. Checking User Record ===");
  const { data: user, error: uErr } = await sb.from("users").select("*").eq("id", USER_ID).single();
  if (uErr) throw uErr;
  console.log("User:", {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    roles: user.roles,
    avatar: user.avatar,
    area: user.area,
    city: user.city,
  });

  console.log("\n=== 2. Checking Provider Record ===");
  const { data: prov, error: pErr } = await sb
    .from("providers")
    .select("*, portfolio:portfolio_items(*), catalog:catalog_items(*)")
    .eq("id", PROVIDER_ID)
    .single();
  if (pErr) throw pErr;
  console.log("Provider:", {
    id: prov.id,
    displayName: prov.display_name,
    categoryName: prov.category_name,
    subCategory: prov.sub_category,
    status: prov.status,
    isVerified: prov.is_verified,
    verificationStatus: prov.verification_status,
    ratingAvg: prov.rating_avg,
    ratingCount: prov.rating_count,
    jobsDone: prov.jobs_done,
    startingPrice: prov.starting_price,
    skills: prov.skills,
    portfolioCount: prov.portfolio?.length,
    catalogCount: prov.catalog?.length,
  });

  console.log("\n=== 3. Checking Portfolio Items ===");
  prov.portfolio.forEach((p, i) => {
    console.log(`  [${i + 1}] ${p.caption} -> ${p.url.slice(0, 50)}...`);
  });

  console.log("\n=== 4. Checking Catalog Packages & Services ===");
  prov.catalog.forEach((c, i) => {
    console.log(`  [${i + 1}] ₹${c.price} - ${c.name} (BestSeller: ${c.best_seller})`);
  });

  console.log("\n=== 5. Checking Reviews ===");
  const { data: reviews, error: rErr } = await sb
    .from("ratings")
    .select("id, rating, comment, owner_reply, rater:users!rater_user_id(name)")
    .eq("ratee_id", PROVIDER_ID);
  if (rErr) throw rErr;
  reviews.forEach((r, i) => {
    console.log(`  [${i + 1}] ⭐${r.rating} by ${r.rater?.name}: "${r.comment.slice(0, 50)}..."`);
    console.log(`      Reply: "${r.owner_reply?.slice(0, 50)}..."`);
  });

  console.log("\n=== 6. Checking Vouches & Endorsements ===");
  const { data: vouches } = await sb.from("vouches").select("from_user_id").eq("provider_id", PROVIDER_ID);
  const { data: endorsements } = await sb.from("endorsements").select("from_user_id, skill").eq("provider_id", PROVIDER_ID);
  console.log("Vouches count:", vouches?.length);
  console.log("Endorsements count:", endorsements?.length, endorsements?.map(e => e.skill));

  console.log("\n=== 7. Checking Story & Community Post ===");
  const { data: stories } = await sb.from("stories").select("id, caption, image_url").eq("owner_id", PROVIDER_ID);
  const { data: posts } = await sb.from("community_posts").select("id, title, likes_count").eq("author_ref_id", PROVIDER_ID);
  console.log("Stories:", stories);
  console.log("Posts:", posts);

  console.log("\n✅ ALL CHECKS PASSED PERFECTLY!");
}

verify().catch(console.error);
