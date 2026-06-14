// Every screen the audit visits. Grouped so the report is easy to read.
//
// "static" routes have no :id and can be visited directly.
// "dynamic" routes need a real id — the audit discovers ids at runtime by
// scraping links from the list pages (see audit.spec.ts). The `sample` here is
// only a fallback used when no real id could be discovered.

export interface RouteDef {
  path: string;
  label: string;
}

// Plain screens with no parameters. The bulk of the app.
export const STATIC_ROUTES: RouteDef[] = [
  { path: "/", label: "Splash" },
  { path: "/home", label: "Home" },
  { path: "/explore", label: "Explore" },
  { path: "/search", label: "Search" },
  { path: "/map", label: "Map" },
  { path: "/requests", label: "Requests" },
  { path: "/ask", label: "Ask (compose request)" },
  { path: "/agreements", label: "Agreements" },
  { path: "/chats", label: "Conversations" },
  { path: "/community-hub", label: "Community Hub" },
  { path: "/community", label: "Community" },
  { path: "/community/new", label: "Community compose" },
  { path: "/neighborhood", label: "Neighborhood" },
  { path: "/available", label: "Available now" },
  { path: "/notifications", label: "Notifications" },
  { path: "/bookmarks", label: "Bookmarks" },
  { path: "/lists", label: "Lists" },
  { path: "/wallet", label: "Wallet" },
  { path: "/leaderboard", label: "Leaderboard" },
  { path: "/achievements", label: "Achievements" },
  { path: "/profile", label: "Profile" },
  { path: "/settings", label: "Settings" },
  { path: "/story/new", label: "Story compose" },
  { path: "/onboard/business", label: "Onboard business" },
  { path: "/onboard/provider", label: "Onboard provider" },
  { path: "/manage", label: "Manage hub" },
  { path: "/admin", label: "Admin panel" },
];

// Routes with a :id. The audit fills in real ids discovered from list pages.
// `linkPattern` is the regex used to harvest matching hrefs from rendered pages.
export interface DynamicRouteDef {
  id: string; // unique key for the report
  build: (id: string) => string;
  label: string;
  linkPattern: RegExp; // matches "/business/abc" style hrefs
}

export const DYNAMIC_ROUTES: DynamicRouteDef[] = [
  {
    id: "business",
    build: (id) => `/business/${id}`,
    label: "Business detail",
    linkPattern: /^\/business\/([^/]+)$/,
  },
  {
    id: "provider",
    build: (id) => `/provider/${id}`,
    label: "Provider detail",
    linkPattern: /^\/provider\/([^/]+)$/,
  },
  {
    id: "request",
    build: (id) => `/request/${id}`,
    label: "Request detail",
    linkPattern: /^\/request\/([^/]+)$/,
  },
  {
    id: "community-post",
    build: (id) => `/community/${id}`,
    label: "Community post",
    linkPattern: /^\/community\/([^/]+)$/,
  },
  {
    id: "chat",
    build: (id) => `/chat/${id}`,
    label: "Chat thread",
    linkPattern: /^\/chat\/([^/]+)$/,
  },
  {
    id: "public-profile",
    build: (id) => `/u/${id}`,
    label: "Public profile",
    linkPattern: /^\/u\/([^/]+)$/,
  },
];

// Manage consoles for a business id. Visited only if a business id is found.
export const BUSINESS_MANAGE_SUBPATHS: { sub: string; label: string }[] = [
  { sub: "manage", label: "Business: dashboard" },
  { sub: "manage/catalog", label: "Business: catalog" },
  { sub: "manage/profile", label: "Business: profile editor" },
  { sub: "manage/hours", label: "Business: hours" },
  { sub: "manage/offers", label: "Business: offers" },
  { sub: "manage/photos", label: "Business: photos" },
  { sub: "manage/story", label: "Business: story" },
  { sub: "manage/queue", label: "Business: queue" },
  { sub: "manage/loyalty", label: "Business: loyalty" },
  { sub: "manage/qna", label: "Business: Q&A" },
  { sub: "manage/reviews", label: "Business: reviews" },
  { sub: "manage/reservations", label: "Business: reservations" },
  { sub: "manage/inbox", label: "Business: leads inbox" },
  { sub: "manage/promote", label: "Business: promote" },
  { sub: "manage/verify", label: "Business: verification" },
  { sub: "manage/settings", label: "Business: settings" },
  { sub: "manage/requests", label: "Business: requests" },
];

// Manage consoles for a provider id.
export const PROVIDER_MANAGE_SUBPATHS: { sub: string; label: string }[] = [
  { sub: "manage", label: "Provider: dashboard" },
  { sub: "manage/profile", label: "Provider: profile editor" },
  { sub: "manage/availability", label: "Provider: availability" },
  { sub: "manage/packages", label: "Provider: packages" },
  { sub: "manage/portfolio", label: "Provider: portfolio" },
  { sub: "manage/leads", label: "Provider: leads" },
  { sub: "manage/settings", label: "Provider: settings" },
];

// Pages the audit scrapes to discover real ids for the dynamic routes above.
export const DISCOVERY_PAGES = [
  "/home",
  "/explore",
  "/search",
  "/requests",
  "/community",
  "/chats",
  "/bookmarks",
];
