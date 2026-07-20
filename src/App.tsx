import { Routes, Route, useLocation, useNavigate, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import UserProfileSheet from "./components/UserProfileSheet";
import BottomNav from "./components/BottomNav";
import OfflineBanner from "./components/OfflineBanner";
import { LiveShareProvider } from "./features/live-share/useLiveShare";
import LiveShareBanner from "./features/live-share/LiveShareBanner";
import DesktopSidebar from "./components/DesktopSidebar";
import BusinessAccessGuard from "./components/BusinessAccessGuard";
import RequireScope from "./components/RequireScope";
import ProviderAccessGuard from "./components/ProviderAccessGuard";
import PinGateSheet from "./components/PinGateSheet";
import RouteFallback from "./components/RouteFallback";
import { useApp } from "./store";
import { returnTo } from "./lib/returnTo";
import { contextHomePath } from "./lib/contextHome";
import { LEGAL_VERSION } from "./lib/legal";
import { useI18n, type Lang } from "./lib/i18n";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";

// Auth & onboarding
const Splash = lazy(() => import("./screens/Splash"));
const PhoneEntry = lazy(() => import("./screens/auth/PhoneEntry"));
const OtpVerify = lazy(() => import("./screens/auth/OtpVerify"));
const LocationPermission = lazy(() => import("./screens/auth/LocationPermission"));
const UserOnboard = lazy(() => import("./screens/auth/UserOnboard"));
const DeletionPending = lazy(() => import("./screens/auth/DeletionPending"));
const TermsAccept = lazy(() => import("./screens/auth/TermsAccept"));
const LegalIndex = lazy(() => import("./screens/legal/LegalIndex"));
const LegalDoc = lazy(() => import("./screens/legal/LegalDoc"));
const GuideIndex = lazy(() => import("./screens/guide/GuideIndex"));
const GuideDoc = lazy(() => import("./screens/guide/GuideDoc"));

// Core tabs
const Home = lazy(() => import("./screens/Home"));
const Explore = lazy(() => import("./screens/Explore"));
const Requests = lazy(() => import("./screens/Requests"));
const Profile = lazy(() => import("./screens/Profile"));

// Discovery
const Search = lazy(() => import("./screens/Search"));
const MapView = lazy(() => import("./screens/MapView"));
const CategoryListing = lazy(() => import("./screens/CategoryListing"));
const AllCategories = lazy(() => import("./screens/AllCategories"));
const Notifications = lazy(() => import("./screens/Notifications"));
const Bookmarks = lazy(() => import("./screens/Bookmarks"));
const Followers = lazy(() => import("./screens/Followers"));
const MyQueues = lazy(() => import("./screens/MyQueues"));
const Settings = lazy(() => import("./screens/Settings"));
const Support = lazy(() => import("./screens/Support"));

// Detail
const BusinessDetail = lazy(() => import("./screens/business/BusinessDetail"));
const ProviderDetail = lazy(() => import("./screens/provider/ProviderDetail"));
const RequestDetail = lazy(() => import("./screens/requests/RequestDetail"));

// Pillar C flows
const AskCompose = lazy(() => import("./screens/requests/AskCompose"));
const SubmitProposal = lazy(() => import("./screens/requests/SubmitProposal"));
const AgreementScreen = lazy(() => import("./screens/requests/AgreementScreen"));
const Agreements = lazy(() => import("./screens/requests/Agreements"));
const RateScreen = lazy(() => import("./screens/requests/RateScreen"));
const MyAppointments = lazy(() => import("./screens/requests/MyAppointments"));

// Onboarding
const BusinessOnboard = lazy(() => import("./screens/business/BusinessOnboard"));
const ProviderOnboard = lazy(() => import("./screens/provider/ProviderOnboard"));
const ManageHub = lazy(() => import("./screens/ManageHub"));

// Chat
const ConversationList = lazy(() => import("./screens/chat/ConversationList"));
const ChatThread = lazy(() => import("./screens/chat/ChatThread"));

// Social & community
const CommunityHub = lazy(() => import("./screens/CommunityHub"));
const StoryCompose = lazy(() => import("./screens/StoryCompose"));
const CommunityCompose = lazy(() => import("./screens/CommunityCompose"));
const CommunityPostDetail = lazy(() => import("./screens/CommunityPostDetail"));
const Lists = lazy(() => import("./screens/Lists"));
const PublicProfile = lazy(() => import("./screens/PublicProfile"));
const ProfileEdit = lazy(() => import("./screens/ProfileEdit"));
const Achievements = lazy(() => import("./screens/Achievements"));

// Business console
const ManageDashboard = lazy(() => import("./screens/business/manage/ManageDashboard"));
const BusinessStoreHub = lazy(() => import("./screens/business/manage/BusinessStoreHub"));
const BusinessHub = lazy(() => import("./screens/business/manage/BusinessHub"));
const CatalogManager = lazy(() => import("./screens/business/manage/CatalogManager"));
const InventoryAlerts = lazy(() => import("./screens/business/manage/InventoryAlerts"));
const BusinessPortfolio = lazy(() => import("./screens/business/manage/BusinessPortfolio"));
const ProfileEditor = lazy(() => import("./screens/business/manage/ProfileEditor"));
const BroadcastRadius = lazy(() => import("./screens/business/manage/BroadcastRadius"));
const HoursEditor = lazy(() => import("./screens/business/manage/HoursEditor"));
const QueueManager = lazy(() => import("./screens/business/manage/QueueManager"));
const QnaManager = lazy(() => import("./screens/business/manage/QnaManager"));
const ReviewsManager = lazy(() => import("./screens/business/manage/ReviewsManager"));
const BusinessAppointments = lazy(() => import("./screens/business/manage/BusinessAppointments"));
const BusinessPayments = lazy(() => import("./screens/business/manage/BusinessPayments"));
const LeadsInbox = lazy(() => import("./screens/manage/LeadsInbox"));
const VerificationCenter = lazy(() => import("./screens/business/manage/VerificationCenter"));
const BusinessSettings = lazy(() => import("./screens/business/manage/BusinessSettings"));
const BusinessRequests = lazy(() => import("./screens/business/manage/BusinessRequests"));
const BusinessCommunity = lazy(() => import("./screens/ProfileCommunity"));

// Provider console
const ProviderDashboard = lazy(() => import("./screens/provider/manage/ProviderDashboard"));
const ProviderProfileHub = lazy(() => import("./screens/provider/manage/ProviderProfileHub"));
const ProviderProfileEditor = lazy(() => import("./screens/provider/manage/ProviderProfileEditor"));
const ProviderAvailability = lazy(() => import("./screens/provider/manage/ProviderAvailability"));
const ProviderCatalog = lazy(() => import("./screens/provider/manage/ProviderCatalog"));
const ProviderInventory = lazy(() => import("./screens/provider/manage/ProviderInventory"));
const ProviderPortfolio = lazy(() => import("./screens/provider/manage/ProviderPortfolio"));
const ProviderJobs = lazy(() => import("./screens/provider/manage/ProviderJobs"));
const ProviderFindWork = lazy(() => import("./screens/provider/manage/ProviderFindWork"));
const ProviderMoney = lazy(() => import("./screens/provider/manage/ProviderMoney"));
const ProviderSettings = lazy(() => import("./screens/provider/manage/ProviderSettings"));
const ProviderVerification = lazy(() => import("./screens/provider/manage/ProviderVerification"));
const ProviderCommunity = lazy(() => import("./screens/provider/manage/ProviderCommunity"));

// Admin
const AdminPanel = lazy(() => import("./screens/admin/AdminPanel"));
const AdminLogin = lazy(() => import("./screens/admin/AdminLogin"));
const TrackingPage = lazy(() => import("./screens/TrackingPage"));
const SafetyHub = lazy(() => import("./screens/safety/SafetyHub"));
const EmergencyContacts = lazy(() => import("./screens/safety/EmergencyContacts"));
const MyActivity = lazy(() => import("./screens/MyActivity"));
const AccountSettings = lazy(() => import("./screens/AccountSettings"));
const BusinessAccess = lazy(() => import("./screens/BusinessAccess"));

// Society / Subscriptions / Pro / Neighborhood / Available / Wallet / Loyalty /
// Photos / Story: all moved to screens/future-enhancement/ and unrouted —
// none of these had any in-app nav link (found during a launch audit), so
// they're shelved together rather than left reachable only by guessing a URL.
// Screen files are kept; re-add a lazy import + <Route> here to bring one back.
// BusinessProUpgrade is the one exception already unrouted for a different
// reason (its paid-upgrade flow has no payment provider — STRYT uses
// UPI-deeplink payments only) — screen file stays in future-enhancement/.

// Routes that show the bottom navigation bar
const TAB_ROUTES = ["/home", "/map", "/explore", "/chats", "/requests", "/community-hub", "/profile"];

// Brief full-screen loader shown while the initial Supabase session resolves
function AuthSplash() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background: "linear-gradient(160deg, var(--brand-500) 0%, var(--brand-600) 55%, var(--brand-900) 100%)",
        color: "#fff",
      }}
    >
      <svg width="56" height="56" viewBox="0 0 64 64">
        <path d="M32 11 C21.5 11 13 19.5 13 30 C13 43 32 56 32 56 C32 56 51 43 51 30 C51 19.5 42.5 11 32 11 Z" fill="#fff" />
        <path d="M32 41 C24 35 40 24 32 17" stroke="var(--brand-600)" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          border: "3px solid rgba(255,255,255,0.35)",
          borderTopColor: "#fff",
          animation: "spin 0.8s linear infinite",
        }}
      />
    </div>
  );
}

// Post-auth loading state: a shimmering silhouette of the app shell (header,
// story row, tiles, bottom nav). Feels like the app is already open and just
// filling in — far less jarring than a full-screen branded splash on every
// refresh or deep-link.
function AppShellSkeleton() {
  const skel = (h: number, w: number | string, r = 10): React.CSSProperties => ({ height: h, width: w, borderRadius: r });
  return (
    <div className="screen" style={{ background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div className="page-pad" style={{ paddingTop: 16, flex: 1 }}>
        {/* Header: greeting + icons */}
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div className="col gap-8">
            <div className="skel" style={skel(12, 90)} />
            <div className="skel" style={skel(20, 170)} />
          </div>
          <div className="row gap-8">
            <div className="skel" style={skel(38, 38, 12)} />
            <div className="skel" style={skel(38, 38, 12)} />
          </div>
        </div>
        {/* Search bar */}
        <div className="skel" style={{ ...skel(44, "100%", 14), marginTop: 14 }} />
        {/* Story circles */}
        <div className="row gap-12" style={{ marginTop: 18 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skel" style={skel(56, 56, 28)} />
          ))}
        </div>
        {/* Category chips */}
        <div className="row gap-10" style={{ marginTop: 18 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={skel(64, 64, 16)} />
          ))}
        </div>
        {/* Banner + tiles */}
        <div className="skel" style={{ ...skel(76, "100%", 18), marginTop: 18 }} />
        <div className="row gap-12" style={{ marginTop: 14 }}>
          <div className="skel grow" style={skel(108, "48%", 18)} />
          <div className="skel grow" style={skel(108, "48%", 18)} />
        </div>
      </div>
      {/* Bottom nav silhouette */}
      <div className="row between" style={{ padding: "12px 28px 18px", borderTop: "1px solid var(--line)", background: "#fff" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel" style={skel(i === 2 ? 46 : 30, i === 2 ? 46 : 30, i === 2 ? 23 : 10)} />
        ))}
      </div>
    </div>
  );
}

/**
 * Routes a signed-out visitor is allowed to browse (see GUEST_MODE_PLAN.md).
 *
 * The third tier between PublicOnlyLayout (auth screens, bounce you OUT once
 * signed in) and ProtectedLayout (bounce you out unless signed in): this one
 * never redirects on auth at all — guest and signed-in both get through.
 *
 * Guests are NOT gated on `profileReady`: they have no profile to wait for, so
 * that check would strand them on the app-shell skeleton forever.
 *
 * Note this guards *viewing* only. Every action a guest can reach from these
 * screens is separately gated by `useRequireAuth()` at the point of tap — the
 * button stays visible on purpose, because a guest discovering the feature and
 * being asked to sign in is the entire point of guest mode.
 */
function GuestOrAuthLayout() {
  const { isAuthed, authReady, profileReady } = useApp();

  const isAuthCallback =
    window.location.hash.includes("access_token=") ||
    window.location.hash.includes("error=") ||
    window.location.search.includes("code=");

  // Still resolving, or mid-OAuth-handoff: wait rather than briefly rendering
  // the guest experience to someone who does have a session.
  if (!authReady || isAuthCallback) {
    return <AuthSplash />;
  }

  // Signed in but profile still hydrating — same skeleton as ProtectedLayout,
  // so a signed-in user's experience of these routes is unchanged.
  if (isAuthed && !profileReady) {
    return <AppShellSkeleton />;
  }

  return <Outlet />;
}

function ProtectedLayout() {
  const { isAuthed, authReady, profileReady, user, activeContext } = useApp();
  const location = useLocation();
  const { lang, setLang } = useI18n();

  useEffect(() => {
    if (isAuthed && user?.language && user.language !== lang) {
      setLang(user.language as Lang);
    }
  }, [isAuthed, user?.language, lang, setLang]);

  // Allow Supabase OAuth / magic-link to land and parse its token before any redirect.
  const isAuthCallback =
    window.location.hash.includes("access_token=") ||
    window.location.hash.includes("error=") ||
    window.location.search.includes("code=");

  if ((!authReady || isAuthCallback) && !isAuthed) {
    return <AuthSplash />;
  }

  if (!isAuthed && !isAuthCallback) {
    returnTo.remember(location.pathname + location.search);
    return <Navigate to="/auth/phone" replace />;
  }

  // We have a session but the real profile hasn't loaded yet — wait rather
  // than mounting screens against the blank seed user (name "", avatar "",
  // etc.). Show a skeleton of the app shell instead of the branded splash so
  // a refresh/deep-link feels like the app is already there, just filling in.
  if (!profileReady) {
    return <AppShellSkeleton />;
  }

  // Deletion pending: redirect to warning screen
  const isDeletionPending = isAuthed && user.id && user.deletionScheduledAt;
  if (isDeletionPending) {
    if (location.pathname !== "/auth/deletion-pending") {
      return <Navigate to="/auth/deletion-pending" replace />;
    }
  } else {
    if (location.pathname === "/auth/deletion-pending") {
      return <Navigate to={contextHomePath(activeContext)} replace />;
    }
  }

  // Terms & Privacy acceptance (clickwrap) gate. A signed-in user must have
  // accepted the CURRENT LEGAL_VERSION before using the app — bumping that
  // constant after a policy update re-prompts everyone here automatically.
  // `termsAcceptedVersion === undefined` means the value couldn't be read (e.g.
  // the acceptance migration hasn't run yet) — treated as unknown so we never
  // brick; only a genuine null/stale version blocks. Runs before onboarding so
  // acceptance comes first, and short-circuits those gates while outstanding.
  const termsOutstanding =
    isAuthed && !!user.id && !user.deletionScheduledAt &&
    user.termsAcceptedVersion !== undefined &&
    user.termsAcceptedVersion !== LEGAL_VERSION;
  if (termsOutstanding) {
    return location.pathname === "/auth/terms" ? <Outlet /> : <Navigate to="/auth/terms" replace />;
  }
  if (location.pathname === "/auth/terms") {
    // Already accepted — don't strand the user on the acceptance screen.
    return <Navigate to={contextHomePath(activeContext)} replace />;
  }

  // First-login onboarding, gated on an explicit account-level flag rather
  // than inferring intent from user.name. That heuristic only worked for
  // phone-OTP signups (whose profile self-heal has nothing better than "New
  // user" to seed the name with) — Google OAuth seeds a real name and email
  // signups seed the email's local-part immediately, so both looked
  // "already onboarded" and silently skipped the location/phone/emergency-
  // contact step on their very first login. The flag is also account-level
  // (not localStorage), so skipping on one device sticks across all of them.
  const needsOnboard = isAuthed && user.id && user.onboardingCompletedAt === null && location.pathname !== "/auth/onboard";
  if (needsOnboard) {
    return <Navigate to="/auth/onboard" replace />;
  }

  // New user with no location: prompt once, then let them skip freely.
  const locationSeen = localStorage.getItem("locationPromptShown") === "true";
  const needsLocation = isAuthed && user.id && !user.lat && !user.area && location.pathname === "/home" && !locationSeen;
  if (needsLocation) {
    return <Navigate to="/auth/location" replace />;
  }

  return <Outlet />;
}

function PublicOnlyLayout() {
  const { isAuthed, activeContext } = useApp();
  const isAuthCallback =
    window.location.hash.includes("access_token=") ||
    window.location.hash.includes("error=") ||
    window.location.search.includes("code=");

  if (isAuthed && !isAuthCallback) {
    // Honour a remembered deep link (e.g. a shared /map link) first. Absent one,
    // returnTo.consume() falls back to "/home" — but for a business/provider
    // owner that's the wrong hat: the sidebar/nav/profile are already rendering
    // their console identity from the persisted activeContext, so land them on
    // that console's home instead of the customer Home (the two used to
    // disagree, showing business chrome over the customer page).
    const dest = returnTo.consume();
    return <Navigate to={dest === "/home" ? contextHomePath(activeContext) : dest} replace />;
  }

  return <Outlet />;
}

// Catch-all landing for unknown paths — routes to the home of whatever hat the
// user is currently wearing (customer Home, or the business/provider console
// dashboard) rather than always dumping owners on the customer Home.
function ContextHomeRedirect() {
  const { activeContext } = useApp();
  return <Navigate to={contextHomePath(activeContext)} replace />;
}

// Screens with their own dedicated full-bleed layout (auth/splash, admin login,
// tracking share-link) — the desktop sidebar has nothing useful to navigate to
// from here (not authenticated yet, or a standalone public page), so it's
// hidden on exactly these, and shown EVERYWHERE else once past them. This is
// deliberately broader than TAB_ROUTES (mobile's bottom-nav root list) — a
// desktop sidebar nav is expected to persist across every in-app screen
// (detail pages, chat, settings, manage consoles), not just the 4 tab roots.
function isAuthOrPublicScreen(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/track/") ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/guide")
  );
}

export default function App() {
  const location = useLocation();
  const { toast } = useApp();
  const showNav = TAB_ROUTES.includes(location.pathname);
  const showDesktopSidebar = !isAuthOrPublicScreen(location.pathname);

  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const sub = CapApp.addListener("backButton", ({ canGoBack }) => {
        // Sheet-first: every modal/sheet renders a .overlay whose backdrop
        // click closes it — so hardware BACK dismisses the topmost sheet
        // instead of popping the whole screen underneath it.
        const overlays = document.querySelectorAll<HTMLElement>(".overlay");
        if (overlays.length > 0) {
          overlays[overlays.length - 1].click();
          return;
        }
        if (canGoBack) {
          window.history.back();
        } else {
          void CapApp.exitApp();
        }
      });

      // Draw the app edge-to-edge under the status bar / notch and let CSS
      // safe-area insets (--safe-area-top/-bottom) pad content. Android 15+
      // forces edge-to-edge regardless, so owning it here — rather than relying
      // on an opaque status bar that the OS ignores — is the reliable fix for
      // content hiding under the notch. Icon contrast is set per-route below.
      void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});

      return () => {
        void sub.then((s) => s.remove());
      };
    }
  }, []);

  // Status-bar icon contrast follows the top of the current screen: light icons
  // over the dark gradient surfaces (splash, Home header), dark icons over the
  // white AppBar everywhere else. (Style.Dark = light icons for dark backgrounds.)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const darkTop = location.pathname === "/" || location.pathname === "/home";
    void StatusBar.setStyle({ style: darkTop ? Style.Dark : Style.Light }).catch(() => {});
  }, [location.pathname]);

  // Push-notification taps route into the SPA instead of forcing a full reload.
  // Two sources feed the same navigation:
  //  - native (Capacitor): pushNotifications.ts dispatches a "push-nav" event.
  //  - web: the service worker (public/sw.js) postMessages { type: "NAVIGATE" }
  //    to the focused client on notificationclick. Nothing listened for that
  //    before, so tapping a web push did nothing — wired up here.
  useEffect(() => {
    const onPushNav = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      if (url && url.startsWith("/")) navigate(url);
    };
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "NAVIGATE" && typeof e.data.path === "string" && e.data.path.startsWith("/")) {
        navigate(e.data.path);
      }
    };
    window.addEventListener("push-nav", onPushNav);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      window.removeEventListener("push-nav", onPushNav);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [navigate]);

  return (
    <div className="desktop-layout">
      {showDesktopSidebar && <DesktopSidebar />}

      {/* Main app container */}
      <div className={`app-shell-container ${showDesktopSidebar ? "has-sidebar" : ""}`}>
        <div className="app-shell">
          <LiveShareProvider>
          <OfflineBanner />
          <LiveShareBanner />
      <Suspense fallback={<AuthSplash />}>
      {/* Nested boundary: once the outer one has painted successfully once
          (first route of the session), React catches any LATER route's
          not-yet-loaded lazy chunk here instead of re-triggering the outer
          fallback — so navigating deeper into the app (e.g. first tap into
          Settings) shows the light RouteFallback, not the full cold-boot
          splash again. */}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public only auth routes */}
          <Route element={<PublicOnlyLayout />}>
            <Route path="/" element={<Splash />} />
            <Route path="/auth/phone" element={<PhoneEntry />} />
            <Route path="/auth/otp" element={<OtpVerify />} />
          </Route>

          {/* Completely public / un-guarded routes */}
          <Route path="/track/:token" element={<TrackingPage />} />
          {/* Admin login is its own identity, separate from the customer/seller
              session — unguarded either way so an already-signed-in customer can
              still switch into the admin account here. */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Public legal / policy documents. Un-guarded so guests can read them
              and, crucially, so a signed-in user can open them from the Terms-
              acceptance gate before agreeing (the gate lives in ProtectedLayout,
              which these routes sit outside of). */}
          <Route path="/legal" element={<LegalIndex />} />
          <Route path="/legal/:slug" element={<LegalDoc />} />

          {/* Public user guide & FAQ — same "readable before you're signed in
              or committed" reasoning as /legal above. */}
          <Route path="/guide" element={<GuideIndex />} />
          <Route path="/guide/:slug" element={<GuideDoc />} />

          {/* Browsable signed-out — a guest sees these (capped to 1 km), and so
              does a signed-in user. Actions inside them are gated individually
              via useRequireAuth(). See GUEST_MODE_PLAN.md §3 for what's in this
              list and why. Add to this list deliberately; never invert it. */}
          <Route element={<GuestOrAuthLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/request/:id" element={<RequestDetail />} />
            <Route path="/business/:id" element={<BusinessDetail />} />
            <Route path="/provider/:id" element={<ProviderDetail />} />
            <Route path="/search" element={<Search />} />
            <Route path="/categories" element={<AllCategories />} />
            <Route path="/category/:id" element={<CategoryListing />} />
            {/* Guests get the map too, pinned to 1 km (the radius strip is
                hidden for them — see MapView). */}
            <Route path="/map" element={<MapView />} />
            {/* Read-only for guests — reading a post is "seeing", so the detail
                page opens too (a feed you can't tap into isn't browsable).
                Every write inside it (like/vote/comment/recommend) is gated by
                useRequireAuth; composing a new post is protected below. */}
            <Route path="/community-hub" element={<CommunityHub />} />
            <Route path="/community/:id" element={<CommunityPostDetail />} />
          </Route>

          {/* Protected routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/auth/terms" element={<TermsAccept />} />
            <Route path="/auth/onboard" element={<UserOnboard />} />
            <Route path="/auth/location" element={<LocationPermission />} />
            <Route path="/auth/deletion-pending" element={<DeletionPending />} />

            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/edit" element={<ProfileEdit />} />

            <Route path="/notifications" element={<Notifications />} />
            <Route path="/bookmarks" element={<Bookmarks />} />
            <Route path="/followers" element={<Followers />} />
            <Route path="/queues" element={<MyQueues />} />
            <Route path="/my-activity" element={<MyActivity />} />
            <Route path="/account" element={<AccountSettings />} />
            <Route path="/account/business-access" element={<BusinessAccess />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/support" element={<Support />} />

            <Route path="/ask" element={<AskCompose />} />
            <Route path="/request/:id/propose" element={<SubmitProposal />} />
            <Route path="/agreement/:id" element={<AgreementScreen />} />
            <Route path="/agreements" element={<Agreements />} />
            <Route path="/appointments" element={<MyAppointments />} />
            <Route path="/rate/:id" element={<RateScreen />} />

            <Route path="/onboard/business" element={<BusinessOnboard />} />
            <Route path="/onboard/provider" element={<ProviderOnboard />} />
            <Route path="/manage" element={<ManageHub />} />

            {/* Business console — gated behind BusinessAccessGuard so a
                revoked delegate is bounced out of every manage screen for
                this business, not just blocked on individual writes by RLS. */}
            <Route element={<BusinessAccessGuard />}>
              {/* Home and the Business hub itself are open to every session —
                  both self-filter what they show a SCOPED team member (see
                  ManageDashboard.tsx / BusinessHub.tsx), rather than being
                  hard-gated, since they mix owner-only and scoped content. */}
              <Route path="/business/:id/manage" element={<ManageDashboard />} />
              <Route path="/business/:id/manage/business" element={<BusinessHub />} />

              {/* Each group below is defense-in-depth against direct URL
                  entry — BusinessHub/ManageNav already hide these links for a
                  session lacking the scope, this is the server-shaped guard
                  matching Phase T1's RLS/trigger boundaries exactly. */}
              <Route element={<RequireScope scope="catalog" />}>
                <Route path="/business/:id/manage/store" element={<BusinessStoreHub />} />
                <Route path="/business/:id/manage/catalog" element={<CatalogManager />} />
                <Route path="/business/:id/manage/inventory" element={<InventoryAlerts />} />
                <Route path="/business/:id/manage/portfolio" element={<BusinessPortfolio />} />
                <Route path="/business/:id/manage/hours" element={<HoursEditor />} />
              </Route>

              <Route element={<RequireScope scope="queue" />}>
                <Route path="/business/:id/manage/queue" element={<QueueManager />} />
              </Route>

              <Route element={<RequireScope scope="appointments" />}>
                <Route path="/business/:id/manage/appointments" element={<BusinessAppointments />} />
              </Route>

              <Route element={<RequireScope scope="leads" />}>
                <Route path="/business/:id/manage/qna" element={<QnaManager />} />
                <Route path="/business/:id/manage/inbox" element={<LeadsInbox entityType="BUSINESS" />} />
                <Route path="/business/:id/manage/requests" element={<BusinessRequests />} />
              </Route>

              {/* Owner/FULL-delegate only — no scope can ever unlock these. */}
              <Route element={<RequireScope />}>
                <Route path="/business/:id/manage/profile" element={<ProfileEditor />} />
                <Route path="/business/:id/manage/broadcast" element={<BroadcastRadius />} />
                <Route path="/business/:id/manage/reviews" element={<ReviewsManager />} />
                <Route path="/business/:id/manage/payments" element={<BusinessPayments />} />
                <Route path="/business/:id/manage/verify" element={<VerificationCenter />} />
                <Route path="/business/:id/manage/settings" element={<BusinessSettings />} />
                <Route path="/business/:id/manage/community" element={<BusinessCommunity />} />
              </Route>
            </Route>

            {/* Provider console — gated behind ProviderAccessGuard, parity with
                the business console's BusinessAccessGuard above. */}
            <Route element={<ProviderAccessGuard />}>
              <Route path="/provider/:id/manage" element={<ProviderDashboard />} />
              <Route path="/provider/:id/manage/profile" element={<ProviderProfileHub />} />
              <Route path="/provider/:id/manage/edit-profile" element={<ProviderProfileEditor />} />
              <Route path="/provider/:id/manage/availability" element={<ProviderAvailability />} />
              <Route path="/provider/:id/manage/catalog" element={<ProviderCatalog />} />
              <Route path="/provider/:id/manage/inventory" element={<ProviderInventory />} />
              <Route path="/provider/:id/manage/portfolio" element={<ProviderPortfolio />} />
              <Route path="/provider/:id/manage/inbox" element={<LeadsInbox entityType="PROVIDER" />} />
              <Route path="/provider/:id/manage/jobs" element={<ProviderJobs />} />
              <Route path="/provider/:id/manage/find-work" element={<ProviderFindWork />} />
              <Route path="/provider/:id/manage/money" element={<ProviderMoney />} />
              <Route path="/provider/:id/manage/community" element={<ProviderCommunity />} />
              <Route path="/provider/:id/manage/verify" element={<ProviderVerification />} />
              <Route path="/provider/:id/manage/settings" element={<ProviderSettings />} />
            </Route>

            {/* Safety — live location sharing */}
            <Route path="/safety" element={<SafetyHub />} />
            <Route path="/safety/contacts" element={<EmergencyContacts />} />

            {/* Chat */}
            <Route path="/chats" element={<ConversationList />} />
            <Route path="/chat/:id" element={<ChatThread />} />

            {/* Community + social — the read-only feed and post detail
                (/community, /community-hub, /community/:id) are browsable
                signed-out and registered above. */}
            <Route path="/story/new" element={<StoryCompose />} />
            <Route path="/community/new" element={<CommunityCompose />} />
            <Route path="/lists" element={<Lists />} />
            <Route path="/u/:id" element={<PublicProfile />} />
            <Route path="/achievements" element={<Achievements />} />

            {/* Admin */}
            <Route path="/admin" element={<AdminPanel />} />

            {/* Catch-all: redirect unknown paths to the active context's home */}
            <Route path="*" element={<ContextHomeRedirect />} />
          </Route>
        </Routes>
      </Suspense>
      </Suspense>

      {/* Every business/provider manage screen already renders its own
          ManageNav / ProviderManageNav inline (they're not TAB_ROUTES, so
          `showNav` is false there) — this block exists only for the 8
          customer tab routes. It used to pick the nav from `activeContext`
          alone, so a user who had switched into their business/provider hat
          would see the console's nav stuck on top of the customer Home/Map/
          etc. long after navigating away from `/business/:id/manage*`, because
          `activeContext` persists across navigation and doesn't change just
          by visiting "/home". Gating on the actual current path keeps this
          block doing only the one job it's for: the customer bottom nav on
          customer tab routes. */}
      {showNav && <BottomNav />}
      <UserProfileSheet />
      <PinGateSheet />
      {toast && <div className="toast">{toast}</div>}
          </LiveShareProvider>
        </div>
      </div>
    </div>
  );
}
