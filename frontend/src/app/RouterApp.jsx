import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../i18n";
import { getListing, getFarmer } from "../services/marketplaceApi";
import ConsumerHome from "../consumer/ConsumerHome";
import ConsumerMarketplace from "../consumer/ConsumerMarketplace";
import ProductDetail from "../marketplace/ProductDetail";
import ProductCard from "../marketplace/ProductCard";
import AppFrame from "./AppFrame";
import ProtectedRoute from "./ProtectedRoute";
import RoleGuard from "./RoleGuard";
import FarmerDashboard from "../farmer/FarmerDashboard";
import FarmerShell from "../farmer/components/FarmerShell";
import FarmerAddCrop from "../farmer/FarmerAddCrop";
import FarmerReviews from "../farmer/FarmerReviews";
import FarmerProfile from "../farmer/FarmerProfile";
import FarmerCropDetails from "../farmer/FarmerCropDetails";
import FarmerOrderDetails from "../farmer/FarmerOrderDetails";
import FarmerHubSupply from "../farmer/FarmerHubSupply";
import FarmerStorageStaff from "../farmer/FarmerStorageStaff";
import FarmerMyHub from "../farmer/FarmerMyHub";
import FarmerHubStaff from "../farmer/FarmerHubStaff";
import FarmerDispatchTracking from "../farmer/FarmerDispatchTracking";
import FarmerSales from "../farmer/FarmerSales";
import FarmerNotifications from "../farmer/FarmerNotifications";
import FarmerAIAnalysis from "../farmer/FarmerAIAnalysis";
import FarmerSettings from "../farmer/FarmerSettings";
import FarmerHelp from "../farmer/FarmerHelp";
import FarmerMarketPrices from "../farmer/FarmerMarketPrices";
import FarmerWallet from "../farmer/FarmerWallet";
import HubStaffOperationsPage from "../hubstaff/HubStaffOperationsPage";
import RiderShell from "../rider/RiderShell";
import RiderDashboardPage from "../rider/RiderDashboardPage";
import RiderHistoryPage from "../rider/RiderHistoryPage";
import RiderProfilePage from "../rider/RiderProfilePage";
import AdminShell from "../admin/components/AdminShell";
import AdminDashboardPage from "../admin/pages/AdminDashboardPage";
import AdminUsersPage from "../admin/pages/AdminUsersPage";
import AdminFarmersPage from "../admin/pages/AdminFarmersPage";
import AdminListingsPage from "../admin/pages/AdminListingsPage";
import AdminOrdersPage from "../admin/pages/AdminOrdersPage";
import AdminPaymentsPage from "../admin/pages/AdminPaymentsPage";
import AdminDeliveryPage from "../admin/pages/AdminDeliveryPage";
import AdminReviewsPage from "../admin/pages/AdminReviewsPage";
import AdminAnalyticsPage from "../admin/pages/AdminAnalyticsPage";
import AdminRidersPage from "../admin/pages/AdminRidersPage";
import AdminHubsPage from "../admin/pages/AdminHubsPage";
import AdminHubStaffPage from "../admin/pages/AdminHubStaffPage";
import ConsumerCart from "../consumer/ConsumerCart";
import ConsumerOrders from "../consumer/ConsumerOrders";
import ConsumerCheckout from "../consumer/ConsumerCheckout";
import ConsumerDashboard from "../consumer/ConsumerDashboard";
import ConsumerProfile from "../consumer/ConsumerProfile";
import ConsumerNotifications from "../consumer/ConsumerNotifications";
import ConsumerPaymentMethods from "../consumer/ConsumerPaymentMethods";
import ConsumerSettings from "../consumer/ConsumerSettings";
import ConsumerHelp from "../consumer/ConsumerHelp";
import NearbyFarmers from "../consumer/NearbyFarmers";
import Login from "../auth/Login";
import RegisterPage from "../auth/RegisterPage";
import AdminLogin from "../admin/AdminLogin";
import HubStaffLogin from "../hubstaff/HubStaffLogin";
import { getConsumerProfile, orderRequest, mediaUrl } from "../services/api";

function ListingRoute({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [reviewContext, setReviewContext] = useState({ profile: null, orders: [] });
  useEffect(() => { getListing(id).then(setItem).catch((requestError) => setError(requestError.message)); }, [id]);
  useEffect(() => {
    if (user?.role !== "CONSUMER") {
      setReviewContext({ profile: null, orders: [] });
      return;
    }
    Promise.all([getConsumerProfile(), orderRequest("/orders?page_size=50")])
      .then(([profile, orders]) => setReviewContext({ profile, orders: orders.items || [] }))
      .catch(() => setReviewContext({ profile: null, orders: [] }));
  }, [user?.role]);
  if (error) return <section className="detail-view"><div className="error">{error}</div><button className="primary-button" onClick={() => navigate("/")}>Back to marketplace</button></section>;
  if (!item) return <section className="detail-view"><div className="loading"><span className="loading-mark" />Loading listing...</div></section>;
  return (
    <ProductDetail
      item={item}
      consumerProfile={reviewContext.profile}
      orders={reviewContext.orders}
      onFarmer={(farmer) => navigate(`/c/${farmer.id}`)}
      user={user}
      onBack={() => navigate(-1)}
    />
  );
}

function FarmerRoute() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [farmer, setFarmer] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { getFarmer(slug).then(setFarmer).catch((requestError) => setError(requestError.message)); }, [slug]);
  if (error) return <section className="detail-view"><div className="error">{error}</div><button className="primary-button" onClick={() => navigate("/")}>Back to marketplace</button></section>;
  if (!farmer) return <section className="detail-view"><div className="loading"><span className="loading-mark" />Loading farmer...</div></section>;
  const listings = Array.isArray(farmer.listings) ? farmer.listings : [];
  const cover = farmer.cover_image ? mediaUrl(farmer.cover_image) : null;
  const rawDp = farmer.profile_image || farmer.avatar_url || null;
  const dp = rawDp ? mediaUrl(rawDp) : null;
  const locStr = [farmer.city, farmer.district, farmer.state].filter(Boolean).join(", ") || farmer.address || "Location unavailable";
  return (
    <section className="detail-view farmer-detail-page">
      <button className="back-button" onClick={() => navigate(-1)}>← Back</button>
      <div className="farmer-reference-image" style={{ borderRadius: "16px", overflow: "hidden", minHeight: "180px", maxHeight: "260px", background: "linear-gradient(135deg, #0F4926 0%, #1B6B34 100%)" }}>
        {cover ? (
          <img src={cover} alt={farmer.name} style={{ width: "100%", height: "240px", objectFit: "cover" }} />
        ) : (
          <img src="/assets/images/image8.png" alt="Farmer and fresh produce" style={{ width: "100%", height: "240px", objectFit: "cover" }} />
        )}
      </div>
      <div className="consumer-screen-header" style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginTop: "16px" }}>
        {dp && (
          <img
            src={dp}
            alt={farmer.name}
            style={{
              width: "68px",
              height: "68px",
              borderRadius: "50%",
              objectFit: "cover",
              border: "3px solid #FFFFFF",
              boxShadow: "0 2px 8px rgba(0,0,0,0.16)",
              background: "#FFFFFF",
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1 }}>
          <span className="eyebrow">Local farmer</span>
          <h1 style={{ color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif", fontSize: "28px", fontWeight: 700, margin: "0 0 6px" }}>
            {farmer.name}
          </h1>
          <p>Explore current listings from this farmer.</p>
          <div className="reference-chip-row">
            <span><i className="bi bi-geo-alt" /> {locStr}</span>
            <span><i className="bi bi-basket2" /> {listings.length} listings</span>
            {farmer.rating && <span><i className="bi bi-star-fill text-warning" /> {Number(farmer.rating).toFixed(1)}</span>}
          </div>
        </div>
      </div>
      {listings.length ? (
        <div className="listing-grid">{listings.map((item) => <ProductCard key={item.id} item={item} onOpen={(listingId) => navigate(`/p/${listingId}`)} />)}</div>
      ) : (
        <div className="empty"><h2 style={{ color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif" }}>No active listings</h2><p>This farmer has no listings available right now.</p></div>
      )}
    </section>
  );
}

function NearbyFarmersRoute() {
  const navigate = useNavigate();
  return <NearbyFarmers onFarmer={(farmerId) => farmerId ? navigate(`/c/${farmerId}`) : navigate("/")} />;
}

function ConsumerProfileRoute({ logout }) {
  const navigate = useNavigate();
  return <ConsumerProfile onBack={() => navigate(-1)} onDashboard={() => navigate("/consumer/dashboard")} onNavigate={(target) => {
    const routes = { orders: "/orders", notifications: "/notifications", "payment-methods": "/payment-methods", settings: "/settings" };
    navigate(routes[target] || "/profile");
  }} onLogout={() => { logout(); navigate("/login"); }} />;
}

function NotificationsRoute() {
  const navigate = useNavigate();
  return <ConsumerNotifications onBack={() => navigate(-1)} />;
}

export default function RouterApp({ user, logout, onAuthenticated }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <Routes>
      <Route path="/login" element={<Login onAuthenticated={onAuthenticated} language={language} setLanguage={setLanguage} t={t} />} />
      <Route path="/register" element={<RegisterPage language={language} setLanguage={setLanguage} t={t} />} />
      <Route path="/hub-staff/login" element={<Navigate to="/login" replace />} />
      <Route path="/admin/login" element={<AdminLogin onAuthenticated={(token) => onAuthenticated(token, "/admin/dashboard")} language={language} setLanguage={setLanguage} />} />
      <Route element={<ProtectedRoute user={user} />}>
        <Route element={<AppFrame user={user} logout={logout} />}>
          <Route
            path="/"
            element={
              user?.role === "FARMER" ? (
                <Navigate to="/farmer/dashboard" replace />
              ) : user?.role === "HUB_STAFF" ? (
                <Navigate to="/hub-staff/dashboard" replace />
              ) : user?.role === "RIDER" ? (
                <Navigate to="/rider/dashboard" replace />
              ) : user?.role === "ADMIN" ? (
                <Navigate to="/admin/dashboard" replace />
              ) : (
                <ConsumerHome user={user} />
              )
            }
          />
          <Route path="/marketplace" element={<ConsumerMarketplace user={user} />} />
          <Route path="/p/:id" element={<ListingRoute user={user} />} />
          <Route path="/c/:slug" element={<FarmerRoute />} />
          <Route path="/farmers" element={<NearbyFarmersRoute />} />
          <Route path="/consumer/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/cart" element={<ConsumerCart />} />
          <Route path="/checkout" element={<ConsumerCheckout />} />
          <Route path="/orders" element={<ConsumerOrders />} />
          <Route path="/orders/:id" element={<ConsumerOrders />} />
          <Route path="/notifications" element={<ConsumerNotifications />} />
          <Route path="/payment-methods" element={<ConsumerPaymentMethods />} />
          <Route path="/settings" element={<ConsumerSettings />} />
          <Route path="/help" element={<ConsumerHelp />} />
          <Route path="/reviews" element={<Navigate to="/profile?section=reviews" replace />} />
          <Route path="/addresses" element={<Navigate to="/profile?section=addresses" replace />} />
          <Route path="/profile" element={<ConsumerProfile onLogout={logout} />} />
          <Route element={<RoleGuard user={user} roles={["FARMER"]} />}>
            <Route element={<FarmerShell user={user} logout={logout} />}>
              <Route path="/farmer" element={<Navigate to="/farmer/dashboard" replace />} />
              <Route path="/farmer/dashboard" element={<FarmerDashboard />} />
              <Route path="/farmer/crops" element={<FarmerCropDetails />} />
              <Route path="/farmer/crops/new" element={<FarmerAddCrop />} />
              <Route path="/farmer/crops/:id" element={<FarmerCropDetails />} />
              <Route path="/farmer/orders" element={<FarmerOrderDetails />} />
              <Route path="/farmer/hub" element={<FarmerMyHub />} />
              <Route path="/farmer/my-hub" element={<FarmerMyHub />} />
              <Route path="/farmer/storage-staff" element={<FarmerMyHub />} />
              <Route path="/farmer/staff" element={<FarmerHubStaff />} />
              <Route path="/farmer/hub-supply" element={<Navigate to="/farmer/hub" replace />} />
              <Route path="/farmer/dispatch" element={<Navigate to="/farmer/orders" replace />} />
              <Route path="/farmer/tracking" element={<Navigate to="/farmer/orders" replace />} />
              <Route path="/farmer/sales" element={<FarmerSales />} />
              <Route path="/farmer/reviews" element={<FarmerReviews />} />
              <Route path="/farmer/notifications" element={<FarmerNotifications />} />
              <Route path="/farmer/profile" element={<FarmerProfile onLogout={logout} />} />
              <Route path="/farmer/ai-insights" element={<FarmerAIAnalysis onBack={() => window.history.back()} />} />
              <Route path="/farmer/insights" element={<FarmerAIAnalysis onBack={() => window.history.back()} />} />
              <Route path="/farmer/prices" element={<FarmerMarketPrices onBack={() => window.history.back()} />} />
              <Route path="/farmer/wallet" element={<FarmerWallet />} />
              <Route path="/farmer/settings" element={<FarmerSettings onBack={() => window.history.back()} onLogout={logout} />} />
              <Route path="/farmer/help" element={<FarmerHelp onBack={() => window.history.back()} />} />
              <Route path="/farmer/*" element={<Navigate to="/farmer/dashboard" replace />} />
            </Route>
          </Route>
          <Route element={<RoleGuard user={user} roles={["HUB_STAFF"]} />}>
            <Route path="/hub-staff/dashboard" element={<HubStaffOperationsPage user={user} logout={logout} />} />
            <Route path="/hub-staff/operations" element={<HubStaffOperationsPage user={user} logout={logout} />} />
            <Route path="/hub-staff" element={<Navigate to="/hub-staff/dashboard" replace />} />
          </Route>
          <Route element={<RoleGuard user={user} roles={["RIDER"]} />}>
            <Route element={<RiderShell user={user} logout={logout} />}>
              <Route path="/rider" element={<Navigate to="/rider/dashboard" replace />} />
              <Route path="/rider/dashboard" element={<RiderDashboardPage />} />
              <Route path="/rider/history" element={<RiderHistoryPage />} />
              <Route path="/rider/profile" element={<RiderProfilePage onLogout={logout} />} />
              <Route path="/rider/*" element={<Navigate to="/rider/dashboard" replace />} />
            </Route>
          </Route>
          <Route element={<RoleGuard user={user} roles={["ADMIN"]} />}>
            <Route element={<AdminShell user={user} logout={logout} />}>
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/farmers" element={<AdminFarmersPage />} />
              <Route path="/admin/listings" element={<AdminListingsPage />} />
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/payments" element={<AdminPaymentsPage />} />
              <Route path="/admin/delivery" element={<AdminDeliveryPage />} />
              <Route path="/admin/riders" element={<AdminRidersPage />} />
              <Route path="/admin/hubs" element={<AdminHubsPage />} />
              <Route path="/admin/hub-staff" element={<AdminHubStaffPage />} />
              <Route path="/admin/reviews" element={<AdminReviewsPage />} />
              <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
              <Route path="/admin/*" element={<Navigate to="/admin/dashboard" replace />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
