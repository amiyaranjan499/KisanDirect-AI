import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../i18n";
import { getListing, getFarmer } from "../services/marketplaceApi";
import Marketplace from "../marketplace/Marketplace";
import ProductDetail from "../marketplace/ProductDetail";
import ProductCard from "../marketplace/ProductCard";
import AppFrame from "./AppFrame";
import ProtectedRoute from "./ProtectedRoute";
import RoleGuard from "./RoleGuard";
import FarmerDashboard from "../farmer/FarmerDashboard";
import FarmerAddCrop from "../farmer/FarmerAddCrop";
import FarmerReviews from "../farmer/FarmerReviews";
import FarmerProfile from "../farmer/FarmerProfile";
import FarmerCropDetails from "../farmer/FarmerCropDetails";
import FarmerOrderDetails from "../farmer/FarmerOrderDetails";
import FarmerSales from "../farmer/FarmerSales";
import FarmerNotifications from "../farmer/FarmerNotifications";
import HubStaffOperationsPage from "../hubstaff/HubStaffOperationsPage";
import RiderDashboardPage from "../rider/RiderDashboardPage";
import RiderHistoryPage from "../rider/RiderHistoryPage";
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
import CartOrders from "../consumer/ConsumerOrders";
import ConsumerCheckout from "../consumer/ConsumerCheckout";
import ConsumerDashboard from "../consumer/ConsumerDashboard";
import ConsumerProfile from "../consumer/ConsumerProfile";
import ConsumerNotifications from "../consumer/ConsumerNotifications";
import ConsumerPaymentMethods from "../consumer/ConsumerPaymentMethods";
import ConsumerSettings from "../consumer/ConsumerSettings";
import NearbyFarmers from "../maps/NearbyFarmersMap";
import Login from "../auth/Login";
import RegisterPage from "../auth/RegisterPage";
import AdminLogin from "../admin/AdminLogin";
import { getConsumerProfile, orderRequest } from "../services/api";

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
  return <ProductDetail item={item} consumerProfile={reviewContext.profile} orders={reviewContext.orders} onFarmer={(farmer) => navigate(`/c/${farmer.id}`)} />;
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
  return <section className="detail-view farmer-detail-page"><button className="back-button" onClick={() => navigate(-1)}>← Back</button><div className="farmer-reference-image"><img src="/assets/images/image8.png" alt="Farmer and fresh produce" /></div><div className="consumer-screen-header"><span className="eyebrow">Local farmer</span><h1>{farmer.name}</h1><p>Explore current listings from this farmer.</p><div className="reference-chip-row"><span><i className="bi bi-geo-alt" /> {farmer.location || "Location unavailable"}</span><span><i className="bi bi-basket2" /> {listings.length} listings</span></div></div>{listings.length ? <div className="listing-grid">{listings.map((item) => <ProductCard key={item.id} item={item} onOpen={(listingId) => navigate(`/p/${listingId}`)} />)}</div> : <div className="empty"><h2>No active listings</h2><p>This farmer has no listings available right now.</p></div>}</section>;
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

export default function RouterApp({ user, logout, onAuthenticated }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <Routes>
      <Route path="/login" element={<Login onAuthenticated={onAuthenticated} language={language} setLanguage={setLanguage} t={t} />} />
      <Route path="/register" element={<RegisterPage language={language} setLanguage={setLanguage} t={t} />} />
      <Route path="/admin/login" element={<AdminLogin onAuthenticated={(token) => onAuthenticated(token, "/admin/dashboard")} language={language} setLanguage={setLanguage} />} />
      <Route element={<ProtectedRoute user={user} />}>
        <Route element={<AppFrame user={user} logout={logout} />}>
          <Route path="/" element={user?.role === "RIDER" ? <Navigate to="/rider/dashboard" replace /> : <Marketplace user={user} />} />
          <Route path="/p/:id" element={<ListingRoute user={user} />} />
          <Route path="/c/:slug" element={<FarmerRoute />} />
          <Route path="/farmers" element={<NearbyFarmersRoute />} />
          <Route path="/consumer/dashboard" element={<ConsumerDashboard />} />
          <Route path="/cart" element={<CartOrders />} />
          <Route path="/checkout" element={<ConsumerCheckout />} />
          <Route path="/orders" element={<CartOrders />} />
          <Route path="/orders/:id" element={<CartOrders />} />
          <Route path="/notifications" element={<ConsumerNotifications />} />
          <Route path="/payment-methods" element={<ConsumerPaymentMethods />} />
          <Route path="/settings" element={<ConsumerSettings />} />
          <Route path="/profile" element={<ConsumerProfileRoute logout={logout} />} />
          <Route element={<RoleGuard user={user} roles={["FARMER"]} />}>
            <Route path="/farmer/dashboard" element={<FarmerDashboard />} />
            <Route path="/farmer/crops" element={<FarmerCropDetails />} />
            <Route path="/farmer/crops/new" element={<FarmerAddCrop />} />
            <Route path="/farmer/orders" element={<FarmerOrderDetails />} />
            <Route path="/farmer/sales" element={<FarmerSales />} />
            <Route path="/farmer/reviews" element={<FarmerReviews />} />
            <Route path="/farmer/notifications" element={<FarmerNotifications />} />
            <Route path="/farmer/profile" element={<FarmerProfile />} />
          </Route>
          <Route element={<RoleGuard user={user} roles={["HUB_STAFF"]} />}>
            <Route path="/hub-staff/operations" element={<HubStaffOperationsPage />} />
          </Route>
          <Route element={<RoleGuard user={user} roles={["RIDER"]} />}>
            <Route path="/rider/dashboard" element={<RiderDashboardPage />} />
            <Route path="/rider/history" element={<RiderHistoryPage />} />
          </Route>
          <Route element={<RoleGuard user={user} roles={["ADMIN"]} />}>
            <Route element={<AdminShell user={user} logout={logout} />}>
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
