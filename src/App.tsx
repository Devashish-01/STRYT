import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import BottomNav from "./components/BottomNav";
import { useApp } from "./store";
import { returnTo } from "./lib/returnTo";

// Auth & onboarding
import Splash from "./screens/Splash";
import PhoneEntry from "./screens/auth/PhoneEntry";
import OtpVerify from "./screens/auth/OtpVerify";
import LocationPermission from "./screens/auth/LocationPermission";

// Core tabs
import Home from "./screens/Home";
import Explore from "./screens/Explore";
import Requests from "./screens/Requests";
import Profile from "./screens/Profile";

// Discovery
import Search from "./screens/Search";
import MapView from "./screens/MapView";
import CategoryListing from "./screens/CategoryListing";
import AllCategories from "./screens/AllCategories";
import Notifications from "./screens/Notifications";
import Bookmarks from "./screens/Bookmarks";
import Settings from "./screens/Settings";

// Detail
import BusinessDetail from "./screens/business/BusinessDetail";
import ProviderDetail from "./screens/provider/ProviderDetail";
import RequestDetail from "./screens/requests/RequestDetail";

// Pillar C flows
import AskCompose from "./screens/requests/AskCompose";
import SubmitProposal from "./screens/requests/SubmitProposal";
import AgreementScreen from "./screens/requests/AgreementScreen";
import Agreements from "./screens/requests/Agreements";
import RateScreen from "./screens/requests/RateScreen";

// Onboarding
import BusinessOnboard from "./screens/business/BusinessOnboard";
import ProviderOnboard from "./screens/provider/ProviderOnboard";

// Chat
import ConversationList from "./screens/chat/ConversationList";
import ChatThread from "./screens/chat/ChatThread";

// Social & community
import CommunityHub from "./screens/CommunityHub";
import StoryCompose from "./screens/StoryCompose";
import Community from "./screens/Community";
import CommunityCompose from "./screens/CommunityCompose";
import CommunityPostDetail from "./screens/CommunityPostDetail";
import Neighborhood from "./screens/Neighborhood";
import AvailableNow from "./screens/AvailableNow";
import Wallet from "./screens/Wallet";
import Lists from "./screens/Lists";
import PublicProfile from "./screens/PublicProfile";
import Leaderboard from "./screens/Leaderboard";
import Achievements from "./screens/Achievements";

// Manage hub
import ManageHub from "./screens/manage/ManageHub";

// Business console
import ManageDashboard from "./screens/business/manage/ManageDashboard";
import CatalogManager from "./screens/business/manage/CatalogManager";
import ProfileEditor from "./screens/business/manage/ProfileEditor";
import HoursEditor from "./screens/business/manage/HoursEditor";
import OffersManager from "./screens/business/manage/OffersManager";
import PhotosManager from "./screens/business/manage/PhotosManager";
import StoryComposer from "./screens/business/manage/StoryComposer";
import QueueManager from "./screens/business/manage/QueueManager";
import LoyaltySetup from "./screens/business/manage/LoyaltySetup";
import QnaManager from "./screens/business/manage/QnaManager";
import ReviewsManager from "./screens/business/manage/ReviewsManager";
import Reservations from "./screens/business/manage/Reservations";
import LeadsInbox from "./screens/business/manage/LeadsInbox";
import Promote from "./screens/business/manage/Promote";
import VerificationCenter from "./screens/business/manage/VerificationCenter";
import BusinessSettings from "./screens/business/manage/BusinessSettings";
import BusinessRequests from "./screens/business/manage/BusinessRequests";

// Provider console
import ProviderDashboard from "./screens/provider/manage/ProviderDashboard";
import ProviderProfileEditor from "./screens/provider/manage/ProviderProfileEditor";
import ProviderAvailability from "./screens/provider/manage/ProviderAvailability";
import ProviderPackages from "./screens/provider/manage/ProviderPackages";
import ProviderPortfolio from "./screens/provider/manage/ProviderPortfolio";
import ProviderLeads from "./screens/provider/manage/ProviderLeads";
import ProviderSettings from "./screens/provider/manage/ProviderSettings";

// Admin
import AdminPanel from "./screens/admin/AdminPanel";
import TrackingPage from "./screens/TrackingPage";

// Society / Subscriptions / Pro
import SocietyScreen from "./screens/society/SocietyScreen";
import SubscriptionManager from "./screens/subscriptions/SubscriptionManager";
import SubscriptionDetail from "./screens/subscriptions/SubscriptionDetail";
import NewSubscription from "./screens/subscriptions/NewSubscription";
import BusinessProUpgrade from "./screens/monetization/BusinessProUpgrade";

// Routes that show the bottom navigation bar
const TAB_ROUTES = ["/home", "/map", "/explore", "/chats", "/requests", "/community-hub", "/community", "/profile"];
// Routes accessible without authentication
const PUBLIC_ROUTES = ["/", "/auth/phone", "/auth/otp", "/auth/location"];
// Routes that should redirect away if the user is already signed in
const AUTH_SCREENS = ["/", "/auth/phone", "/auth/otp"];

// Brief full-screen loader shown while the initial Supabase session resolves
// (including the OAuth / magic-link code→session exchange after a redirect).
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
        background: "linear-gradient(160deg, #8b47f5 0%, #7c3aed 55%, #4c1d95 100%)",
        color: "#fff",
      }}
    >
      <svg width="56" height="56" viewBox="0 0 64 64">
        <path d="M32 11 C21.5 11 13 19.5 13 30 C13 43 32 56 32 56 C32 56 51 43 51 30 C51 19.5 42.5 11 32 11 Z" fill="#fff" />
        <path d="M32 41 C24 35 40 24 32 17" stroke="#7c3aed" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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

function Protected({ children }: { children: ReactNode }) {
  const { isAuthed, authReady, user } = useApp();
  const location = useLocation();

  // Allow Supabase OAuth / magic-link to land and parse its token before any redirect.
  const isAuthCallback =
    window.location.hash.includes("access_token=") ||
    window.location.hash.includes("error=") ||
    window.location.search.includes("code=");

  // Wait for the initial session check (and any OAuth code→session exchange) to
  // finish before deciding anything. Without this, a Google/email redirect is
  // bounced to /auth/phone during the async callback and the login "fails".
  if ((!authReady || isAuthCallback) && !isAuthed && !PUBLIC_ROUTES.includes(location.pathname) && !location.pathname.startsWith("/track/")) {
    return <AuthSplash />;
  }

  // Unauthenticated users go straight to login — not the marketing splash.
  // Remember the page they were trying to reach (e.g. a shared /map link) so we
  // can return them there after sign-in instead of dropping them on /home.
  if (!isAuthed && !PUBLIC_ROUTES.includes(location.pathname) && !location.pathname.startsWith("/track/") && !isAuthCallback) {
    returnTo.remember(location.pathname + location.search);
    return <Navigate to="/auth/phone" replace />;
  }

  // Authenticated users should never see the auth/splash screens — send them to
  // wherever they were originally headed (defaults to /home).
  if (isAuthed && AUTH_SCREENS.includes(location.pathname) && !isAuthCallback) {
    return <Navigate to={returnTo.consume()} replace />;
  }

  // New user with no location: prompt once per session, then let them skip freely.
  // sessionStorage flag is set by LocationPermission on mount so the redirect
  // doesn't re-fire after the user taps "Skip for now".
  const locationSeen = sessionStorage.getItem("locationPromptShown") === "true";
  const needsLocation = isAuthed && user.id && !user.lat && !user.area && location.pathname === "/home" && !locationSeen;
  if (needsLocation) {
    return <Navigate to="/auth/location" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const { toast } = useApp();
  const showNav = TAB_ROUTES.includes(location.pathname);

  return (
    <div className="app-shell">
      <Protected>
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/auth/phone" element={<PhoneEntry />} />
          <Route path="/auth/otp" element={<OtpVerify />} />
          <Route path="/auth/location" element={<LocationPermission />} />

          <Route path="/home" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/profile" element={<Profile />} />

          <Route path="/search" element={<Search />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/categories" element={<AllCategories />} />
          <Route path="/category/:id" element={<CategoryListing />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/settings" element={<Settings />} />

          <Route path="/business/:id" element={<BusinessDetail />} />
          <Route path="/provider/:id" element={<ProviderDetail />} />
          <Route path="/request/:id" element={<RequestDetail />} />

          <Route path="/ask" element={<AskCompose />} />
          <Route path="/request/:id/propose" element={<SubmitProposal />} />
          <Route path="/agreement/:id" element={<AgreementScreen />} />
          <Route path="/agreements" element={<Agreements />} />
          <Route path="/rate/:id" element={<RateScreen />} />

          <Route path="/onboard/business" element={<BusinessOnboard />} />
          <Route path="/onboard/provider" element={<ProviderOnboard />} />
          <Route path="/manage" element={<ManageHub />} />

          {/* Business console */}
          <Route path="/business/:id/manage" element={<ManageDashboard />} />
          <Route path="/business/:id/manage/catalog" element={<CatalogManager />} />
          <Route path="/business/:id/manage/profile" element={<ProfileEditor />} />
          <Route path="/business/:id/manage/hours" element={<HoursEditor />} />
          <Route path="/business/:id/manage/offers" element={<OffersManager />} />
          <Route path="/business/:id/manage/photos" element={<PhotosManager />} />
          <Route path="/business/:id/manage/story" element={<StoryComposer />} />
          <Route path="/business/:id/manage/queue" element={<QueueManager />} />
          <Route path="/business/:id/manage/loyalty" element={<LoyaltySetup />} />
          <Route path="/business/:id/manage/qna" element={<QnaManager />} />
          <Route path="/business/:id/manage/reviews" element={<ReviewsManager />} />
          <Route path="/business/:id/manage/reservations" element={<Reservations />} />
          <Route path="/business/:id/manage/inbox" element={<LeadsInbox />} />
          <Route path="/business/:id/manage/promote" element={<Promote />} />
          <Route path="/business/:id/manage/verify" element={<VerificationCenter />} />
          <Route path="/business/:id/manage/settings" element={<BusinessSettings />} />
          <Route path="/business/:id/manage/requests" element={<BusinessRequests />} />

          {/* Provider console */}
          <Route path="/provider/:id/manage" element={<ProviderDashboard />} />
          <Route path="/provider/:id/manage/profile" element={<ProviderProfileEditor />} />
          <Route path="/provider/:id/manage/availability" element={<ProviderAvailability />} />
          <Route path="/provider/:id/manage/packages" element={<ProviderPackages />} />
          <Route path="/provider/:id/manage/portfolio" element={<ProviderPortfolio />} />
          <Route path="/provider/:id/manage/leads" element={<ProviderLeads />} />
          <Route path="/provider/:id/manage/verify" element={<ProviderSettings />} />
          <Route path="/provider/:id/manage/settings" element={<ProviderSettings />} />

          {/* Chat */}
          <Route path="/chats" element={<ConversationList />} />
          <Route path="/chat/:id" element={<ChatThread />} />

          {/* Community + social */}
          <Route path="/story/new" element={<StoryCompose />} />
          <Route path="/community-hub" element={<CommunityHub />} />
          <Route path="/community" element={<Community />} />
          <Route path="/community/new" element={<CommunityCompose />} />
          <Route path="/community/:id" element={<CommunityPostDetail />} />
          <Route path="/neighborhood" element={<Neighborhood />} />
          <Route path="/available" element={<AvailableNow />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/lists" element={<Lists />} />
          <Route path="/u/:id" element={<PublicProfile />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/achievements" element={<Achievements />} />

          {/* Society / Subscriptions / Pro */}
          <Route path="/society" element={<SocietyScreen />} />
          <Route path="/subscriptions" element={<SubscriptionManager />} />
          <Route path="/subscriptions/new" element={<NewSubscription />} />
          <Route path="/subscriptions/:id" element={<SubscriptionDetail />} />
          <Route path="/pro-upgrade/business/:id" element={<BusinessProUpgrade />} />

          {/* Admin */}
          <Route path="/admin" element={<AdminPanel />} />

          {/* Catch-all: redirect unknown paths to home */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Protected>

      {/* Public routes — no auth needed */}
      <Routes>
        <Route path="/track/:token" element={<TrackingPage />} />
        <Route path="*" element={null} />
      </Routes>

      {showNav && <BottomNav />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
