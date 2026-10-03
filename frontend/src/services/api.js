const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export function getApiBaseUrl() {
  return API_BASE_URL;
}

function normalizeRequestError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message || /Failed to fetch|NetworkError/i.test(message)) {
    return "Network error. Please check the backend service and try again.";
  }
  return message;
}

async function request(path, options = {}) {
  const token = localStorage.getItem("kisandirect_access_token");
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || payload.message || `Request failed (${response.status})`);
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  } catch (error) {
    throw new Error(normalizeRequestError(error));
  }
}

export function listListings(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) query.set(key, value);
  });
  return request(`/api/v1/marketplace/listings?${query}`);
}

export function getListing(id) {
  return request(`/api/v1/marketplace/listings/${id}`);
}

export function getFarmer(id) {
  return request(`/api/v1/marketplace/farmers/${id}`);
}

export function nearbyFarmers(params) {
  const query = new URLSearchParams(params);
  return request(`/api/v1/marketplace/farmers/nearby?${query}`);
}

export function mediaUrl(path) {
  if (!path) return "";
  const storagePath = typeof path === "string" ? path : path.storage_url;
  if (!storagePath) return "";
  return `${API_BASE_URL}/media/${storagePath.replace(/^\/+/, "")}`;
}

export function registerUser(payload) {
  return request("/api/v1/auth/register", { method: "POST", body: JSON.stringify(payload) });
}

export function loginUser(payload) {
  return request("/api/v1/auth/login", { method: "POST", body: JSON.stringify(payload) });
}

export function getCurrentUser() {
  return request("/api/v1/auth/me");
}

export function getConsumerProfile() {
  return request("/api/v1/consumers/me");
}

export function updateConsumerProfile(payload) {
  return request("/api/v1/consumers/me", { method: "PUT", body: JSON.stringify(payload) });
}

export function getConsumerDashboardSummary() {
  return request("/api/v1/consumers/dashboard/summary");
}

export function getConsumerDashboardOrders() {
  return request("/api/v1/consumers/dashboard/orders");
}

export function getConsumerDashboardPurchaseHistory() {
  return request("/api/v1/consumers/dashboard/purchase-history");
}

export function getConsumerDashboardCartSummary() {
  return request("/api/v1/consumers/dashboard/cart-summary");
}

export function getConsumerDashboardReviews() {
  return request("/api/v1/consumers/dashboard/reviews");
}

export function getConsumerDashboardNotifications() {
  return request("/api/v1/consumers/dashboard/notifications");
}

export function listListingReviews(listingId) {
  return request(`/api/v1/listings/${listingId}/reviews`);
}

export function getFarmerRatingSummary(farmerId) {
  return request(`/api/v1/farmers/${farmerId}/rating-summary`);
}

export function getFarmerProfile() {
  return request("/api/v1/farmers/me");
}

export function updateFarmerProfile(payload) {
  return request("/api/v1/farmers/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listMyFarmerListings() {
  return request("/api/v1/farmers/me/listings");
}

export function createFarmerListing(payload) {
  return request("/api/v1/farmers/me/listings", { method: "POST", body: JSON.stringify(payload) });
}

export function updateFarmerListing(listingId, payload) {
  return request(`/api/v1/farmers/me/listings/${listingId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteFarmerListing(listingId) {
  return request(`/api/v1/farmers/me/listings/${listingId}`, { method: "DELETE" });
}

export function uploadFarmerListingImage(listingId, image) {
  const body = new FormData();
  body.append("image", image);
  return request(`/api/v1/farmers/me/listings/${listingId}/images`, { method: "POST", body, headers: {} });
}

export function getFarmerDashboardSummary() {
  return request("/api/v1/farmers/dashboard/summary");
}

export function listFarmerDashboardListings() {
  return request("/api/v1/farmers/dashboard/listings");
}

export function listFarmerDashboardOrders() {
  return request("/api/v1/farmers/dashboard/orders");
}

export function getFarmerDashboardAnalytics() {
  return request("/api/v1/farmers/dashboard/analytics");
}

export function getFarmerDashboardReviews() {
  return request("/api/v1/farmers/dashboard/reviews");
}

export function getFarmerDashboardAISummary() {
  return request("/api/v1/farmers/dashboard/ai-summary");
}

export function addCartItem(payload) {
  return request("/api/v1/cart/items", { method: "POST", body: JSON.stringify(payload) });
}

export function updateOrderStatus(orderId, status) {
  return request(`/api/v1/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function updateFulfillmentStatus(orderId, status) {
  return request(`/api/v1/orders/${orderId}/fulfillment/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function createQualityPrediction(listingId, image) {
  const body = new FormData();
  body.append("image", image);
  return request(`/api/v1/ai/quality/predict?listing_id=${encodeURIComponent(listingId)}`, {
    method: "POST",
    body,
    headers: {},
  });
}

export function createPricePrediction(listingId, payload) {
  return request(`/api/v1/ai/price/predict?listing_id=${encodeURIComponent(listingId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAdminDashboardSummary() {
  return request("/api/v1/admins/dashboard/summary");
}

export function listAdminFarmers() {
  return request("/api/v1/admins/farmers");
}

export function listAdminConsumers() {
  return request("/api/v1/admins/consumers");
}

export function listAdminListings() {
  return request("/api/v1/admins/listings");
}

export function listAdminOrders() {
  return request("/api/v1/admins/orders");
}

export function listAdminPayments() {
  return request("/api/v1/admins/payments");
}

export function listAdminReviews() {
  return request("/api/v1/admins/reviews");
}

export function listAdminNotifications() {
  return request("/api/v1/admins/notifications");
}

export function listAdminCategories() {
  return request("/api/v1/admins/categories");
}

export function updateAdminUserStatus(userId, payload) {
  return request(`/api/v1/admins/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createReview(payload) {
  return request("/api/v1/reviews", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateReview(reviewId, payload) {
  return request(`/api/v1/reviews/${reviewId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteReview(reviewId) {
  return request(`/api/v1/reviews/${reviewId}`, {
    method: "DELETE",
  });
}

export function cartRequest(path, options = {}) {
  return request(`/api/v1${path}`, options);
}

export function orderRequest(path, options = {}) {
  return request(`/api/v1${path}`, options);
}

export function paymentRequest(path, options = {}) {
  return request(`/api/v1${path}`, options);
}

export function fulfillmentRequest(path, options = {}) {
  return request(`/api/v1${path}`, options);
}

export function listNotifications(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) query.set(key, value);
  });
  return request(`/api/v1/notifications?${query}`);
}

export function getNotification(id) {
  return request(`/api/v1/notifications/${id}`);
}

export function markNotificationRead(id) {
  return request(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead() {
  return request("/api/v1/notifications/read-all", { method: "POST" });
}

export function getAdminAnalytics(range = "30d") {
  const query = new URLSearchParams({ range });
  return request(`/api/v1/admins/analytics?${query}`);
}

export function listConsumerPaymentMethods() {
  return request("/api/v1/consumers/payment-methods");
}

export function addConsumerPaymentMethod(payload) {
  return request("/api/v1/consumers/payment-methods", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeConsumerPaymentMethod(paymentMethodId) {
  return request(`/api/v1/consumers/payment-methods/${encodeURIComponent(paymentMethodId)}`, {
    method: "DELETE",
  });
}
