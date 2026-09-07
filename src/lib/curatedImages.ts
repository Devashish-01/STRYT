import type { Business, CatalogItem, PortfolioItem, Provider } from "@/types";

/**
 * Hand-curated, high-resolution photographs from Unsplash matching real
 * Indian local businesses and providers across Stryt.
 *
 * Ensures every shop, catalogue, and portfolio displays appetizing,
 * relatable, high-definition photography instead of broken images,
 * random loremflickr URLs, or generic emoji blocks.
 */

export interface CuratedProfile {
  cover: string;
  gallery: string[];
  catalog?: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    salePrice?: number;
    image: string;
    isVeg?: boolean;
    bestSeller?: boolean;
  }>;
  portfolio: Array<{
    id: string;
    caption: string;
    url: string;
  }>;
}

export interface CuratedProviderProfile {
  avatar: string;
  portfolio: Array<{
    id: string;
    caption: string;
    url: string;
  }>;
}

// ── Specific Shop Overrides (keyed by ID or normalized name) ────────────────

export const SPECIFIC_BUSINESS_IMAGERY: Record<string, CuratedProfile> = {
  // 1. Spice Route Kitchen
  b_demo_dining: {
    cover: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_spice_1",
        name: "Butter Chicken",
        description: "Tender chicken steeped in rich, velvety tomato and butter makhani gravy",
        price: 340,
        salePrice: 299,
        image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=75",
        isVeg: false,
        bestSeller: true,
      },
      {
        id: "ci_spice_2",
        name: "Paneer Tikka Masala",
        description: "Chargrilled cottage cheese cubes in spiced onion-capsicum masala gravy",
        price: 280,
        image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: true,
      },
      {
        id: "ci_spice_3",
        name: "Crispy Masala Dosa",
        description: "Golden crisp fermented rice crepe stuffed with spiced potato mash, served with coconut chutney & sambar",
        price: 140,
        image: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: false,
      },
      {
        id: "ci_spice_4",
        name: "Hyderabadi Dum Biryani",
        description: "Fragrant basmati rice layered with spiced marinated chicken and saffron",
        price: 310,
        salePrice: 280,
        image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=75",
        isVeg: false,
        bestSeller: true,
      },
      {
        id: "ci_spice_5",
        name: "Garlic Butter Naan (2 pcs)",
        description: "Fresh tandoor-baked flatbread brushed with roasted garlic and melted butter",
        price: 90,
        image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_s1", caption: "Warm ambient family dining hall", url: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_s2", caption: "Live traditional charcoal clay tandoor", url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_s3", caption: "Royal North Indian thali service", url: "https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 2. Fish Katta
  b_9d1919e478714894b21dc233a8bc8f7d: {
    cover: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_fish_1",
        name: "Bombil (Bombay Duck) Fry",
        description: "Crispy rava-crusted Bombay duck fried to golden perfection with lemon & green chutney",
        price: 240,
        salePrice: 210,
        image: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=75",
        isVeg: false,
        bestSeller: true,
      },
      {
        id: "ci_fish_2",
        name: "Surmai Fish Thali",
        description: "Kingfish tawa fry, spicy Malvani fish curry, steamed rice, 2 chapati & solkadhi",
        price: 360,
        image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=75",
        isVeg: false,
        bestSeller: true,
      },
      {
        id: "ci_fish_3",
        name: "Crispy Prawns Koliwada",
        description: "Fresh medium prawns tossed in Mumbai Koliwada spices and deep fried",
        price: 320,
        image: "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=600&q=75",
        isVeg: false,
        bestSeller: true,
      },
      {
        id: "ci_fish_4",
        name: "Whole Pomfret Tawa Fry",
        description: "Fresh silver pomfret shallow fried with fiery red Malvani coastal masala",
        price: 450,
        image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=75",
        isVeg: false,
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_fk1", caption: "Daily fresh catch selection from coastal docks", url: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_fk2", caption: "Crispy hot fish fry kitchen prep", url: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_fk3", caption: "Traditional Solkadhi & Malvani curry service", url: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 3. Soumyapatelmakeovers
  b_de48dd0296a34a45a414a7936cf3130c: {
    cover: "https://images.unsplash.com/photo-1588510977054-8e4b4d409708?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_sm_1",
        name: "Subtle Day Makeup for a Bride",
        description: "Soft radiant glow, waterproof base, lightweight eyelashes, and elegant styling",
        price: 5500,
        salePrice: 4800,
        image: "https://images.unsplash.com/photo-1588510977054-8e4b4d409708?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_sm_2",
        name: "Grand Evening Reception Glam",
        description: "Dramatic smokey eyes, sculpted cheekbones, HD foundation, and long-lasting shimmer",
        price: 7000,
        image: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_sm_3",
        name: "Sangeet & Mehendi Party Look",
        description: "Vibrant festive makeup with hair extensions, floral setting, and glitter accents",
        price: 4500,
        image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
      {
        id: "ci_sm_4",
        name: "Bridal Consultation & Trial Session",
        description: "Skin preparation evaluation, shade matching, and custom look testing",
        price: 1500,
        image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_sm1", caption: "Royal North Indian Bridal Look", url: "https://images.unsplash.com/photo-1588510977054-8e4b4d409708?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_sm2", caption: "Intricate Floral Bridal Hairdo", url: "https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_sm3", caption: "Cocktail Reception Smokey Glam", url: "https://images.unsplash.com/photo-1457972729786-0411a3b2b626?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 4. Kitchen king
  b_a1b3dae370c24f7fbc993d07f44a0c23: {
    cover: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_kk_1",
        name: "Special Chicken Dum Biryani",
        description: "Slow-cooked saffron basmati rice with tender spiced chicken pieces and caramelized onions",
        price: 290,
        salePrice: 250,
        image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=75",
        isVeg: false,
        bestSeller: true,
      },
      {
        id: "ci_kk_2",
        name: "Shahi Paneer Deluxe",
        description: "Fresh cottage cheese in sweet and rich creamy cashew-tomato gravy",
        price: 260,
        image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: true,
      },
      {
        id: "ci_kk_3",
        name: "Butter Naan (Basket of 3)",
        description: "Crispy and soft tandoori bread generously coated with butter",
        price: 90,
        image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: false,
      },
      {
        id: "ci_kk_4",
        name: "Tandoori Chicken Platter",
        description: "Smoky charcoal grilled chicken marinated in yogurt and Indian spices",
        price: 340,
        image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=600&q=75",
        isVeg: false,
        bestSeller: true,
      },
    ],
    portfolio: [
      { id: "bp_kk1", caption: "Signature royal dum thali", url: "https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_kk2", caption: "Live tandoor and grill section", url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_kk3", caption: "Comfortable family dining area", url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 5. Kashee Return LLP
  b_28cfd665c81f42f19aebf2bc0a002635: {
    cover: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_kashee_1",
        name: "Dal Makhani Fondue",
        description: "Slow-simmered black lentils with fresh cream, served with mini garlic naan",
        price: 320,
        image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: true,
      },
      {
        id: "ci_kashee_2",
        name: "Royal Tandoori Veg Platter",
        description: "Assorted tandoori broccoli, paneer tikka, and stuffed mushroom skewers",
        price: 380,
        image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: true,
      },
      {
        id: "ci_kashee_3",
        name: "Kashmiri Mutton Rogan Josh",
        description: "Tender lamb simmered in traditional Kashmiri spices and ratan jot",
        price: 460,
        image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=75",
        isVeg: false,
        bestSeller: true,
      },
    ],
    portfolio: [
      { id: "bp_kr1", caption: "Bespoke banquet & private dining setup", url: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_kr2", caption: "Gourmet culinary presentation", url: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 6. Indori -mart
  b_d0b35361947a4ebb99abfb69b3fedc6e: {
    cover: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1546470427-e5ac89c8ba3a?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_ind_1",
        name: "Indori Poha & Ratlami Sev Pack",
        description: "Special thick Indori poha with spicy aromatic Ratlami sev and jeeravan masala",
        price: 120,
        image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: true,
      },
      {
        id: "ci_ind_2",
        name: "Farm Fresh Tomatoes (1kg)",
        description: "Locally sourced red juicy tomatoes handpicked daily",
        price: 45,
        image: "https://images.unsplash.com/photo-1546470427-e5ac89c8ba3a?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: false,
      },
      {
        id: "ci_ind_3",
        name: "Lord Shiva Embossed Canvas Poster",
        description: "High-definition devotional wall art canvas for meditation room or living space",
        price: 299,
        image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: true,
      },
    ],
    portfolio: [
      { id: "bp_im1", caption: "Spacious supermarket aisles with daily essentials", url: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_im2", caption: "Quick checkout & gift wrapping station", url: "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 7. Professional video editor
  b_d8f29adf0512430d863ef4264f6ee56a: {
    cover: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_ve_1",
        name: "Viral Reels & Shorts Editing (Pack of 5)",
        description: "Hook-optimized pacing, dynamic animated captions, sound effects, and color grading",
        price: 2999,
        salePrice: 2499,
        image: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_ve_2",
        name: "YouTube Video Production & Cut (10-15 min)",
        description: "Full timeline cut, B-roll integration, custom thumbnail, and sound design",
        price: 4999,
        image: "https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_ve_3",
        name: "Wedding & Event Cinematic Teaser",
        description: "Emotional storytelling cut with Hollywood film LUT color grading and licensed score",
        price: 7500,
        image: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_ve1", caption: "Dual-screen DaVinci color grading suite", url: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_ve2", caption: "Commercial brand shoot & film editing", url: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 8. STRYT
  b_97c17014350240ac95ef393e09ca0df5: {
    cover: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_stryt_1",
        name: "Neighbourhood Creator Membership",
        description: "Access to community coworking spaces, event lounge, and creator perks",
        price: 1499,
        image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_stryt_2",
        name: "Local Business Spotlight Package",
        description: "Featured promotion across the local neighbourhood feed and discovery badges",
        price: 2999,
        image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
    ],
    portfolio: [
      { id: "bp_st1", caption: "Community townhall & local creator meetup", url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_st2", caption: "Co-working lounge and collaboration pods", url: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 9. Frostbite Ice Cream
  b_demo_takeaway: {
    cover: "https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1560008581-09826d1de69e?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_takeaway_1",
        name: "Chocolate Sundae",
        description: "Triple Belgian chocolate scoops with roasted almond fudge and whipped cream",
        price: 150,
        image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: true,
      },
      {
        id: "ci_demo_takeaway_2",
        name: "Mango Kulfi",
        description: "Authentic Alphonso mango kulfi with saffron cardamom essence",
        price: 80,
        image: "https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: true,
      },
      {
        id: "ci_demo_takeaway_3",
        name: "Family Tub 500ml",
        description: "Gourmet assorted artisanal ice cream tub for home celebrations",
        price: 350,
        image: "https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=600&q=75",
        isVeg: true,
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_ice1", caption: "Handmade waffle cones & sundaes", url: "https://images.unsplash.com/photo-1576506295286-5cda18df43e7?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_ice2", caption: "Gourmet fresh gelato display counter", url: "https://images.unsplash.com/photo-1505394033641-40c6ad1178d7?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 10. Sunrise Family Clinic
  b_demo_clinic: {
    cover: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_clinic_1",
        name: "General Physician Consultation",
        description: "Thorough physical checkup, diagnosis, and digital prescription",
        price: 400,
        image: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_clinic_2",
        name: "Follow-up Consultation",
        description: "Review of recovery progress and medication adjustment within 7 days",
        price: 200,
        image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
      {
        id: "ci_demo_clinic_3",
        name: "Basic Health Checkup",
        description: "BP, sugar, pulse, oxygen, BMI and lifestyle health screening",
        price: 750,
        image: "https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
    ],
    portfolio: [
      { id: "bp_cl1", caption: "Clean modern doctor consultation chamber", url: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_cl2", caption: "Sterilized clinical checkup station", url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 11. FixIt Home Services
  b_demo_homeservice: {
    cover: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_homeservice_1",
        name: "Electrical Repair Visit",
        description: "On-site troubleshooting for power trips, short circuits, and switchboards",
        price: 300,
        image: "https://images.unsplash.com/photo-1558403194-611308249627?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_homeservice_2",
        name: "Fan Installation",
        description: "Safe ceiling mount, hook alignment, and regulator connection",
        price: 250,
        image: "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
      {
        id: "ci_demo_homeservice_3",
        name: "Wiring Inspection",
        description: "Comprehensive whole-home earthing and load capacity audit",
        price: 500,
        image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
    ],
    portfolio: [
      { id: "bp_fix1", caption: "Circuit breaker and MCB panel overhaul", url: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_fix2", caption: "Architectural warm cove lighting install", url: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 12. BrightMinds Tuition Center
  b_demo_learning: {
    cover: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_learning_1",
        name: "Monthly Batch - Class 10",
        description: "Comprehensive daily tutoring for Maths, Physics, Chemistry & sample papers",
        price: 2500,
        image: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_learning_2",
        name: "One-on-One Tutoring (per hr)",
        description: "Dedicated personalized coaching targeting specific weak topics",
        price: 600,
        image: "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_learning_3",
        name: "Weekend Crash Course",
        description: "Intensive 4-hour revision & problem solving session every weekend",
        price: 1800,
        image: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_bm1", caption: "Interactive conceptual learning session", url: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_bm2", caption: "Quiet study library and practice desk", url: "https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 13. Sharma & Associates Law Firm
  b_demo_professional: {
    cover: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_professional_1",
        name: "Legal Consultation",
        description: "Confidential 45-min legal advisory on property, corporate, or civil matters",
        price: 1000,
        image: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_professional_2",
        name: "Document Drafting",
        description: "Professional drafting of rental agreements, NDAs, power of attorney or deeds",
        price: 2500,
        image: "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_professional_3",
        name: "Property Title Check",
        description: "Complete legal verification of registry records, encumbrances, and ownership",
        price: 3500,
        image: "https://images.unsplash.com/photo-1521791136364-7286472b6b5c?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_law1", caption: "Corporate conference & mediation room", url: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_law2", caption: "Private consultation lounge", url: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 14. Dream Decor Events
  b_demo_events: {
    cover: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_events_1",
        name: "Birthday Decor Package",
        description: "Custom balloon arch, LED number lights, backdrop frame, and themed dessert table",
        price: 5000,
        image: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_events_2",
        name: "Wedding Stage Decor",
        description: "Luxurious fresh floral backdrop, stage chandeliers, royal couple seating, and entry passage",
        price: 25000,
        image: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_events_3",
        name: "Balloon Setup",
        description: "Festive balloon clusters, table centerpieces, and entrance welcome pillar",
        price: 1500,
        image: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_ev1", caption: "Fairytale outdoor mandap with floral drape", url: "https://images.unsplash.com/photo-1519225429828-56961448b111?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_ev2", caption: "Evening fairy-lit banquet reception", url: "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 15. Urban Threads Clothing
  b_demo_shop: {
    cover: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_shop_1",
        name: "Cotton Shirt",
        description: "100% breathable Egyptian cotton slim-fit shirt in pastel and classic hues",
        price: 999,
        image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_shop_2",
        name: "Denim Jeans",
        description: "Stretchable tapered denim jeans in dark indigo wash with premium brass rivets",
        price: 1499,
        image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_shop_3",
        name: "Kurta Set",
        description: "Handcrafted festive cotton-silk kurta with matching churidar and pocket detail",
        price: 1899,
        image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_clt1", caption: "Autumn/Winter curated ready-to-wear rack", url: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_clt2", caption: "Modern boutique storefront display", url: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 16. Glow Studio Unisex Salon
  b_demo_salon: {
    cover: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_salon_1",
        name: "Haircut - Men",
        description: "Wash, precision cut, beard sculpt, and invigorating head massage",
        price: 350,
        image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_salon_2",
        name: "Haircut - Women",
        description: "Professional hair analysis, personalized layer cut, and thermal blow-dry style",
        price: 650,
        image: "https://images.unsplash.com/photo-1521590832167-7bcbfaaa6d96?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_salon_3",
        name: "Deep Nourishing Hair Spa",
        description: "Steam scalp treatment, keratin serum masque, and anti-frizz gloss therapy",
        price: 1200,
        image: "https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_sal1", caption: "Bridal hair styling & beauty lounge", url: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_sal2", caption: "Chic modern styling stations", url: "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 17. MedScan Diagnostic Lab
  b_demo_diagnostics: {
    cover: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_diagnostics_1",
        name: "Complete Blood Count (CBC)",
        description: "Automated analysis of 24 blood parameters with same-day digital report",
        price: 350,
        image: "https://images.unsplash.com/photo-1615461066841-6116e61058f4?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_diagnostics_2",
        name: "Lipid Profile Test",
        description: "Comprehensive cholesterol, triglycerides, HDL and LDL risk check",
        price: 650,
        image: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_diagnostics_3",
        name: "Thyroid Profile (T3, T4, TSH)",
        description: "Accurate hormone evaluation via advanced chemiluminescence method",
        price: 550,
        image: "https://images.unsplash.com/photo-1581093458791-9f3c3900df4b?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_diag1", caption: "Automated pathology testing laboratory", url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_diag2", caption: "Hygienic blood sample collection booth", url: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 18. PowerHouse Gym
  b_demo_fitness: {
    cover: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_fitness_1",
        name: "Monthly Gym Membership",
        description: "Unlimited floor access to cardio, strength machines, steam bath, and locker",
        price: 1500,
        image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_fitness_2",
        name: "Personal Training Session",
        description: "1-on-1 coach session targeting posture correction, form, and diet guidance",
        price: 600,
        image: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_fitness_3",
        name: "Quarterly Transformation Pass",
        description: "3-month membership package with body fat analysis and customized workout chart",
        price: 3800,
        image: "https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_gym1", caption: "Heavy free-weights & powerlifting platform", url: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_gym2", caption: "Cardio suite & functional fitness zone", url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 19. CarePlus Pharmacy
  b_demo_pharmacy: {
    cover: "https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_pharmacy_1",
        name: "Paracetamol 650mg Strip",
        description: "Fast relief for fever and body ache (strip of 15 tablets)",
        price: 32,
        image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_pharmacy_2",
        name: "Daily Multivitamin & Zinc (60 Tabs)",
        description: "Complete immune defence and stamina booster dietary supplement",
        price: 420,
        salePrice: 360,
        image: "https://images.unsplash.com/photo-1550572017-edd951aa8ca0?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_pharmacy_3",
        name: "First Aid Safety Kit Box",
        description: "Emergency kit containing antiseptic liquid, bandages, cotton roll, and burn ointment",
        price: 350,
        image: "https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_ph1", caption: "Well-organized pharmacy shelves & OTC aisle", url: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_ph2", caption: "Licensed pharmacist dispensing counter", url: "https://images.unsplash.com/photo-1586015555751-63c2c55b77c5?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 20. Happy Paws Veterinary Clinic
  b_demo_vet: {
    cover: "https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_vet_1",
        name: "Vet Consultation",
        description: "General checkup, weight screening, dietary advice, and wellness exam",
        price: 450,
        image: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_vet_2",
        name: "Dog & Cat Vaccination",
        description: "Core vaccines including Rabies and DHPPi with verified vaccination passport",
        price: 850,
        image: "https://images.unsplash.com/photo-1535268647677-300dbf3d78d1?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_vet_3",
        name: "Pet Spa & Grooming",
        description: "Medicated bath, nail trimming, ear cleaning, and detangling fur brush",
        price: 1200,
        image: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_vet1", caption: "Gentle pet examination and treatment room", url: "https://images.unsplash.com/photo-1599443015574-be5fe8a05783?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_vet2", caption: "Pet recovery & wellness observation area", url: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 21. STRYT Neighbourhood Kiosk
  b_demo_generic: {
    cover: "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=800&q=75",
    ],
    catalog: [
      {
        id: "ci_demo_generic_1",
        name: "Sundry Item Pack",
        description: "Everyday household essentials, packaging tape, tissues & batteries",
        price: 100,
        image: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
      {
        id: "ci_demo_generic_2",
        name: "Stationery & Notebook Bundle",
        description: "A5 ruled notebooks, gel pens, highlighters, and sticky note pads",
        price: 200,
        image: "https://images.unsplash.com/photo-1456735190829-80ab072ac175?auto=format&fit=crop&w=600&q=75",
        bestSeller: true,
      },
      {
        id: "ci_demo_generic_3",
        name: "Recharge & Bill Pay Assistance",
        description: "Instant FASTag, mobile recharge, and electricity bill payment support",
        price: 20,
        image: "https://images.unsplash.com/photo-1556742049-0a67c5574f73?auto=format&fit=crop&w=600&q=75",
        bestSeller: false,
      },
    ],
    portfolio: [
      { id: "bp_gk1", caption: "Convenience grocery & sundries inventory", url: "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=800&q=75" },
      { id: "bp_gk2", caption: "Instant photocopy and document scan counter", url: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=800&q=75" },
    ],
  },
};

// ── Specific Provider Overrides ─────────────────────────────────────────────

export const SPECIFIC_PROVIDER_IMAGERY: Record<string, CuratedProviderProfile> = {
  // 1. Dr. Devashish Patel
  p_demo_u1: {
    avatar: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80",
    portfolio: [
      { id: "pp_dp1", caption: "Comprehensive patient health consultation", url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_dp2", caption: "Clean clinical diagnosis and equipment", url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_dp3", caption: "Vitals screening and preventative health", url: "https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 2. Devashish India — Electrician
  p_demo_u2: {
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80",
    portfolio: [
      { id: "pp_de1", caption: "Heavy-duty 3-phase MCB switchboard panel wiring", url: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_de2", caption: "High-precision digital multimeter circuit testing", url: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_de3", caption: "Living room recessed LED lighting installation", url: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 3. Dev P — Private Tutor
  p_demo_u3: {
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    portfolio: [
      { id: "pp_dt1", caption: "Interactive senior physics derivation session", url: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_dt2", caption: "1-on-1 problem-solving & exam prep strategy", url: "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_dt3", caption: "Organized handwritten formula guides and notes", url: "https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 4. Shree resin craft
  p_e7904dd62bbc463c8ed946ef171155ee: {
    avatar: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=400&q=80",
    portfolio: [
      { id: "pp_rc1", caption: "Ocean wave teakwood resin wall clock", url: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_rc2", caption: "Emerald crystal geode coasters with 24k gold leaf", url: "https://images.unsplash.com/photo-1569172122301-bc500f309134?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_rc3", caption: "Varmala wedding garland flower preservation block", url: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_rc4", caption: "Handmade marble-effect epoxy cheese platter", url: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 5. Guitarist JJ
  p_5e250bb72c964d6daccd5553861d0a62: {
    avatar: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80",
    portfolio: [
      { id: "pp_g1", caption: "Live unplugged acoustic evening set at local cafe", url: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_g2", caption: "Fingerstyle acoustic tracking in recording studio", url: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_g3", caption: "Sunset garden acoustic performance for wedding", url: "https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=800&q=75" },
    ],
  },

  // 6. Amarylline art
  p_a3e5be5e39a34cd2911dcf27e024ad2d: {
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
    portfolio: [
      { id: "pp_aa1", caption: "Golden hour mountain landscape on linen canvas", url: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_aa2", caption: "Custom fine watercolor portrait on handmade paper", url: "https://images.unsplash.com/photo-1579783928121-e90ea89ab583?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_aa3", caption: "Textured palette-knife modern acrylic on canvas", url: "https://images.unsplash.com/photo-1569172122301-bc500f309134?auto=format&fit=crop&w=800&q=75" },
      { id: "pp_aa4", caption: "Solo artist gallery exhibition booth showcase", url: "https://images.unsplash.com/photo-1501472312651-787554900085?auto=format&fit=crop&w=800&q=75" },
    ],
  },
};

// ── Generic Category Defaults (used if not in specific overrides) ───────────

export const CATEGORY_FALLBACK_IMAGES: Record<string, { cover: string; gallery: string[]; catalogItem: string }> = {
  restaurant: {
    cover: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=75",
  },
  cafe: {
    cover: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=600&q=75",
  },
  grocery: {
    cover: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1546470427-e5ac89c8ba3a?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1546470427-e5ac89c8ba3a?auto=format&fit=crop&w=600&q=75",
  },
  pharmacy: {
    cover: "https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=75",
  },
  salon: {
    cover: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=75",
  },
  gym: {
    cover: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=75",
  },
  retail: {
    cover: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=75",
      "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=75",
  },
  electronics: {
    cover: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=600&q=75",
  },
  doctor: {
    cover: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=75",
  },
  repair: {
    cover: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1558403194-611308249627?auto=format&fit=crop&w=600&q=75",
  },
  generic: {
    cover: "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=800&q=75",
    ],
    catalogItem: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=75",
  },
};

// ── Image Validation Helpers ────────────────────────────────────────────────

export function isBadImage(url?: string | null): boolean {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "undefined") return true;
  if (trimmed.includes("loremflickr.com")) return true;
  if (trimmed.includes("api.dicebear.com")) return true;
  return false;
}

export function resolveCategoryKey(categoryName?: string, subCategory?: string, name?: string): string {
  const combined = `${categoryName ?? ""} ${subCategory ?? ""} ${name ?? ""}`.toLowerCase();
  if (combined.includes("fish") || combined.includes("seafood") || combined.includes("katta")) return "restaurant";
  if (combined.includes("biryani") || combined.includes("kitchen") || combined.includes("restaurant") || combined.includes("dining") || combined.includes("food")) return "restaurant";
  if (combined.includes("cafe") || combined.includes("coffee") || combined.includes("bakery")) return "cafe";
  if (combined.includes("chemist") || combined.includes("pharmacy") || combined.includes("medical") || combined.includes("medicine")) return "pharmacy";
  if (combined.includes("doctor") || combined.includes("clinic") || combined.includes("physician") || combined.includes("hospital")) return "doctor";
  if (combined.includes("salon") || combined.includes("barber") || combined.includes("makeup") || combined.includes("beauty") || combined.includes("spa")) return "salon";
  if (combined.includes("gym") || combined.includes("fitness") || combined.includes("workout")) return "gym";
  if (combined.includes("cloth") || combined.includes("wear") || combined.includes("fashion") || combined.includes("boutique")) return "retail";
  if (combined.includes("mobile") || combined.includes("electronic")) return "electronics";
  if (combined.includes("kirana") || combined.includes("grocery") || combined.includes("mart") || combined.includes("supermarket")) return "grocery";
  if (combined.includes("electric") || combined.includes("plumb") || combined.includes("repair") || combined.includes("service")) return "repair";
  return "generic";
}

// ── Public Resolvers ────────────────────────────────────────────────────────

/**
 * Ensures the business returns a high quality, relevant cover image.
 */
export function getRelatableBusinessCover(b: Partial<Business>): string {
  if (b.id && SPECIFIC_BUSINESS_IMAGERY[b.id]) {
    return SPECIFIC_BUSINESS_IMAGERY[b.id].cover;
  }
  if (!isBadImage(b.coverImage)) {
    return b.coverImage!;
  }
  const key = resolveCategoryKey(b.categoryName, b.subCategory, b.name);
  return CATEGORY_FALLBACK_IMAGES[key]?.cover || CATEGORY_FALLBACK_IMAGES.generic.cover;
}

/**
 * Ensures the business returns a realistic gallery of photographs.
 */
export function getRelatableBusinessGallery(b: Partial<Business>): string[] {
  if (b.id && SPECIFIC_BUSINESS_IMAGERY[b.id]) {
    return SPECIFIC_BUSINESS_IMAGERY[b.id].gallery;
  }
  const existing = (b.gallery ?? []).filter((u) => !isBadImage(u));
  if (existing.length > 0) return existing;
  const key = resolveCategoryKey(b.categoryName, b.subCategory, b.name);
  return CATEGORY_FALLBACK_IMAGES[key]?.gallery || CATEGORY_FALLBACK_IMAGES.generic.gallery;
}

/**
 * Enriches catalog items, replacing missing or loremflickr images with
 * appetizing, relatable product photos.
 */
export function enrichCatalogItems(businessId: string, items: CatalogItem[], bName?: string, bCat?: string): CatalogItem[] {
  const specific = SPECIFIC_BUSINESS_IMAGERY[businessId];
  if (specific && (!items || items.length === 0)) {
    return (specific.catalog ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      price: c.price,
      salePrice: c.salePrice,
      image: c.image,
      stockStatus: "IN_STOCK",
      isVeg: c.isVeg,
      bestSeller: c.bestSeller,
    }));
  }

  const catKey = resolveCategoryKey(bCat, undefined, bName);
  const fallbackImg = CATEGORY_FALLBACK_IMAGES[catKey]?.catalogItem || CATEGORY_FALLBACK_IMAGES.generic.catalogItem;

  return (items ?? []).map((item) => {
    if (!isBadImage(item.image)) return item;

    // Check if there is a match in specific overrides
    if (specific?.catalog) {
      const match = specific.catalog.find(
        (sc) => sc.name.toLowerCase().includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(sc.name.toLowerCase())
      );
      if (match) {
        return { ...item, image: match.image, description: item.description || match.description };
      }
    }

    // Keyword heuristics
    const n = item.name.toLowerCase();
    let img = fallbackImg;

    const KEYWORD_MAP: Array<{ match: string[]; url: string }> = [
      { match: ["poha", "sev"], url: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=75" },
      { match: ["samosa", "kachori"], url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=75" },
      { match: ["chai", "tea"], url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=75" },
      { match: ["coffee", "cappuccino", "latte", "espresso"], url: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=75" },
      { match: ["dosa", "idli", "vada", "sambar"], url: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=75" },
      { match: ["biryani", "pulao", "rice"], url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=75" },
      { match: ["butter chicken", "murgh"], url: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=75" },
      { match: ["paneer"], url: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=75" },
      { match: ["thali"], url: "https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=600&q=75" },
      { match: ["dal", "makhani"], url: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=75" },
      { match: ["naan", "roti", "paratha", "kulcha"], url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=75" },
      { match: ["bombil", "surmai", "fish", "pomfret", "prawn"], url: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=75" },
      { match: ["pizza"], url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=75" },
      { match: ["burger"], url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=75" },
      { match: ["sandwich"], url: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=75" },
      { match: ["momo"], url: "https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?auto=format&fit=crop&w=600&q=75" },
      { match: ["noodle", "chowmein", "pasta"], url: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=75" },
      { match: ["cake", "pastry", "bakery"], url: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=75" },
      { match: ["kulfi", "ice cream", "sundae", "gelato"], url: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=75" },
      { match: ["sweet", "mithai", "laddu", "jamun", "jalebi"], url: "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=600&q=75" },
      { match: ["juice", "shake", "smoothie"], url: "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=600&q=75" },
      { match: ["apple", "fruit", "banana", "mango"], url: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=75" },
      { match: ["tomato", "onion", "potato", "vegetable", "sabzi"], url: "https://images.unsplash.com/photo-1546470427-e5ac89c8ba3a?auto=format&fit=crop&w=600&q=75" },
      { match: ["milk", "dairy", "curd", "dahi"], url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=75" },
      { match: ["bread"], url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=75" },
      { match: ["haircut", "hair cut", "trim", "fade", "beard"], url: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=75" },
      { match: ["spa", "hair spa", "facial", "massage", "cleanup"], url: "https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=600&q=75" },
      { match: ["makeup", "bridal", "makeover"], url: "https://images.unsplash.com/photo-1588510977054-8e4b4d409708?auto=format&fit=crop&w=600&q=75" },
      { match: ["shirt", "t-shirt", "kurta", "cloth", "dress"], url: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=75" },
      { match: ["jeans", "denim", "trouser", "pant"], url: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=75" },
      { match: ["consultation", "doctor", "checkup"], url: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=75" },
      { match: ["blood", "cbc", "lipid", "thyroid", "test", "lab"], url: "https://images.unsplash.com/photo-1615461066841-6116e61058f4?auto=format&fit=crop&w=600&q=75" },
      { match: ["medicine", "tablet", "paracetamol", "vitamin"], url: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=75" },
      { match: ["gym", "workout", "membership", "fitness"], url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=75" },
      { match: ["wiring", "electrical", "fan", "switch", "repair"], url: "https://images.unsplash.com/photo-1558403194-611308249627?auto=format&fit=crop&w=600&q=75" },
      { match: ["plumb", "leakage", "tap", "pipe"], url: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=600&q=75" },
      { match: ["ac repair", "ac service", "cooling"], url: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=75" },
      { match: ["decor", "balloon", "stage", "wedding"], url: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=600&q=75" },
      { match: ["tutor", "tuition", "batch", "coaching", "class"], url: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=600&q=75" },
      { match: ["legal", "lawyer", "agreement", "draft"], url: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=75" },
      { match: ["video", "reels", "editing", "film"], url: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=600&q=75" },
      { match: ["resin", "craft", "clock", "coaster"], url: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=75" },
      { match: ["guitar", "music", "song", "recording"], url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=75" },
      { match: ["art", "painting", "portrait", "canvas"], url: "https://images.unsplash.com/photo-1579783928121-e90ea89ab583?auto=format&fit=crop&w=600&q=75" },
    ];

    for (const entry of KEYWORD_MAP) {
      if (entry.match.some((k) => n.includes(k))) {
        img = entry.url;
        break;
      }
    }

    return { ...item, image: img };
  });
}

/**
 * Enriches business portfolio items, providing real past work samples
 * and captions so the Work tab is always visually impressive and relatable.
 */
export function enrichBusinessPortfolio(businessId: string, portfolio: PortfolioItem[], bName?: string, bCat?: string): PortfolioItem[] {
  const specific = SPECIFIC_BUSINESS_IMAGERY[businessId];
  if (specific && (!portfolio || portfolio.length === 0 || portfolio.every((p) => isBadImage(p.url)))) {
    return specific.portfolio.map((p) => ({
      id: p.id,
      url: p.url,
      caption: p.caption,
    }));
  }

  // Filter out loremflickr or empty items
  const valid = (portfolio ?? []).filter((p) => !isBadImage(p.url));
  if (valid.length > 0) return valid;

  // Otherwise provide generic portfolio based on category
  const key = resolveCategoryKey(bCat, undefined, bName);
  const fallback = CATEGORY_FALLBACK_IMAGES[key] || CATEGORY_FALLBACK_IMAGES.generic;
  return fallback.gallery.map((url, i) => ({
    id: `bp_fb_${businessId}_${i}`,
    url,
    caption: i === 0 ? "Storefront & Ambiance" : "Service & Quality Showcase",
  }));
}

/**
 * Ensures providers have an authentic, professional portrait avatar.
 */
export function getRelatableProviderAvatar(p: Partial<Provider>): string {
  if (p.id && SPECIFIC_PROVIDER_IMAGERY[p.id]) {
    return SPECIFIC_PROVIDER_IMAGERY[p.id].avatar;
  }
  if (!isBadImage(p.avatar)) {
    return p.avatar!;
  }
  return "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80";
}

/**
 * Enriches provider portfolio with genuine showcase work.
 */
export function enrichProviderPortfolio(providerId: string, portfolio: PortfolioItem[]): PortfolioItem[] {
  const specific = SPECIFIC_PROVIDER_IMAGERY[providerId];
  if (specific && (!portfolio || portfolio.length === 0 || portfolio.every((p) => isBadImage(p.url)))) {
    return specific.portfolio.map((p) => ({
      id: p.id,
      providerId,
      url: p.url,
      caption: p.caption,
    }));
  }

  const valid = (portfolio ?? []).filter((p) => !isBadImage(p.url));
  if (valid.length > 0) return valid;

  return [
    {
      id: `pp_def_${providerId}_1`,
      url: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=800&q=75",
      caption: "Professional on-site service delivery",
    },
    {
      id: `pp_def_${providerId}_2`,
      url: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=800&q=75",
      caption: "Quality tools & finished craft",
    },
  ];
}
