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
import AdminDashboard from "../admin/AdminDashboard";
import CartOrders from "../consumer/ConsumerOrders";
import ConsumerCheckout from "../consumer/ConsumerCheckout";
import ConsumerDashboard from "../consumer/ConsumerDashboard";
import ConsumerProfile from "../consumer/ConsumerProfile";
import ConsumerNotifications from "../consumer/ConsumerNotifications";
import Login from "../auth/Login";
import AdminLogin from "../admin/AdminLogin";

function ListingRoute() { const { id } = useParams(); const navigate = useNavigate(); const [item, setItem] = useState(null); useEffect(() => { getListing(id).then(setItem); }, [id]); return item ? <ProductDetail item={item} onFarmer={(farmer) => navigate(`/c/${farmer.id}`)} /> : <div className="loading">Loading...</div>; }
function FarmerRoute() { const { slug } = useParams(); const navigate = useNavigate(); const [farmer, setFarmer] = useState(null); useEffect(() => { getFarmer(slug).then(setFarmer); }, [slug]); return farmer ? <section className="detail-view"><button className="back-button" onClick={() => navigate(-1)}>Back</button><h1>{farmer.name}</h1><div className="listing-grid">{farmer.listings.map((item) => <ProductCard key={item.id} item={item} onOpen={(id) => navigate(`/p/${id}`)} />)}</div></section> : <div className="loading">Loading...</div>; }

export default function RouterApp({ user, logout, onAuthenticated }) {
  const { language, setLanguage, t } = useI18n();
  return <Routes><Route path="/login" element={<Login onAuthenticated={onAuthenticated} language={language} setLanguage={setLanguage} t={t} />} /><Route path="/admin/login" element={<AdminLogin onAuthenticated={(token) => onAuthenticated(token, "/admin/dashboard")} language={language} setLanguage={setLanguage} />} /><Route element={<ProtectedRoute user={user} />}><Route element={<AppFrame user={user} logout={logout} />}><Route path="/" element={<Marketplace user={user} />} /><Route path="/p/:id" element={<ListingRoute />} /><Route path="/c/:slug" element={<FarmerRoute />} /><Route path="/consumer/dashboard" element={<ConsumerDashboard />} /><Route path="/cart" element={<CartOrders />} /><Route path="/checkout" element={<ConsumerCheckout />} /><Route path="/orders" element={<CartOrders />} /><Route path="/orders/:id" element={<CartOrders />} /><Route path="/notifications" element={<ConsumerNotifications />} /><Route path="/profile" element={<ConsumerProfile />} /><Route element={<RoleGuard user={user} roles={["FARMER"]} />}><Route path="/farmer/dashboard" element={<FarmerDashboard />} /><Route path="/farmer/crops" element={<FarmerCropDetails />} /><Route path="/farmer/crops/new" element={<FarmerAddCrop />} /><Route path="/farmer/orders" element={<FarmerOrderDetails />} /><Route path="/farmer/sales" element={<FarmerSales />} /><Route path="/farmer/reviews" element={<FarmerReviews />} /><Route path="/farmer/notifications" element={<FarmerNotifications />} /><Route path="/farmer/profile" element={<FarmerProfile />} /></Route><Route element={<RoleGuard user={user} roles={["ADMIN"]} />}><Route path="/admin/dashboard" element={<AdminDashboard />} /><Route path="/admin/*" element={<AdminDashboard />} /></Route></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
