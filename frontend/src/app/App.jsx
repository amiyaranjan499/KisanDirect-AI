import { useEffect, useMemo, useState } from "react";
import {
  createReview,
  deleteReview,
  addCartItem,
  createFarmerListing,
  createPricePrediction,
  createQualityPrediction,
  getCurrentUser,
  getAdminDashboardSummary,
  getConsumerProfile,
  getFarmer,
  getFarmerProfile,
  getFarmerDashboardAISummary,
  getFarmerDashboardAnalytics,
  getFarmerDashboardReviews,
  getFarmerDashboardSummary,
  getListing,
  listAdminCategories,
  listAdminConsumers,
  listAdminFarmers,
  listAdminListings,
  listAdminNotifications,
  listAdminOrders,
  listAdminPayments,
  listAdminReviews,
  listFarmerDashboardListings,
  listFarmerDashboardOrders,
  listListingReviews,
  listListings,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  mediaUrl,
  orderRequest,
  updateFulfillmentStatus,
  updateOrderStatus,
  updateAdminUserStatus,
  updateReview,
  uploadFarmerListingImage,
} from "../services/api";
import NearbyFarmers from "../maps/NearbyFarmersMap";
import CartOrders from "../consumer/ConsumerOrders";
import FarmerProfile from "../farmer/FarmerProfile";
import FarmerAIAnalysis from "../farmer/FarmerAIAnalysis";
import FarmerCropDetails from "../farmer/FarmerCropDetails";
import FarmerHelp from "../farmer/FarmerHelp";
import FarmerMarketPrices from "../farmer/FarmerMarketPrices";
import FarmerNotifications from "../farmer/FarmerNotifications";
import FarmerOrderDetails from "../farmer/FarmerOrderDetails";
import FarmerSales from "../farmer/FarmerSales";
import FarmerSettings from "../farmer/FarmerSettings";
import ConsumerDashboard from "../consumer/ConsumerDashboard";
import ConsumerProfile from "../consumer/ConsumerProfile";
import ConsumerCheckout from "../consumer/ConsumerCheckout";
import ConsumerNotifications from "../consumer/ConsumerNotifications";
import ConsumerReviews from "../consumer/ConsumerReviews";
import ConsumerSettings from "../consumer/ConsumerSettings";
import ConsumerTracking from "../consumer/ConsumerTracking";
import Login from "../auth/Login";
import AdminLogin from "../admin/AdminLogin";
import { getCurrentRoute, navigateTo, routes } from "./routes";
import { languageOptions, resolveLanguage, useI18n } from "../i18n";

const initialFilters = { search: "", category: "", quality: "", min_price: "", max_price: "", min_rating: "", sort: "newest", page: 1, page_size: 9 };
const initialListingForm = { crop_name: "", crop_category: "", quantity: "", unit: "kg", asking_price: "", description: "", harvest_date: "", latitude: "", longitude: "" };
const unavailable = (value) => value === null || value === undefined || value === "" ? "Unavailable" : value;
const formatLocationLabel = (location) => {
  if (!location) return "Farm location available";
  const parts = [location.village, location.city, location.state, location.country].filter(Boolean);
  if (parts.length) return parts.join(", ");
  if (location.latitude !== undefined && location.longitude !== undefined) return "Farm location available";
  return "Farm location available";
};
const reviewableStatuses = new Set(["COMPLETED", "DELIVERED"]);

function validateListingForm(form, t = (key) => key) {
  const errors = {};

  if (!form.crop_name.trim()) errors.crop_name = "Crop name is required.";
  if (!form.unit.trim()) errors.unit = "Unit is required.";
  if (!form.quantity || Number(form.quantity) <= 0) errors.quantity = "Quantity must be greater than zero.";
  if (!form.asking_price || Number(form.asking_price) < 0) errors.asking_price = "Price cannot be negative.";

  const hasLatitude = form.latitude !== "" && form.latitude !== null && form.latitude !== undefined;
  const hasLongitude = form.longitude !== "" && form.longitude !== null && form.longitude !== undefined;
  if (!hasLatitude || !hasLongitude) {
    errors.location = t("locationRequired") || "Location required.";
  } else {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors.location = "Latitude must be between -90 and 90.";
    else if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors.location = "Longitude must be between -180 and 180.";
  }

  return errors;
}

export function Card({ item, onOpen, onAddToCart }) {
  const image = item.images?.[0];
  return <article className="listing-card" role="button" tabIndex="0" onClick={() => onOpen(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(item.id); } }}>
    <div className="card-image">{image ? <img src={mediaUrl(image)} alt={item.crop_name} /> : <span>Fresh from the farm</span>}</div>
    <div className="card-body"><div className="card-top"><span className="eyebrow">{unavailable(item.category)}</span><span className="status">Available</span></div><h3>{item.crop_name}</h3><p className="muted">{item.farmer_name} · {formatLocationLabel(item.location)}</p><div className="metrics"><span>₹{item.asking_price} / {item.unit}</span><span>{item.quantity} {item.unit}</span></div><div className="submetrics"><span>Quality: {unavailable(item.quality)}</span><span>Rating: {item.farmer_rating ? `${item.farmer_rating.toFixed(1)} / 5` : "Unavailable"}</span><span>AI price: {item.ai_recommended_price ? `₹${item.ai_recommended_price}` : "Unavailable"}</span></div>{onAddToCart && <button className="add-cart-button" onClick={(event) => { event.stopPropagation(); onAddToCart(item); }}>Add to cart</button>}</div>
  </article>;
}

export function Detail({ item, onBack, onFarmer, consumerProfile, orders }) {
  return <section className="detail-view">
    <button className="back-button" onClick={onBack}>← Back to marketplace</button>
    <div className="detail-grid">
      <div className="detail-image">{item.images?.[0] ? <img src={mediaUrl(item.images[0])} alt={item.crop_name} /> : <span>Image unavailable</span>}</div>
      <div className="detail-copy">
        <span className="eyebrow">{unavailable(item.category)}</span>
        <h1>{item.crop_name}</h1>
        <p className="lead">{item.description || "No additional listing description was provided."}</p>
        <button className="farmer-link" onClick={() => onFarmer(item.farmer_id)}>View {item.farmer_name}'s farm →</button>
        <div className="detail-stats">
          <div><b>₹{item.asking_price}</b><span>seller price / {item.unit}</span></div>
          <div><b>{item.quantity} {item.unit}</b><span>available quantity</span></div>
          <div><b>{unavailable(item.ai_recommended_price && `₹${item.ai_recommended_price}`)}</b><span>AI recommended</span></div>
          <div><b>{unavailable(item.quality)}</b><span>quality grade</span></div>
          <div><b>{unavailable(item.farmer_rating && `${item.farmer_rating.toFixed(1)} / 5`)}</b><span>farmer rating</span></div>
          <div><b>{formatLocationLabel(item.location)}</b><span>farm location</span></div>
        </div>
        <p className="muted">Harvest: {item.harvest_date ? new Date(item.harvest_date).toLocaleDateString() : "Unavailable"} · Minimum order: {unavailable(item.minimum_order_quantity)}</p>
      </div>
    </div>
    <ReviewsPanel item={item} consumerProfile={consumerProfile} orders={orders} />
  </section>;
}

export function ReviewsPanel({ item, consumerProfile, orders }) {
  const [reviewsPage, setReviewsPage] = useState({ items: [], total: 0, pages: 0 });
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [formError, setFormError] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [draft, setDraft] = useState({ order_id: "", rating: "5", comment: "" });
  const [submitting, setSubmitting] = useState(false);

  const eligibleOrders = useMemo(
    () => (orders || []).filter((order) => reviewableStatuses.has(order.status) && order.items.some((orderItem) => orderItem.listing_id === item.id)),
    [item.id, orders]
  );
  const myReview = consumerProfile ? reviewsPage.items.find((review) => review.consumer_id === consumerProfile.id) : null;
  const averageRating = reviewsPage.items.length ? reviewsPage.items.reduce((sum, review) => sum + review.rating, 0) / reviewsPage.items.length : null;

  const loadReviews = async () => {
    setLoadingReviews(true);
    try {
      const nextPage = await listListingReviews(item.id);
      setReviewsPage(nextPage);
    } catch (error) {
      setReviewsPage({ items: [], total: 0, pages: 0 });
      setFormError(error.message);
    } finally {
      setLoadingReviews(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [item.id]);

  useEffect(() => {
    if (!consumerProfile) {
      setDraft({ order_id: eligibleOrders[0]?.id || "", rating: "5", comment: "" });
      return;
    }

    if (myReview) {
      setDraft({ order_id: myReview.order_id, rating: String(myReview.rating), comment: myReview.comment });
      return;
    }

    setDraft({ order_id: eligibleOrders[0]?.id || "", rating: "5", comment: "" });
  }, [consumerProfile, eligibleOrders, myReview]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!consumerProfile) {
      setFormError("Connect with a consumer token to submit a review.");
      return;
    }

    const rating = Number(draft.rating);
    const comment = draft.comment.trim();

    if (Number.isNaN(rating) || rating < 1 || rating > 5) {
      setFormError("Rating must be between 1 and 5.");
      return;
    }

    if (!comment) {
      setFormError("Please enter a review comment.");
      return;
    }

    if (!myReview && !draft.order_id) {
      setFormError("Select a completed or delivered order for this listing.");
      return;
    }

    try {
      setSubmitting(true);
      setFormError("");
      setFormStatus("");

      if (myReview) {
        await updateReview(myReview.id, { rating, comment });
        setFormStatus("Your review has been updated.");
      } else {
        await createReview({ listing_id: item.id, order_id: draft.order_id, rating, comment });
        setFormStatus("Your review has been submitted.");
      }

      await loadReviews();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!myReview) {
      return;
    }

    if (!window.confirm("Delete your review for this listing?")) {
      return;
    }

    try {
      setFormError("");
      setFormStatus("");
      await deleteReview(myReview.id);
      setFormStatus("Your review has been removed.");
      setDraft({ order_id: eligibleOrders[0]?.id || "", rating: "5", comment: "" });
      await loadReviews();
    } catch (error) {
      setFormError(error.message);
    }
  };

  return <section className="reviews-panel">
    <div className="reviews-heading">
      <div>
        <span className="eyebrow">Ratings & reviews</span>
        <h2>Listing feedback</h2>
      </div>
      <div className="reviews-summary">
        <b>{averageRating ? `${averageRating.toFixed(1)} / 5` : "No ratings yet"}</b>
        <span>{reviewsPage.total} review{reviewsPage.total === 1 ? "" : "s"}</span>
      </div>
    </div>

    <div className="review-form-wrap">
      {formError && <div className="error">{formError}</div>}
      {formStatus && <div className="success">{formStatus}</div>}

      {!consumerProfile ? (
        <div className="info-box">Connect with a consumer access token to rate and review this listing.</div>
      ) : (
        <form className="review-form" onSubmit={handleSubmit}>
          {!myReview && (
            <label>
              Order to review
              <select value={draft.order_id} onChange={(event) => setDraft({ ...draft, order_id: event.target.value })}>
                <option value="">Select an eligible order</option>
                {eligibleOrders.map((order) => (
                  <option key={order.id} value={order.id}>Order {order.id.slice(0, 8)} · {order.status}</option>
                ))}
              </select>
            </label>
          )}

          <label>
            Rating
            <select value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: event.target.value })}>
              {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}
            </select>
          </label>

          <label>
            Review
            <textarea value={draft.comment} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} rows={4} placeholder="Share your experience with this listing" />
          </label>

          <div className="review-actions">
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Saving..." : myReview ? "Update review" : "Submit review"}
            </button>
            {myReview && (
              <button type="button" className="secondary-button danger" onClick={handleDelete}>Delete review</button>
            )}
          </div>
        </form>
      )}
    </div>

    <div className="review-list">
      {loadingReviews ? <div className="loading">Loading reviews...</div> : null}
      {!loadingReviews && reviewsPage.items.length === 0 ? <div className="empty"><h3>No reviews yet</h3><p>Be the first consumer to leave feedback for this listing.</p></div> : null}
      {!loadingReviews && reviewsPage.items.map((review) => (
        <article className="review-card" key={review.id}>
          <div className="review-header">
            <div>
              <b>{review.reviewer_name}</b>
              <span>{new Date(review.created_at).toLocaleDateString()}</span>
            </div>
            <div className="review-rating">{review.rating}/5</div>
          </div>
          <p>{review.comment}</p>
          {consumerProfile?.id === review.consumer_id && <small className="self-review">Your review</small>}
        </article>
      ))}
    </div>
  </section>;
}

export function Farmer({ farmer, onBack, onOpen }) {
  return <section className="detail-view">
    <button className="back-button" onClick={onBack}>← Back to marketplace</button>
    <div className="farmer-hero">
      <span className="eyebrow">Farmer profile</span>
      <h1>{farmer.name}</h1>
      <p>{formatLocationLabel(farmer.location)} · Rating: {unavailable(farmer.rating && `${farmer.rating.toFixed(1)} / 5`)}</p>
    </div>
    <h2>Active listings</h2>
    <div className="listing-grid">{farmer.listings.length ? farmer.listings.map((item) => <Card key={item.id} item={item} onOpen={onOpen} />) : <div className="empty">No active listings from this farmer.</div>}</div>
  </section>;
}

export function FarmerDashboard({ onBack, onNavigate }) {
  const { t } = useI18n();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [listingForm, setListingForm] = useState(initialListingForm);
  const [listingImage, setListingImage] = useState(null);
  const [listingSaving, setListingSaving] = useState(false);
  const [listingFormErrors, setListingFormErrors] = useState({});
  const [listingStatus, setListingStatus] = useState("");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const [summary, listings, orders, analytics, reviews, aiSummary] = await Promise.all([
        getFarmerDashboardSummary(),
        listFarmerDashboardListings(),
        listFarmerDashboardOrders(),
        getFarmerDashboardAnalytics(),
        getFarmerDashboardReviews(),
        getFarmerDashboardAISummary(),
      ]);
      setDashboard({ summary, listings, orders, analytics, reviews, aiSummary });
    } catch (loadError) {
      setError(loadError.message || "Unable to load the farmer dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

  const handleListingField = (field) => (event) => {
    const nextValue = event.target.value;
    setListingForm((current) => ({ ...current, [field]: nextValue }));
    setListingFormErrors((current) => ({ ...current, [field]: "", location: "" }));
    setListingStatus("");
  };

  const captureFarmLocation = () => {
    if (!navigator.geolocation) {
      setListingStatus(t("locationPermissionDenied") || "Location permission was not granted.");
      setListingFormErrors((current) => ({ ...current, location: t("locationPermissionDenied") || "Location permission was not granted." }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = String(position.coords.latitude);
        const longitude = String(position.coords.longitude);
        setListingForm((current) => ({ ...current, latitude, longitude }));
        setListingFormErrors((current) => ({ ...current, location: "" }));
        setListingStatus(t("locationCaptured") || "📍 Farm location captured");
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? `${t("locationPermissionDenied") || "Location permission was not granted."} ${t("locationProfileHint") || "Update your farm profile location from the Farmer Profile screen."}`
          : t("locationRequired") || "Location required.";
        setListingStatus(message);
        setListingFormErrors((current) => ({ ...current, location: message }));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleListingSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateListingForm(listingForm, t);
    setListingFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setListingStatus(t("locationRequired") || "Please fix the listing form before publishing.");
      return;
    }

    try {
      setListingSaving(true);
      setListingStatus("");

      const payload = {
        crop_name: listingForm.crop_name.trim(),
        crop_category: listingForm.crop_category.trim() || null,
        quantity: Number(listingForm.quantity),
        unit: listingForm.unit.trim(),
        asking_price: Number(listingForm.asking_price),
        description: listingForm.description.trim() || null,
        harvest_date: listingForm.harvest_date ? new Date(listingForm.harvest_date).toISOString() : null,
        location: listingForm.latitude && listingForm.longitude ? {
          latitude: Number(listingForm.latitude),
          longitude: Number(listingForm.longitude),
        } : null,
      };

      const createdListing = await createFarmerListing(payload);
      if (listingImage) {
        await uploadFarmerListingImage(createdListing.id, listingImage);
      }

      let prediction = null;
      if (listingImage) {
        prediction = await createQualityPrediction(createdListing.id, listingImage);
        await createPricePrediction(createdListing.id, { quality_grade: prediction?.quality_label || null });
      }

      setListingForm(initialListingForm);
      setListingImage(null);
      setListingStatus(prediction ? "Listing published and AI quality/price checks were generated." : "Listing published successfully.");
      await loadDashboard();
    } catch (requestError) {
      setListingStatus(requestError.message || "Unable to create this listing.");
    } finally {
      setListingSaving(false);
    }
  };

  const updateFarmerOrder = async (order, nextStatus) => {
    try {
      setUpdatingOrderId(order.id);
      await updateOrderStatus(order.id, nextStatus);
      const nextOrders = await listFarmerDashboardOrders();
      setDashboard((previous) => previous ? { ...previous, orders: nextOrders } : previous);
    } catch (requestError) {
      setError(requestError.message || "Unable to update the order.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const updateFarmerFulfillment = async (order, nextStatus) => {
    try {
      setUpdatingOrderId(order.id);
      await updateFulfillmentStatus(order.id, nextStatus);
      const nextOrders = await listFarmerDashboardOrders();
      setDashboard((previous) => previous ? { ...previous, orders: nextOrders } : previous);
    } catch (requestError) {
      setError(requestError.message || "Unable to update fulfillment.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  if (loading) {
    return <section className="detail-view"><button className="back-button" onClick={onBack}>← {t("back")}</button><div className="loading">{t("loading")}</div></section>;
  }

  if (error) {
    return <section className="detail-view"><button className="back-button" onClick={onBack}>← {t("back")}</button><div className="error">{error}</div></section>;
  }

  const { summary, listings, orders, analytics, reviews, aiSummary } = dashboard || {};
  const totalOrderStatusEntries = analytics ? Object.values(analytics.orders_by_status || {}).reduce((total, value) => total + Number(value || 0), 0) : 0;
  const totalCropSegments = analytics ? Object.keys(analytics.crop_wise_order_count || {}).length : 0;
  const totalCropSales = analytics ? Object.values(analytics.crop_wise_sales || {}).reduce((total, value) => total + Number(value || 0), 0) : 0;
  const qualityAssessments = aiSummary?.quality_assessments?.length || 0;
  const pricePredictions = aiSummary?.price_predictions?.length || 0;

  return <section className="detail-view farmer-dashboard">
    <button className="back-button" onClick={onBack}>← {t("back")}</button>
    <div className="farmer-welcome-card">
      <div>
        <span className="eyebrow">Good morning, farmer!</span>
        <h2>Healthy crops. Better prices.</h2>
        <p>Manage your farm, orders, and earnings in one place.</p>
      </div>
      <img src="/assets/images/image3.jpeg" alt="Farmer with a fresh harvest" />
    </div>
    <div className="farmer-hero">
      <span className="eyebrow">{t("farmerDashboard")}</span>
      <h1>{t("operations")}</h1>
      <p>Live summaries from your real farm listings, orders, reviews, and AI insights.</p>
    </div>

    <div className="detail-stats">
      <div><b>{summary.total_listings}</b><span>Total listings</span></div>
      <div><b>{summary.active_listings}</b><span>Active listings</span></div>
      <div><b>{summary.total_orders_received}</b><span>Orders received</span></div>
      <div><b>{formatCurrency(summary.total_sales)}</b><span>Gross sales</span></div>
      <div><b>{summary.average_rating ? `${summary.average_rating.toFixed(1)} / 5` : "No ratings"}</b><span>Average rating</span></div>
      <div><b>{summary.unread_notification_count}</b><span>Unread notifications</span></div>
    </div>

    <div className="farmer-quick-actions">
      <button onClick={() => document.querySelector(".listing-form-panel")?.scrollIntoView({ behavior: "smooth" })}><i className="bi bi-plus-circle" /><span>Add Crop</span></button>
      <button onClick={() => document.querySelector(".farmer-dashboard-listings")?.scrollIntoView({ behavior: "smooth" })}><i className="bi bi-flower1" /><span>My Crops</span></button>
      <button onClick={() => onNavigate?.("farmer-order-details")}><i className="bi bi-receipt" /><span>Orders</span></button>
      <button onClick={() => onNavigate?.("farmer-ai")}><i className="bi bi-stars" /><span>AI Analysis</span></button>
      <button onClick={() => onNavigate?.("farmer-market-prices")}><i className="bi bi-graph-up-arrow" /><span>Market Prices</span></button>
      <button onClick={() => onNavigate?.("farmer-sales")}><i className="bi bi-bar-chart-line" /><span>Sales</span></button>
    </div>

    <section className="listing-form-panel">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">Add new crop</span>
          <h2>Add New Crop</h2>
        </div>
      </div>
      <form className="listing-form" onSubmit={handleListingSubmit}>
        <div className="listing-form-grid">
          <label>
            Crop Name
            <input value={listingForm.crop_name} onChange={handleListingField("crop_name")} placeholder="e.g. Basmati rice" />
            {listingFormErrors.crop_name && <span className="field-error">{listingFormErrors.crop_name}</span>}
          </label>
          <label>
            Variety (Optional)
            <input value={listingForm.crop_category} onChange={handleListingField("crop_category")} placeholder="e.g. Grains" />
          </label>
          <label>
            Quantity (in Kg)
            <input type="number" min="0.001" step="0.001" value={listingForm.quantity} onChange={handleListingField("quantity")} placeholder="25" />
            {listingFormErrors.quantity && <span className="field-error">{listingFormErrors.quantity}</span>}
          </label>
          <label>
            Unit
            <input value={listingForm.unit} onChange={handleListingField("unit")} placeholder="kg" />
            {listingFormErrors.unit && <span className="field-error">{listingFormErrors.unit}</span>}
          </label>
          <label>
            Price per Kg (₹)
            <input type="number" min="0" step="0.01" value={listingForm.asking_price} onChange={handleListingField("asking_price")} placeholder="4200" />
            {listingFormErrors.asking_price && <span className="field-error">{listingFormErrors.asking_price}</span>}
          </label>
          <label>
            Expected Harvest Date
            <input type="date" value={listingForm.harvest_date} onChange={handleListingField("harvest_date")} />
          </label>
          <div className="listing-wide location-capture-panel">
            <div className="location-header-row">
              <span className="location-label">Location</span>
              {listingForm.latitude && listingForm.longitude && (
                <button type="button" className="secondary-button small-button" onClick={captureFarmLocation}>{t("updateLocation") || "Update Location"}</button>
              )}
            </div>
            <button type="button" className="location-capture-button" onClick={captureFarmLocation}>
              {t("useMyFarmLocation") || "📍 Use My Farm Location"}
            </button>
            {(listingStatus === (t("locationCaptured") || "📍 Farm location captured") || listingForm.latitude && listingForm.longitude) && (
              <div className="location-success">{t("locationCaptured") || "📍 Farm location captured"}</div>
            )}
            {listingFormErrors.location && <div className="field-error">{listingFormErrors.location}</div>}
          </div>
          <label className="listing-wide">
            Description
            <textarea rows="4" value={listingForm.description} onChange={handleListingField("description")} placeholder="Share quality details, freshness notes, and handling information." />
          </label>
          <label className="listing-wide">
            Upload Images (Max 3)
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setListingImage(event.target.files?.[0] || null)} />
          </label>
        </div>
        {listingStatus && !((listingStatus === (t("locationCaptured") || "📍 Farm location captured") || (listingForm.latitude && listingForm.longitude))) && <div className={listingStatus.includes("failed") || listingStatus.includes("Unable") || listingStatus.includes("Please fix") ? "error" : "success"}>{listingStatus}</div>}
        <div className="section-heading-row">
          <span className="eyebrow">AI listing workflow</span>
        </div>
        <div className="listing-form-actions premium-workflow">
          <button type="submit" className="primary-button" disabled={listingSaving}>
            {listingSaving ? t("publishing") || "Publishing..." : "List Crop"}
          </button>
        </div>
      </form>
    </section>

    <div className="listing-grid">
      <div className="card-body">
        <h3>Summary</h3>
        <p className="muted">Pending: {summary.pending_orders} · Confirmed: {summary.confirmed_orders} · Completed: {summary.completed_orders} · Cancelled: {summary.cancelled_orders}</p>
        <p className="muted">Reviews: {summary.total_reviews}</p>
      </div>
    </div>

    <h2>Recent orders</h2>
    <div className="review-list">
      {orders.length ? orders.map((order) => (
        <article className="review-card" key={order.id}>
          <div className="review-header">
            <div>
              <b>{order.consumer_name || "Consumer"}</b>
              <span>{new Date(order.order_date).toLocaleDateString()}</span>
            </div>
            <div className="review-rating">{order.status}</div>
          </div>
          <p>{formatCurrency(order.total_amount)}</p>
          <small>{order.items.length} item(s) · Payment: {order.payment_status || "Unavailable"} · Fulfillment: {order.fulfillment_status || "Not selected"}</small>
          <div className="order-actions">
            {order.status === "PENDING" && <button className="secondary-button" disabled={updatingOrderId === order.id} onClick={() => updateFarmerOrder(order, "CONFIRMED")}>Confirm order</button>}
            {order.status === "CONFIRMED" && <button className="secondary-button" disabled={updatingOrderId === order.id} onClick={() => updateFarmerOrder(order, "COMPLETED")}>Complete order</button>}
            {order.fulfillment_status && order.fulfillment_status !== "DELIVERED" && order.fulfillment_status !== "PICKED_UP" && <select value="" disabled={updatingOrderId === order.id} onChange={(event) => event.target.value && updateFarmerFulfillment(order, event.target.value)}><option value="">Update fulfillment</option><option value="CONFIRMED">Confirmed</option><option value="READY">Ready</option><option value="OUT_FOR_DELIVERY">Out for delivery</option><option value="DELIVERED">Delivered</option><option value="PICKED_UP">Picked up</option></select>}
          </div>
        </article>
      )) : <div className="empty">No orders yet.</div>}
    </div>

    <h2>Listings</h2>
    <div className="listing-grid farmer-dashboard-listings">{listings.length ? listings.map((listing) => (
      <article className="listing-card" key={listing.id}>
        <div className="card-image">{listing.images?.[0] ? <img src={mediaUrl(listing.images[0])} alt={listing.crop_name} /> : <span>Fresh from the farm</span>}</div>
        <div className="card-body">
          <div className="card-top"><span className="eyebrow">{listing.crop_category || "Crop"}</span><span className="status">{listing.availability_status}</span></div>
          <h3>{listing.crop_name}</h3>
          <div className="metrics"><span>₹{Number(listing.asking_price).toFixed(2)} / {listing.unit}</span><span>{listing.quantity} {listing.unit}</span></div>
          <div className="submetrics">
            <span>AI quality: {listing.ai_quality_label || "Unavailable"}</span>
            <span>AI price: {listing.ai_price_predicted_price ? `₹${Number(listing.ai_price_predicted_price).toFixed(2)}` : "Unavailable"}</span>
          </div>
        </div>
      </article>
    )) : <div className="empty">No listings yet.</div>}</div>

    <h2>Farm performance</h2>
    <div className="detail-stats">
      <div><b>{totalOrderStatusEntries}</b><span>Order lifecycle events</span></div>
      <div><b>{totalCropSegments}</b><span>Crop types tracked</span></div>
      <div><b>{formatCurrency(totalCropSales)}</b><span>Combined crop sales</span></div>
    </div>

    <h2>Customer feedback</h2>
    <div className="detail-stats">
      <div><b>{reviews.average_rating ? `${reviews.average_rating.toFixed(1)} / 5` : "No ratings"}</b><span>Average rating</span></div>
      <div><b>{reviews.review_count}</b><span>Total reviews</span></div>
      <div><b>{qualityAssessments}</b><span>Quality checks</span></div>
    </div>
    <div className="review-list">
      {reviews.recent_reviews.length ? reviews.recent_reviews.map((review) => (
        <article className="review-card" key={review.id}>
          <div className="review-header">
            <div><b>{review.reviewer_name}</b><span>{new Date(review.created_at).toLocaleDateString()}</span></div>
            <div className="review-rating">{review.rating}/5</div>
          </div>
          <p>{review.comment}</p>
        </article>
      )) : <div className="empty">No reviews yet.</div>}
    </div>

    <h2>AI insights</h2>
    <div className="detail-stats">
      <div><b>{qualityAssessments}</b><span>Quality assessments</span></div>
      <div><b>{pricePredictions}</b><span>Price predictions</span></div>
      <div><b>{listings.length}</b><span>Active listings</span></div>
    </div>
    <div className="review-list">
      {aiSummary?.quality_assessments?.length ? aiSummary.quality_assessments.map((item) => (
        <article className="review-card" key={item.id}>
          <div className="review-header">
            <div><b>{item.crop_name || "Listing"}</b><span>{new Date(item.created_at).toLocaleDateString()}</span></div>
            <div className="review-rating">{item.prediction_status}</div>
          </div>
          <p>Quality: {item.quality_label || "N/A"} · Confidence: {item.confidence ? `${item.confidence.toFixed(2)}` : "N/A"}</p>
        </article>
      )) : <div className="empty">No quality assessments yet.</div>}
    </div>
  </section>;
}

export function AdminDashboard({ onBack }) {
  const { t } = useI18n();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState(null);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError("");
      try {
        const [summary, farmers, consumers, listings, orders, payments, reviews, notifications, categories] = await Promise.all([
          getAdminDashboardSummary(),
          listAdminFarmers(),
          listAdminConsumers(),
          listAdminListings(),
          listAdminOrders(),
          listAdminPayments(),
          listAdminReviews(),
          listAdminNotifications(),
          listAdminCategories(),
        ]);
        setDashboard({ summary, farmers, consumers, listings, orders, payments, reviews, notifications, categories });
      } catch (loadError) {
        setError(loadError.message || "Unable to load the admin dashboard.");
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

  const handleToggleUserState = async (userId, currentState) => {
    try {
      setUpdatingUserId(userId);
      const nextUser = await updateAdminUserStatus(userId, { is_active: !currentState });
      setDashboard((previous) => {
        if (!previous) {
          return previous;
        }
        return {
          ...previous,
          farmers: previous.farmers.map((item) => item.user_id === userId ? { ...item, is_active: nextUser.is_active } : item),
          consumers: previous.consumers.map((item) => item.user_id === userId ? { ...item, is_active: nextUser.is_active } : item),
        };
      });
    } catch (toggleError) {
      setError(toggleError.message || "Unable to update the user status.");
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (loading) {
    return <section className="detail-view"><button className="back-button" onClick={onBack}>← {t("back")}</button><div className="loading">{t("loading")}</div></section>;
  }

  if (error) {
    return <section className="detail-view"><button className="back-button" onClick={onBack}>← {t("back")}</button><div className="error">{error}</div></section>;
  }

  const { summary, farmers, consumers, listings, orders, payments, reviews, notifications, categories } = dashboard || {};

  return <section className="detail-view admin-dashboard">
    <button className="back-button" onClick={onBack}>← {t("back")}</button>
    <div className="farmer-hero">
      <span className="eyebrow">Admin dashboard</span>
      <h1>Platform overview</h1>
      <p>Live operational data for users, listings, orders, reviews, payments, notifications, and category performance.</p>
    </div>

    <div className="detail-stats admin-stats">
      <div><b>{summary.total_users}</b><span>Total users</span></div>
      <div><b>{summary.active_users}</b><span>Active users</span></div>
      <div><b>{summary.total_farmers}</b><span>Farmers</span></div>
      <div><b>{summary.total_consumers}</b><span>Consumers</span></div>
      <div><b>{summary.total_listings}</b><span>Listings</span></div>
      <div><b>{summary.total_orders}</b><span>Orders</span></div>
      <div><b>{formatCurrency(summary.total_payment_volume)}</b><span>Payment volume</span></div>
      <div><b>{summary.unread_notifications}</b><span>Unread notifications</span></div>
    </div>

    <div className="admin-sections">
      <div className="admin-section">
        <h2>Farmers</h2>
        <div className="admin-list">
          {farmers.map((farmer) => (
            <article className="admin-card" key={farmer.id}>
              <div>
                <h3>{farmer.name}</h3>
                <p>{farmer.email}</p>
              </div>
              <div className="admin-meta">
                <span>{farmer.listing_count} listings</span>
                <span>{farmer.active_listing_count} active</span>
                <span>{farmer.order_count} orders</span>
                <span>{formatCurrency(farmer.total_sales)}</span>
                <button
                  className="secondary-button"
                  disabled={updatingUserId === farmer.user_id}
                  onClick={() => handleToggleUserState(farmer.user_id, farmer.is_active)}
                >
                  {updatingUserId === farmer.user_id ? "Updating..." : farmer.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h2>Consumers</h2>
        <div className="admin-list">
          {consumers.map((consumer) => (
            <article className="admin-card" key={consumer.id}>
              <div>
                <h3>{consumer.name}</h3>
                <p>{consumer.email}</p>
              </div>
              <div className="admin-meta">
                <span>{consumer.order_count} orders</span>
                <span>{formatCurrency(consumer.total_spend)}</span>
                <span>{consumer.review_count} reviews</span>
                <button
                  className="secondary-button"
                  disabled={updatingUserId === consumer.user_id}
                  onClick={() => handleToggleUserState(consumer.user_id, consumer.is_active)}
                >
                  {updatingUserId === consumer.user_id ? "Updating..." : consumer.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h2>Listings</h2>
        <div className="admin-list">
          {listings.map((listing) => (
            <article className="admin-card" key={listing.id}>
              <div>
                <h3>{listing.crop_name}</h3>
                <p>{listing.farmer_name} · {listing.farmer_email}</p>
              </div>
              <div className="admin-meta">
                <span>{listing.category || listing.crop_category || "Uncategorized"}</span>
                <span>{listing.availability_status}</span>
                <span>{formatCurrency(listing.asking_price)} / {listing.unit}</span>
                <span>{listing.ai_quality_label || "No AI quality"}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h2>Orders</h2>
        <div className="admin-list">
          {orders.map((order) => (
            <article className="admin-card" key={order.id}>
              <div>
                <h3>{order.consumer_name || "Consumer"}</h3>
                <p>{order.consumer_email}</p>
              </div>
              <div className="admin-meta">
                <span>{order.status}</span>
                <span>{order.payment_status || "No payment"}</span>
                <span>{order.delivery_status || "No delivery"}</span>
                <span>{formatCurrency(order.total_amount)}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h2>Payments</h2>
        <div className="admin-list">
          {payments.map((payment) => (
            <article className="admin-card" key={payment.id}>
              <div>
                <h3>{payment.consumer_name || "Consumer"}</h3>
                <p>{payment.provider_reference || "No reference"}</p>
              </div>
              <div className="admin-meta">
                <span>{payment.status}</span>
                <span>{payment.payment_method}</span>
                <span>{formatCurrency(payment.amount)}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h2>Reviews</h2>
        <div className="admin-list">
          {reviews.map((review) => (
            <article className="admin-card" key={review.id}>
              <div>
                <h3>{review.consumer_name || "Consumer"}</h3>
                <p>{review.crop_name} · {review.farmer_name}</p>
              </div>
              <div className="admin-meta">
                <span>{review.rating}/5</span>
                <span>{review.comment}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h2>Notifications</h2>
        <div className="admin-list">
          {notifications.map((notification) => (
            <article className="admin-card" key={notification.id}>
              <div>
                <h3>{notification.title}</h3>
                <p>{notification.user_email || "System"}</p>
              </div>
              <div className="admin-meta">
                <span>{notification.notification_type}</span>
                <span>{notification.is_read ? "Read" : "Unread"}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h2>Categories</h2>
        <div className="admin-list">
          {categories.map((category, index) => (
            <article className="admin-card" key={`${category.category || "uncategorized"}-${index}`}>
              <div>
                <h3>{category.category || "Uncategorized"}</h3>
              </div>
              <div className="admin-meta">
                <span>{category.listing_count} listings</span>
                <span>{category.active_listing_count} active</span>
                <span>{category.average_price ? formatCurrency(category.average_price) : "No price"}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  </section>;
}

export default function App() {
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [view, setView] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(localStorage.getItem("kisandirect_access_token") || "");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(token));
  const [profileState, setProfileState] = useState("");
  const [consumerProfile, setConsumerProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pathname, setPathname] = useState(() => getCurrentRoute());

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const { language, setLanguage, t } = useI18n();

  useEffect(() => {
    const handleLocationChange = () => setPathname(getCurrentRoute());
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  const navItems = user ? [
    { label: t("marketplace"), action: () => setView(null), icon: "bi bi-shop-window" },
    ...(user.role === "FARMER" ? [
      { label: t("farmerDashboard"), action: () => setView({ type: "farmer-dashboard" }), icon: "bi bi-speedometer2" },
      { label: t("farmerProfile"), action: () => setView({ type: "farmer-profile" }), icon: "bi bi-person-vcard" },
      { label: "Crop details", action: () => setView({ type: "farmer-crop-details" }), icon: "bi bi-flower1" },
      { label: "Order details", action: () => setView({ type: "farmer-order-details" }), icon: "bi bi-receipt" },
      { label: "Sales & Earnings", action: () => setView({ type: "farmer-sales" }), icon: "bi bi-bar-chart-line" },
      { label: "Market Prices", action: () => setView({ type: "farmer-market-prices" }), icon: "bi bi-graph-up-arrow" },
      { label: "AI Analysis", action: () => setView({ type: "farmer-ai" }), icon: "bi bi-stars" },
      { label: "Notifications", action: () => setView({ type: "farmer-notifications" }), icon: "bi bi-bell-fill" },
      { label: "Settings", action: () => setView({ type: "farmer-settings" }), icon: "bi bi-gear-fill" },
      { label: "Help & Support", action: () => setView({ type: "farmer-help" }), icon: "bi bi-question-circle" },
    ] : []),
    ...(user.role === "CONSUMER" ? [
      { label: t("consumerDashboard"), action: () => setView({ type: "consumer-dashboard" }), icon: "bi bi-grid-1x2-fill" },
      { label: t("consumerProfile") || "Consumer profile", action: () => setView({ type: "consumer-profile" }), icon: "bi bi-person-circle" },
      { label: t("nearby"), action: () => setView({ type: "nearby" }), icon: "bi bi-geo-alt-fill" },
      { label: t("cartOrders"), action: () => setView({ type: "orders" }), icon: "bi bi-bag-check-fill" },
    ] : []),
    ...(user.role === "ADMIN" ? [{ label: t("adminDashboard"), action: () => setView({ type: "admin-dashboard" }), icon: "bi bi-shield-check" }] : []),
    { label: t("cart"), action: () => setView({ type: "orders" }), icon: "bi bi-cart3", iconOnly: true },
  ] : [];

  useEffect(() => {
    if (!token) {
      setUser(null);
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("kisandirect_access_token");
        setToken("");
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, [token]);

  useEffect(() => {
    if (user?.role === "FARMER") {
      setView({ type: "farmer-dashboard" });
      if (pathname !== routes.farmerDashboard) navigateTo(routes.farmerDashboard);
    }
    if (user?.role === "ADMIN") {
      setView({ type: "admin-dashboard" });
      if (pathname !== routes.adminDashboard) navigateTo(routes.adminDashboard);
    }
    if (user?.role === "CONSUMER") {
      if (pathname === routes.consumerDashboard) setView({ type: "consumer-dashboard" });
      if (pathname === routes.adminDashboard || pathname === routes.adminLogin || pathname === routes.farmerDashboard) navigateTo(routes.consumerDashboard);
    }
  }, [pathname, user]);

  useEffect(() => {
    if (!view && user?.role === "CONSUMER") {
      setLoading(true);
      setError("");
      listListings(filters)
        .then(setData)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [filters, view, user]);

  useEffect(() => {
    if (!token || user?.role !== "CONSUMER") {
      setConsumerProfile(null);
      setOrders([]);
      setNotifications([]);
      return;
    }

    const loadConsumerState = async () => {
      try {
        const [nextProfile, nextOrders, nextNotifications] = await Promise.all([
          getConsumerProfile(),
          orderRequest("/orders"),
          listNotifications({ page_size: 20 }),
        ]);
        setConsumerProfile(nextProfile);
        setOrders(nextOrders.items || []);
        setNotifications(nextNotifications.items || []);
      } catch {
        setConsumerProfile(null);
        setOrders([]);
        setNotifications([]);
      }
    };

    loadConsumerState();
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return undefined;
    let active = true;
    const pollNotifications = () => {
      listNotifications({ page_size: 50 }).then((nextNotifications) => {
        if (active) setNotifications(nextNotifications.items || []);
      }).catch(() => {});
    };
    pollNotifications();
    const timer = window.setInterval(pollNotifications, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token, user]);

  useEffect(() => {
    if (!user) {
      setProfileState("");
      return;
    }
    const loadProfileState = user.role === "FARMER" ? getFarmerProfile : user.role === "CONSUMER" ? getConsumerProfile : null;
    if (!loadProfileState) return;
    loadProfileState().then((profile) => {
      const state = profile.state || "";
      setProfileState(state);
      if (!localStorage.getItem("kisandirect_language")) setLanguage(resolveLanguage({ state }));
    }).catch(() => setProfileState(""));
  }, [user]);

  const handleAuthenticated = (nextToken, nextPath) => {
    localStorage.setItem("kisandirect_access_token", nextToken);
    setToken(nextToken);
    setView(null);
    if (nextPath) navigateTo(nextPath);
  };

  const logout = () => {
    localStorage.removeItem("kisandirect_access_token");
    setToken("");
    setUser(null);
    setView(null);
  };

  const addToCart = async (item) => {
    try {
      await addCartItem({ listing_id: item.id, quantity: item.minimum_order_quantity || 1 });
      setError("Added to cart.");
    } catch (requestError) {
      setError(requestError.message || "Unable to add this listing to your cart.");
    }
  };

  if (authLoading) return <main className="auth-shell"><div className="loading">Checking your session...</div></main>;
  if (!user && pathname === routes.adminLogin) return <AdminLogin onAuthenticated={(nextToken) => handleAuthenticated(nextToken, routes.adminDashboard)} language={language} setLanguage={setLanguage} />;
  if (!user) return <Login onAuthenticated={handleAuthenticated} language={language} setLanguage={setLanguage} t={t} />;

  const refreshNotifications = async () => {
    if (!token) {
      return;
    }
    try {
      const nextNotifications = await listNotifications({ page_size: 20 });
      setNotifications(nextNotifications.items || []);
    } catch {
      setNotifications([]);
    }
  };

  const handleMarkNotificationRead = async (notificationId) => {
    try {
      await markNotificationRead(notificationId);
      await refreshNotifications();
    } catch {
      setError("Unable to mark notification as read.");
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await markAllNotificationsRead();
      await refreshNotifications();
    } catch {
      setError("Unable to mark notifications as read.");
    }
  };

  const openListing = (id) => {
    setLoading(true);
    getListing(id)
      .then((item) => setView({ type: "listing", item }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const openFarmer = (id) => {
    setLoading(true);
    getFarmer(id)
      .then((farmer) => setView({ type: "farmer", farmer }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const update = (key) => (event) => setFilters({ ...filters, [key]: event.target.value, page: 1 });

  return <main className={user?.role === "FARMER" ? "farmer-app" : ""}>
    <header className="topbar">
      <div className="topbar-row">
        <div className="brand-group">
          <button className="mobile-menu-button" type="button" aria-label="Toggle navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? "×" : "☰"}</button>
          <div className="brand">
            <img className="brand-logo" src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" />
            <div><b>KisanDirect</b><small>Farm to table, with clarity.</small></div>
          </div>
        </div>

        <div className="header-search">
          <input aria-label="Search crops" placeholder="Search crops..." value={filters.search} onChange={update("search")} />
        </div>

        <div className="topbar-actions">
          <span className="session-user">{user?.email || "Guest"}</span>
          {user && <label className="header-language" title={t("language.label")}><span aria-hidden="true"><i className="bi bi-translate" /></span><select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t("language.label")}>{Object.entries(languageOptions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>}
          {token && (
            <button className="notification-button icon-button" onClick={() => setView({ type: "notifications" })} aria-label={t("notifications")} title={t("notifications")}>
              <i className="bi bi-bell-fill" aria-hidden="true"></i>
              {unreadCount > 0 && <span className="badge-dot">{unreadCount}</span>}
            </button>
          )}
        </div>
      </div>

      {user && (
        <nav className={`header-nav ${mobileMenuOpen ? "open" : ""}`} aria-label="Main navigation">
          {navItems.map((item) => (
            <button key={item.label} type="button" className={`nav-item ${item.iconOnly ? "icon-only" : ""}`} onClick={() => { item.action(); setMobileMenuOpen(false); }} aria-label={item.label} title={item.label}>
              {item.icon && <i className={item.icon} aria-hidden="true"></i>}
              {!item.iconOnly && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
      )}
    </header>
    {user?.role === "CONSUMER" && (
      <nav className="consumer-bottom-nav" aria-label="Consumer navigation">
        {[
          { label: "Home", icon: "bi-house-fill", active: !view, action: () => setView(null) },
          { label: "Market", icon: "bi-shop-window", active: view?.type === "listing" || view?.type === "farmer", action: () => setView(null) },
          { label: "Orders", icon: "bi-receipt", active: view?.type === "orders", action: () => setView({ type: "orders" }) },
          { label: "Nearby", icon: "bi-geo-alt-fill", active: view?.type === "nearby", action: () => setView({ type: "nearby" }) },
          { label: "Profile", icon: "bi-person-fill", active: view?.type === "consumer-profile", action: () => setView({ type: "consumer-profile" }) },
        ].map((item) => (
          <button key={item.label} type="button" className={item.active ? "active" : ""} onClick={item.action}>
            <i className={`bi ${item.icon}`} aria-hidden="true"></i>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    )}
    {user?.role === "FARMER" && (
      <nav className="consumer-bottom-nav farmer-bottom-nav" aria-label="Farmer navigation">
        {[
          { label: "Home", icon: "bi-house-fill", active: !view || view?.type === "farmer-dashboard", action: () => setView({ type: "farmer-dashboard" }) },
          { label: "Crops", icon: "bi-flower1", active: view?.type === "farmer-crop-details", action: () => setView({ type: "farmer-dashboard" }) },
          { label: "Orders", icon: "bi-receipt", active: view?.type === "farmer-order-details", action: () => setView({ type: "farmer-order-details" }) },
          { label: "Market", icon: "bi-graph-up-arrow", active: view?.type === "farmer-market-prices", action: () => setView({ type: "farmer-market-prices" }) },
          { label: "Profile", icon: "bi-person-fill", active: view?.type === "farmer-profile", action: () => setView({ type: "farmer-profile" }) },
        ].map((item) => <button key={item.label} type="button" className={item.active ? "active" : ""} onClick={item.action}><i className={`bi ${item.icon}`} aria-hidden="true" /><span>{item.label}</span></button>)}
      </nav>
    )}
    <div className="page-shell">
      {error && <div className="error">{error}</div>}
      {notificationPanelOpen && token && (
        <aside className="notification-panel">
          <div className="notification-header">
            <h3>{t("notifications")}</h3>
            <button className="secondary-button" onClick={handleMarkAllNotificationsRead}>{t("markAllRead") || "Mark all read"}</button>
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? <div className="empty">{t("noNotifications") || "No notifications yet."}</div> : notifications.map((notification) => (
              <article key={notification.id} className={`notification-item ${notification.is_read ? "read" : "unread"}`}>
                <div>
                  <div className="notification-meta">
                    <span>{notification.notification_type}</span>
                    {!notification.is_read && <span className="notification-dot" />}
                  </div>
                  <h4>{notification.title}</h4>
                  <p>{notification.message}</p>
                </div>
                {!notification.is_read && <button className="secondary-button" onClick={() => handleMarkNotificationRead(notification.id)}>{t("markRead") || "Mark read"}</button>}
              </article>
            ))}
          </div>
        </aside>
      )}
      {view?.type === "listing" ? <Detail item={view.item} onBack={() => setView(null)} onFarmer={openFarmer} consumerProfile={consumerProfile} orders={orders} /> : view?.type === "farmer" ? <Farmer farmer={view.farmer} onBack={() => setView(null)} onOpen={openListing} /> : view?.type === "farmer-dashboard" ? <FarmerDashboard onBack={() => setView(null)} onNavigate={(type) => setView({ type })} /> : view?.type === "farmer-profile" ? <FarmerProfile onBack={() => setView(null)} onDashboard={() => setView({ type: "farmer-dashboard" })} /> : view?.type === "farmer-crop-details" ? <FarmerCropDetails onBack={() => setView({ type: "farmer-dashboard" })} /> : view?.type === "farmer-order-details" ? <FarmerOrderDetails onBack={() => setView({ type: "farmer-dashboard" })} /> : view?.type === "farmer-sales" ? <FarmerSales onBack={() => setView({ type: "farmer-dashboard" })} /> : view?.type === "farmer-market-prices" ? <FarmerMarketPrices onBack={() => setView({ type: "farmer-dashboard" })} /> : view?.type === "farmer-ai" ? <FarmerAIAnalysis onBack={() => setView({ type: "farmer-dashboard" })} /> : view?.type === "farmer-notifications" ? <FarmerNotifications onBack={() => setView({ type: "farmer-dashboard" })} /> : view?.type === "farmer-settings" ? <FarmerSettings onBack={() => setView({ type: "farmer-dashboard" })} onLogout={logout} language={language} setLanguage={setLanguage} languageOptions={languageOptions} /> : view?.type === "farmer-help" ? <FarmerHelp onBack={() => setView({ type: "farmer-dashboard" })} /> : view?.type === "consumer-dashboard" ? <ConsumerDashboard onBack={() => setView(null)} /> : view?.type === "consumer-profile" ? <ConsumerProfile onBack={() => setView(null)} onDashboard={() => setView({ type: "consumer-dashboard" })} onNavigate={(type) => setView({ type })} /> : view?.type === "notifications" ? <ConsumerNotifications onBack={() => setView(null)} /> : view?.type === "reviews" ? <ConsumerReviews onBack={() => setView(null)} /> : view?.type === "settings" ? <ConsumerSettings onBack={() => setView({ type: "consumer-profile" })} onNavigate={(type) => setView({ type })} onLogout={logout} language={language} setLanguage={setLanguage} languageOptions={languageOptions} /> : view?.type === "checkout" ? <ConsumerCheckout onBack={() => setView({ type: "orders" })} onComplete={() => setView({ type: "tracking" })} /> : view?.type === "tracking" ? <ConsumerTracking onBack={() => setView({ type: "orders" })} /> : view?.type === "admin-dashboard" ? <AdminDashboard onBack={() => setView(null)} /> : view?.type === "nearby" ? <NearbyFarmers onFarmer={(id) => id ? openFarmer(id) : setView(null)} /> : view?.type === "orders" ? <CartOrders onBack={() => setView(null)} consumerProfile={consumerProfile} onNavigate={(type) => setView({ type })} /> : <>
        <section className="hero">
          <div>
            <span className="eyebrow">{t("marketplace")}</span>
            <h1>{t("heroTitle")}</h1>
            <p>{t("heroSubtitle")}</p>
          </div>
          <div className="hero-note"><b>{data.total}</b><span>{t("activeListings")}</span></div>
        </section>
        <section className="controls premium-controls">
          <input placeholder={t("searchCrops") || "Search crops..."} value={filters.search} onChange={update("search")} />
          <input placeholder={t("category") || "Category"} value={filters.category} onChange={update("category")} />
          <input placeholder={t("quality") || "Quality"} value={filters.quality} onChange={update("quality")} />
          <input type="number" min="0" placeholder={t("minPrice") || "Budget from"} value={filters.min_price} onChange={update("min_price")} />
          <input type="number" min="0" placeholder={t("maxPrice") || "Budget to"} value={filters.max_price} onChange={update("max_price")} />
          <input type="number" min="0" max="5" step="0.1" placeholder={t("minRating") || "Min rating"} value={filters.min_rating} onChange={update("min_rating")} />
          <select value={filters.sort} onChange={update("sort")}>
            <option value="newest">{t("newest") || "Newest"}</option>
            <option value="price_asc">{t("priceAsc") || "Price: low to high"}</option>
            <option value="price_desc">{t("priceDesc") || "Price: high to low"}</option>
            <option value="nearest">{t("nearest") || "Nearest"}</option>
            <option value="highest_rated">{t("highestRated") || "Highest rated"}</option>
          </select>
        </section>
        {loading ? <div className="loading">{t("loading")}</div> : data.items.length ? <div className="listing-grid">{data.items.map((item) => <Card key={item.id} item={item} onOpen={openListing} onAddToCart={user.role === "CONSUMER" ? addToCart : null} />)}</div> : <div className="empty"><h2>{t("noListings")}</h2><p>{t("tryFilters")}</p></div>}
        {data.pages > 1 && <div className="pagination">
          <button disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page - 1) })}>{t("previous") || "Previous"}</button>
          <span>{t("page") || "Page"} {filters.page} {t("of") || "of"} {data.pages}</span>
          <button disabled={filters.page >= data.pages} onClick={() => setFilters({ ...filters, page: Math.min(data.pages, filters.page + 1) })}>{t("next") || "Next"}</button>
        </div>}
      </>}
    </div>
  </main>;
}
