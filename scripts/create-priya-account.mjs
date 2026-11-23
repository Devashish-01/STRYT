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

const PRIYA_USER_ID = "8e608942-f28d-422d-af84-8d655b65f646";
const PROVIDER_ID = "p_priya_mehndi";

async function main() {
  console.log("=== STEP 1: Updating User Profile for Priya Nair ===");
  const userUpdate = {
    roles: ["customer", "provider"],
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
    email: "priyanair.mehndi@gmail.com",
    show_name_publicly: true,
    show_phone_publicly: true,
    show_email_publicly: true,
    location_public: true,
    area: "Amanora Park Town",
    city: "Pune",
  };
  const { data: updatedUser, error: uErr } = await sb
    .from("users")
    .update(userUpdate)
    .eq("id", PRIYA_USER_ID)
    .select()
    .single();
  if (uErr) {
    console.error("Error updating user:", uErr);
    throw uErr;
  }
  console.log("User updated successfully:", updatedUser.id, updatedUser.name, updatedUser.roles);

  console.log("=== STEP 2: Upserting Priya Nair into Providers ===");
  const availabilitySchedule = {
    v: 2,
    mode: "weekly",
    slotDurationMin: 60,
    days: {
      Mon: { open: true, ranges: [{ from: "09:00", to: "21:00" }] },
      Tue: { open: true, ranges: [{ from: "09:00", to: "21:00" }] },
      Wed: { open: true, ranges: [{ from: "09:00", to: "21:00" }] },
      Thu: { open: true, ranges: [{ from: "09:00", to: "21:00" }] },
      Fri: { open: true, ranges: [{ from: "09:00", to: "21:00" }] },
      Sat: { open: true, ranges: [{ from: "08:00", to: "22:00" }] },
      Sun: { open: true, ranges: [{ from: "08:00", to: "22:00" }] },
    },
  };

  const providerRow = {
    id: PROVIDER_ID,
    user_id: PRIYA_USER_ID,
    display_name: "Priya Nair — Bridal & Traditional Mehndi Artist",
    category_id: "c-events-mehndi",
    category_name: "Mehndi Artist",
    sub_category: "Bridal Mehndi • Arabic & Indo-Western • Baby Shower • Organic Henna",
    bio: "Professional bridal & celebrity mehndi artist with 7+ years of artistry across Pune & Mumbai. Specializing in bespoke bridal storytelling figures, royal Rajasthani marwadi designs, graceful Arabic florals, and contemporary Indo-Western henna art. Handcrafted 100% natural organic henna cones made fresh weekly using Sojat henna leaf, eucalyptus, and tea tree oil for a deep mahogany stain without any chemicals. Available for bridal packages, sangeet group bookings, baby showers, and festive occasions across Amanora, Magarpatta, Hadapsar, Koregaon Park, and all Pune venues. Home visits and on-venue bridal bookings accepted.",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
    lat: 18.5115207776089,
    lng: 73.9371184386574,
    service_radius_km: 25,
    starting_price: 500,
    availability_note: JSON.stringify(availabilitySchedule),
    status: "ACTIVE",
    is_verified: true,
    verification_status: "APPROVED",
    verification_reason: "Government ID, professional certification, and genuine bridal henna portfolio verified.",
    verification_reviewed_at: new Date().toISOString(),
    verification_reviewed_by: "system",
    rating_avg: 5.0,
    rating_count: 4,
    jobs_done: 138,
    response_time: "Within 15 minutes",
    is_new: false,
    skills: [
      "Bridal Mehndi",
      "Arabic Henna",
      "Rajasthani Traditional",
      "Indo-Western Design",
      "Couple Portrait Figure",
      "Baby Shower / Godh Bharai",
      "Engagement Mehndi",
      "Mandala Art",
      "Feet Mehndi",
      "Organic Henna Cones",
      "Sangeet Group Mehndi",
    ],
    phone: "+919222222222",
    email: "priyanair.mehndi@gmail.com",
    upi_id: "priya.nair@okhdfcbank",
    show_phone_publicly: true,
    show_email_publicly: true,
    location_public: true,
    payment_timing: "AT_APPOINTMENT",
    deposit_percent: 0,
    is_available_now: true,
    is_open_now: true,
    package_key: "events",
    bookings_enabled: true,
    owner_enabled: true,
    lead_credits: 50,
    view_count: 168,
  };

  const { data: upsertedProvider, error: pErr } = await sb
    .from("providers")
    .upsert(providerRow, { onConflict: "id" })
    .select()
    .single();
  if (pErr) {
    console.error("Error upserting provider:", pErr);
    throw pErr;
  }
  console.log("Provider upserted successfully:", upsertedProvider.id, upsertedProvider.display_name);

  console.log("=== STEP 3: Upserting Portfolio Items ===");
  await sb.from("portfolio_items").delete().eq("provider_id", PROVIDER_ID);

  const portfolioItems = [
    {
      id: "pp_priya_1",
      provider_id: PROVIDER_ID,
      url: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=75",
      caption: "Royal Bridal Storyboard with bespoke couple portraits and lotus motifs",
      sort_order: 0,
    },
    {
      id: "pp_priya_2",
      provider_id: PROVIDER_ID,
      url: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=800&q=75",
      caption: "Fine traditional Marwadi bridal mehndi on palms & forearms",
      sort_order: 1,
    },
    {
      id: "pp_priya_3",
      provider_id: PROVIDER_ID,
      url: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=75",
      caption: "Contemporary Indo-Arabic floral design with delicate shaded roses",
      sort_order: 2,
    },
    {
      id: "pp_priya_4",
      provider_id: PROVIDER_ID,
      url: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=75",
      caption: "Intricate bridal feet mehndi with payal anklet pattern",
      sort_order: 3,
    },
    {
      id: "pp_priya_5",
      provider_id: PROVIDER_ID,
      url: "https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=800&q=75",
      caption: "Baby shower / Godh Bharai cute cradle and blessings mandala",
      sort_order: 4,
    },
    {
      id: "pp_priya_6",
      provider_id: PROVIDER_ID,
      url: "https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=75",
      caption: "Deep mahogany natural stain after 48 hours using 100% organic henna",
      sort_order: 5,
    },
  ];

  const { data: insertedPortfolio, error: pfErr } = await sb
    .from("portfolio_items")
    .insert(portfolioItems)
    .select();
  if (pfErr) {
    console.error("Error inserting portfolio:", pfErr);
    throw pfErr;
  }
  console.log("Portfolio items inserted:", insertedPortfolio.length);

  console.log("=== STEP 4: Upserting Catalog Services & Packages ===");
  await sb.from("catalog_items").delete().eq("provider_id", PROVIDER_ID);

  const catalogItems = [
    {
      id: "ci_priya_1",
      provider_id: PROVIDER_ID,
      business_id: null,
      name: "Royal Bridal Storyboard Mehndi (Full Arms & Feet up to Knees)",
      description: "Bespoke bridal narration featuring customized couple portraits, baraat, doli, and Radha-Krishna artwork. Covers full arms on both sides and feet up to knees. Includes freshly brewed organic essential oil cones with guaranteed dark stain. Duration: 5–6 hours.",
      price: 8500,
      image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=75",
      stock_status: "IN_STOCK",
      best_seller: true,
      sort_order: 0,
      is_food: false,
      inventory_type: "INFINITE",
      slot_capacity: 1,
      max_party_size: 1,
    },
    {
      id: "ci_priya_2",
      provider_id: PROVIDER_ID,
      business_id: null,
      name: "Classic Traditional Bridal Package (Elbow Length & Feet)",
      description: "Intricate Rajasthani Marwadi style bridal mehndi up to elbows front and back, paired with matching feet design. Fine grid jali, dancing peacocks, and floral filler work. Duration: 3.5–4 hours.",
      price: 5500,
      image: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=75",
      stock_status: "IN_STOCK",
      best_seller: false,
      sort_order: 1,
      is_food: false,
      inventory_type: "INFINITE",
      slot_capacity: 1,
      max_party_size: 1,
    },
    {
      id: "ci_priya_3",
      provider_id: PROVIDER_ID,
      business_id: null,
      name: "Engagement & Sangeet Indo-Arabic Designer (Half Arms)",
      description: "Modern fusion of bold Arabic floral trails and intricate Indian jaal on both hands up to mid-forearm. Elegant, photogenic, and light. Duration: 2 hours.",
      price: 2500,
      image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=75",
      stock_status: "IN_STOCK",
      best_seller: true,
      sort_order: 2,
      is_food: false,
      inventory_type: "INFINITE",
      slot_capacity: 1,
      max_party_size: 1,
    },
    {
      id: "ci_priya_4",
      provider_id: PROVIDER_ID,
      business_id: null,
      name: "Baby Shower / Godh Bharai Special Henna",
      description: "Special celebratory mehndi featuring baby cradle motifs, tiny footprints, auspicious calligraphy (Mom-to-be), and protective mandala charms. Pure chemical-free organic cones safe for pregnancy. Duration: 1.5 hours.",
      price: 1800,
      image: "https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=600&q=75",
      stock_status: "IN_STOCK",
      best_seller: false,
      sort_order: 3,
      is_food: false,
      inventory_type: "INFINITE",
      slot_capacity: 1,
      max_party_size: 1,
    },
    {
      id: "ci_priya_5",
      provider_id: PROVIDER_ID,
      business_id: null,
      name: "Contemporary Arabic Floral (Palms & Back)",
      description: "Stylish quick-application Arabic floral vine extending from fingertips to wrists with shaded leaves and lace wrist cuffs. Perfect for festivals, guest wear, and celebrations. Duration: 40 mins.",
      price: 800,
      image: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=600&q=75",
      stock_status: "IN_STOCK",
      best_seller: false,
      sort_order: 4,
      is_food: false,
      inventory_type: "INFINITE",
      slot_capacity: 1,
      max_party_size: 1,
    },
    {
      id: "ci_priya_6",
      provider_id: PROVIDER_ID,
      business_id: null,
      name: "Intricate Bridal Feet & Payal Mehndi (Up to Mid-Calf)",
      description: "Exquisite bridal feet design featuring geometric jaal, payal (anklet) illusion, delicate toe detailing, and floral soles. Duration: 2 hours.",
      price: 2200,
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=75",
      stock_status: "IN_STOCK",
      best_seller: false,
      sort_order: 5,
      is_food: false,
      inventory_type: "INFINITE",
      slot_capacity: 1,
      max_party_size: 1,
    },
    {
      id: "ci_priya_7",
      provider_id: PROVIDER_ID,
      business_id: null,
      name: "Sangeet Party Guest Package (Up to 10 Guests)",
      description: "Dedicated artist service for Sangeet, Mehendi party, or Karwa Chauth gatherings. Covers front and back palm designs for up to 10 guests with speed and elegance. Duration: 2.5–3 hours.",
      price: 4500,
      image: "https://images.unsplash.com/photo-1532712938310-34cb3982ef74?auto=format&fit=crop&w=600&q=75",
      stock_status: "IN_STOCK",
      best_seller: false,
      sort_order: 6,
      is_food: false,
      inventory_type: "INFINITE",
      slot_capacity: 1,
      max_party_size: 10,
    },
    {
      id: "ci_priya_8",
      provider_id: PROVIDER_ID,
      business_id: null,
      name: "Fresh Homemade Organic Henna Cones (Pack of 5)",
      description: "100% natural, freshly prepared cones made from 5x filtered Sojat henna powder, Nilgiri eucalyptus oil, tea tree oil, and lemon sugar syrup. Dark mahogany stain guarantee. Free from chemical dyes, PPD, or preservatives.",
      price: 350,
      image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&q=75",
      stock_status: "IN_STOCK",
      best_seller: false,
      sort_order: 7,
      is_food: false,
      inventory_type: "INFINITE",
      slot_capacity: 1,
      max_party_size: 1,
    },
  ];

  const { data: insertedCatalog, error: cErr } = await sb
    .from("catalog_items")
    .insert(catalogItems)
    .select();
  if (cErr) {
    console.error("Error inserting catalog:", cErr);
    throw cErr;
  }
  console.log("Catalog items inserted:", insertedCatalog.length);

  console.log("=== STEP 5: Upserting Client Reviews & Ratings ===");
  await sb.from("ratings").delete().eq("ratee_id", PROVIDER_ID).eq("ratee_type", "PROVIDER");

  const ratings = [
    {
      id: "rv_priya_1",
      rater_user_id: "7ada1609-3eec-4532-b167-3e245dabc98c", // Anushka Patel
      ratee_type: "PROVIDER",
      ratee_id: PROVIDER_ID,
      rating: 5,
      comment: "Priya did my bridal mehndi for my wedding at Amanora. The detailing was out of this world! She drew our exact proposal moment in the figure work. And the color on the wedding day was pitch dark mahogany. Highly recommend her to every bride!",
      is_verified_booking: true,
      owner_reply: "Thank you so much Anushka! It was an absolute honor designing your bridal storyboard. Wishing you and your family immense joy and happiness!",
      owner_reply_at: "2026-11-18T14:20:00Z",
      created_at: "2026-11-17T11:00:00Z",
    },
    {
      id: "rv_priya_2",
      rater_user_id: "b0f894ce-c34c-4ea4-8eae-b9f3425fec5e", // Devashish
      ratee_type: "PROVIDER",
      ratee_id: PROVIDER_ID,
      rating: 5,
      comment: "Booked Priya for my sister's Sangeet evening in Amanora Park Town. She was punctual, super patient with all the relatives, and completed designs for 12 guests with incredible finesse. Cones smelled pure and organic.",
      is_verified_booking: true,
      owner_reply: "Thank you Devashish! Glad everyone loved their henna designs. Always a pleasure serving the community!",
      owner_reply_at: "2026-11-15T18:00:00Z",
      created_at: "2026-11-14T20:30:00Z",
    },
    {
      id: "rv_priya_3",
      rater_user_id: "cdcaf5d9-deb3-48c2-b543-387c4dd19ff2", // Rajesh Sharma
      ratee_type: "PROVIDER",
      ratee_id: PROVIDER_ID,
      rating: 5,
      comment: "We booked her for our daughter's engagement function. Beautiful contemporary Arabic and mandala patterns. Very clean work and punctual home visit.",
      is_verified_booking: true,
      owner_reply: "Thank you Rajesh ji! Warmest congratulations to the newly engaged couple!",
      owner_reply_at: "2026-11-10T12:00:00Z",
      created_at: "2026-11-09T16:00:00Z",
    },
    {
      id: "rv_priya_4",
      rater_user_id: "e49868f1-a268-45a3-b0b4-f2187a8744ab", // MOHIT BIRLA
      ratee_type: "PROVIDER",
      ratee_id: PROVIDER_ID,
      rating: 5,
      comment: "Exceptional artist! My wife loved the baby shower mehndi design with the cute cradle motif. Zero burning sensation, 100% natural cones. Truly professional.",
      is_verified_booking: true,
      owner_reply: "Thank you Mohit ji! Hearty congratulations and blessings to the growing family!",
      owner_reply_at: "2026-11-05T19:00:00Z",
      created_at: "2026-11-04T15:00:00Z",
    },
  ];

  const { data: insertedRatings, error: rErr } = await sb.from("ratings").insert(ratings).select();
  if (rErr) {
    console.error("Error inserting ratings:", rErr);
    throw rErr;
  }
  console.log("Ratings inserted:", insertedRatings.length);

  console.log("=== STEP 6: Upserting Vouches & Endorsements ===");
  await sb.from("vouches").delete().eq("provider_id", PROVIDER_ID);
  const vouches = [
    { from_user_id: "7ada1609-3eec-4532-b167-3e245dabc98c", provider_id: PROVIDER_ID },
    { from_user_id: "b0f894ce-c34c-4ea4-8eae-b9f3425fec5e", provider_id: PROVIDER_ID },
    { from_user_id: "cdcaf5d9-deb3-48c2-b543-387c4dd19ff2", provider_id: PROVIDER_ID },
  ];
  await sb.from("vouches").insert(vouches);
  console.log("Vouches inserted: 3");

  await sb.from("endorsements").delete().eq("provider_id", PROVIDER_ID);
  const endorsements = [
    { from_user_id: "7ada1609-3eec-4532-b167-3e245dabc98c", provider_id: PROVIDER_ID, skill: "Bridal Mehndi" },
    { from_user_id: "b0f894ce-c34c-4ea4-8eae-b9f3425fec5e", provider_id: PROVIDER_ID, skill: "Organic Henna Cones" },
    { from_user_id: "cdcaf5d9-deb3-48c2-b543-387c4dd19ff2", provider_id: PROVIDER_ID, skill: "Arabic Henna" },
    { from_user_id: "e49868f1-a268-45a3-b0b4-f2187a8744ab", provider_id: PROVIDER_ID, skill: "Baby Shower / Godh Bharai" },
  ];
  await sb.from("endorsements").insert(endorsements);
  console.log("Endorsements inserted: 4");

  console.log("=== STEP 7: Upserting Active Story ===");
  await sb.from("stories").delete().eq("owner_id", PROVIDER_ID);
  const story = {
    id: "st_priya_mehndi_1",
    owner_type: "PROVIDER",
    owner_id: PROVIDER_ID,
    author_name: "Priya Nair — Mehndi Artist",
    author_avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
    image_url: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=75",
    caption: "Behind the scenes: Royal bridal storyboard session in Amanora. 5 hours of love and intricate storytelling ✨",
    cta: "Book Now",
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    user_id: PRIYA_USER_ID,
    lat: 18.5115207776089,
    lng: 73.9371184386574,
    visibility: "everyone",
    is_highlighted: true,
  };
  await sb.from("stories").insert([story]);
  console.log("Story inserted: 1");

  console.log("=== STEP 8: Upserting Community Showcase Post ===");
  await sb.from("community_posts").delete().eq("author_ref_id", PROVIDER_ID);
  const post = {
    id: "cm_priya_mehndi_welcome",
    author_user_id: PRIYA_USER_ID,
    author_name: "Priya Nair",
    author_avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
    author_type: "provider",
    author_ref_id: PROVIDER_ID,
    type: "RECOMMENDATION",
    title: "✨ Handcrafted Organic Mehndi & Bridal Bookings Open in Amanora!",
    body: "Hello neighbors! I am Priya Nair, a professional mehndi and henna artist based in Amanora Park Town. With wedding, sangeet, and festive season here, I am now taking advance bookings for bridal henna, baby showers, and guest packages. All designs are crafted using 100% natural, freshly prepared organic henna cones (zero chemicals/PPD) ensuring a rich, dark mahogany stain. Feel free to check my portfolio and catalog items right here on STRYT or message me directly for date availability!",
    area: "Amanora Park Town",
    image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=75",
    likes_count: 12,
    comments_count: 3,
    lat: 18.5115207776089,
    lng: 73.9371184386574,
  };
  await sb.from("community_posts").insert([post]);
  console.log("Community post inserted: 1");

  console.log("=== DONE: Priya Nair Full Mehndi Artist Provider Account Created! ===");
}

main().catch(console.error);
