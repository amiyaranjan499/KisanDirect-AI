export const initialFilters = { search: "", category: "", quality: "", min_price: "", max_price: "", min_rating: "", sort: "newest", page: 1, page_size: 9 };

export function unavailable(value) {
  return value === null || value === undefined || value === "" ? "Unavailable" : value;
}

export function formatLocationLabel(location) {
  if (!location) return "Farm location available";
  const parts = [location.village, location.city, location.state, location.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Farm location available";
}

export function validateListingForm(form, translate = (key) => key) {
  const errors = {};
  if (!form.crop_name.trim()) errors.crop_name = "Crop name is required.";
  if (!form.unit.trim()) errors.unit = "Unit is required.";
  if (!form.quantity || Number(form.quantity) <= 0) errors.quantity = "Quantity must be greater than zero.";
  if (!form.asking_price || Number(form.asking_price) < 0) errors.asking_price = "Price cannot be negative.";
  const hasLatitude = form.latitude !== "" && form.latitude !== null && form.latitude !== undefined;
  const hasLongitude = form.longitude !== "" && form.longitude !== null && form.longitude !== undefined;
  if (!hasLatitude || !hasLongitude) errors.location = translate("locationRequired") || "Location required.";
  else if (!Number.isFinite(Number(form.latitude)) || Number(form.latitude) < -90 || Number(form.latitude) > 90) errors.location = "Latitude must be between -90 and 90.";
  else if (!Number.isFinite(Number(form.longitude)) || Number(form.longitude) < -180 || Number(form.longitude) > 180) errors.location = "Longitude must be between -180 and 180.";
  return errors;
}
