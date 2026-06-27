import { Routes, Route, useLocation, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import BottomNav from "./components/BottomNav";
import { useApp } from "./store";
import { returnTo } from "./lib/returnTo";

// Auth & onboarding
const Splash = lazy(() => import("./screens/Splash"));
const PhoneEntry = lazy(() => import("./screens/auth/PhoneEntry"));
const OtpVerify = lazy(() => import("./screens/auth/OtpVerify"));
const LocationPermission = lazy(() => import("./screens/auth/LocationPermission"));
const UserOnboard = lazy(() => import("./screens/auth/UserOnboard"));

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

// Onboarding
const BusinessOnboard = lazy(() => import("./screens/business/BusinessOnboard"));
const ProviderOnboard = lazy(() => import("./screens/provider/ProviderOnboard"));
const ManageHub = lazy(() => import("./screens/manage/ManageHub"));

// Chat
const ConversationList = lazy(() => import("./screens/chat/ConversationList"));
const ChatThread = lazy(() => import("./screens/chat/ChatThread"));

// Social & community
const CommunityHub = lazy(() => import("./screens/CommunityHub"));
const StoryCompose = lazy(() => import("./screens/StoryCompose"));
const Community = lazy(() => import("./screens/Community"));
const CommunityCompose = lazy(() => import("./screens/CommunityCompose"));
const CommunityPostDetail = lazy(() => import("./screens/CommunityPostDetail"));
const Neighborhood = lazy(() => import("./screens/Neighborhood"));
const AvailableNow = lazy(() => import("./screens/AvailableNow"));
const Wallet = lazy(() => import("./screens/Wallet"));
const Lists = lazy(() => import("./screens/Lists"));
const PublicProfile = lazy(() => import("./screens/PublicProfile"));
const Leaderboard = lazy(() => import("./screens/Leaderboard"));
const ProfileEdit = lazy(() => import("./screens/ProfileEdit"));
const Achievements = lazy(() => import("./screens/Achievements"));

// Business console
const ManageDashboard = lazy(() => import("./screens/business/manage/ManageDashboard"));
const CatalogManager = lazy(() => import("./screens/business/manage/CatalogManager"));
const ProfileEditor = lazy(() => import("./screens/business/manage/ProfileEditor"));
const HoursEditor = lazy(() => import("./screens/business/manage/HoursEditor"));
const OffersManager = lazy(() => import("./screens/business/manage/OffersManager"));
const PhotosManager = lazy(() => import("./screens/business/manage/PhotosManager"));
const StoryComposer = lazy(() => import("./screens/business/manage/StoryComposer"));
const QueueManager = lazy(() => import("./screens/business/manage/QueueManager"));
const LoyaltySetup = lazy(() => import("./screens/business/manage/LoyaltySetup"));
const QnaManager = lazy(() => import("./screens/business/manage/QnaManager"));
const ReviewsManager = lazy(() => import("./screens/business/manage/ReviewsManager"));
const Reservations = lazy(() => import("./screens/business/manage/Reservations"));
const LeadsInbox = lazy(() => import("./screens/business/manage/LeadsInbox"));
const Promote = lazy(() => import("./screens/business/manage/Promote"));
const VerificationCenter = lazy(() => import("./screens/business/manage/VerificationCenter"));
const BusinessSettings = lazy(() => import("./screens/business/manage/BusinessSettings"));
const BusinessRequests = lazy(() => import("./screens/business/manage/BusinessRequests"));

// Provider console
const ProviderDashboard = lazy(() => import("./screens/provider/manage/ProviderDashboard"));
const ProviderProfileEditor = lazy(() => import("./screens/provider/manage/ProviderProfileEditor"));
const ProviderAvailability = lazy(() => import("./screens/provider/manage/ProviderAvailability"));
const ProviderPackages = lazy(() => import("./screens/provider/manage/ProviderPackages"));
const ProviderPortfolio = lazy(() => import("./screens/provider/manage/ProviderPortfolio"));
const ProviderLeads = lazy(() => import("./screens/provider/manage/ProviderLeads"));
const ProviderSettings = lazy(() => import("./screens/provider/manage/ProviderSettings"));

// Admin
const AdminPanel = lazy(() => import("./screens/admin/AdminPanel"));
const TrackingPage = lazy(() => import("./screens/TrackingPage"));

// Society / Subscriptions / Pro
const SocietyScreen = lazy(() => import("./screens/society/SocietyScreen"));
const SubscriptionManager = lazy(() => import("./screens/subscriptions/SubscriptionManager"));
const SubscriptionDetail = lazy(() => import("./screens/subscriptions/SubscriptionDetail"));
const NewSubscription = lazy(() => import("./screens/subscriptions/NewSubscription"));
const BusinessProUpgrade = lazy(() => import("./screens/monetization/BusinessProUpgrade"));

// Routes that show the bottom navigation bar
const TAB_ROUTES = ["/home", "/map", "/explore", "/chats", "/requests", "/community-hub", "/community", "/profile"];

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

function ProtectedLayout() {
  const { isAuthed, authReady, user } = useApp();
  const location = useLocation();

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

  // New user with no name set: redirect to onboarding first.
  const needsOnboard = isAuthed && user.id && (!user.name || user.name === "New user") && location.pathname !== "/auth/onboard";
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
  const { isAuthed } = useApp();
  const isAuthCallback =
    window.location.hash.includes("access_token=") ||
    window.location.hash.includes("error=") ||
    window.location.search.includes("code=");

  if (isAuthed && !isAuthCallback) {
    return <Navigate to={returnTo.consume()} replace />;
  }

  return <Outlet />;
}

export default function App() {
  const location = useLocation();
  const { toast } = useApp();
  const showNav = TAB_ROUTES.includes(location.pathname);

  return (
    <div className="app-shell">
      <Suspense fallback={<AuthSplash />}>
        <Routes>
          {/* Public only auth routes */}
          <Route element={<PublicOnlyLayout />}>
            <Route path="/" element={<Splash />} />
            <Route path="/auth/phone" element={<PhoneEntry />} />
            <Route path="/auth/otp" element={<OtpVerify />} />
          </Route>

          {/* Completely public / un-guarded routes */}
          <Route path="/track/:token" element={<TrackingPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/auth/onboard" element={<UserOnboard />} />
            <Route path="/auth/location" element={<LocationPermission />} />

            <Route path="/home" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/edit" element={<ProfileEdit />} />

            <Route path="/search" element={<Search />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/categories" element={<AllCategories />} />
            <Route path="/category/:id" element={<CategoryListing />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/bookmarks" element={<Bookmarks />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/support" element={<Support />} />

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
          </Route>
        </Routes>
      </Suspense>

      {showNav && <BottomNav />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
