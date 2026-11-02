import { updateConsumerProfile } from "./api";

const STORAGE_KEY = "kisandirect_realtime_location";
const listeners = new Set();

export function getStoredLocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

export function subscribeLocation(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(loc) {
  listeners.forEach((cb) => {
    try {
      cb(loc);
    } catch {
      // ignore
    }
  });
}

export async function reverseGeocode(latitude, longitude) {
  // 1. Try BigDataCloud reverse geocode client (free, client-side friendly, no auth key)
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    );
    if (res.ok) {
      const data = await res.json();
      const city = data.city || data.locality || data.principalSubdivision || "Current Location";
      const state = data.principalSubdivision || "";
      const pin_code = data.postcode || "";
      const locality = data.locality || "";
      const streetAddress = locality && locality !== city ? `${locality}, ${city}` : `${city}`;
      const fullAddress = `${streetAddress}${state ? `, ${state}` : ""}${pin_code ? ` - ${pin_code}` : ""}`;
      return {
        latitude,
        longitude,
        address: streetAddress,
        address_line: fullAddress,
        city,
        state,
        district: city,
        pin_code,
        formatted: `${city}${state ? `, ${state}` : ""}${pin_code ? ` — ${pin_code}` : ""}`,
      };
    }
  } catch (err) {
    console.warn("BigDataCloud geocode failed:", err);
  }

  // 2. Fallback to OpenStreetMap Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.county || "Current Location";
      const state = addr.state || "";
      const pin_code = addr.postcode || "";
      const road = addr.road || addr.suburb || addr.neighbourhood || addr.residential || "";
      const streetAddress = road ? `${road}, ${city}` : (data.display_name ? data.display_name.split(",").slice(0, 2).join(",").trim() : city);
      const fullAddress = data.display_name || `${streetAddress}${state ? `, ${state}` : ""}${pin_code ? ` - ${pin_code}` : ""}`;
      return {
        latitude,
        longitude,
        address: streetAddress,
        address_line: fullAddress,
        city,
        state,
        district: addr.state_district || city,
        pin_code,
        formatted: `${city}${state ? `, ${state}` : ""}${pin_code ? ` — ${pin_code}` : ""}`,
      };
    }
  } catch (err) {
    console.warn("Nominatim geocode failed:", err);
  }

  return {
    latitude,
    longitude,
    address: `Location (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`,
    address_line: `Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    city: "Current Location",
    state: "",
    district: "",
    pin_code: "",
    formatted: `Location (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`,
  };
}

export async function detectRealLocation(autoSyncProfile = true) {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported by your browser.");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const locationData = await reverseGeocode(latitude, longitude);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(locationData));
          localStorage.setItem("kisandirect_consumer_address", JSON.stringify(locationData));
          notifyListeners(locationData);

          if (autoSyncProfile) {
            updateConsumerProfile({
              address: locationData.address || `${locationData.city}, ${locationData.state}`,
              address_line: locationData.address_line || locationData.formatted,
              city: locationData.city,
              state: locationData.state || null,
              district: locationData.district || locationData.city,
              pin_code: locationData.pin_code && /^\d{6}$/.test(locationData.pin_code) ? locationData.pin_code : null,
            }).catch(() => null);
          }

          resolve(locationData);
        } catch (err) {
          reject(err);
        }
      },
      (error) => {
        let msg = "Unable to retrieve your location.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Location permission denied. Please allow location access or set your address.";
        }
        reject(new Error(msg));
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  });
}

export function setManualLocation(loc, autoSyncProfile = true) {
  const street = loc.address || loc.address_line || `${loc.city || ""}${loc.state ? `, ${loc.state}` : ""}`;
  const locationData = {
    latitude: loc.latitude || 0,
    longitude: loc.longitude || 0,
    address: street,
    address_line: loc.address_line || street,
    city: loc.city || "Current Location",
    state: loc.state || "",
    district: loc.district || loc.city || "",
    pin_code: loc.pin_code || "",
    formatted: `${loc.city || ""}${loc.state ? `, ${loc.state}` : ""}${loc.pin_code ? ` — ${loc.pin_code}` : ""}`,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(locationData));
  localStorage.setItem("kisandirect_consumer_address", JSON.stringify(locationData));
  notifyListeners(locationData);

  if (autoSyncProfile) {
    updateConsumerProfile({
      address: locationData.address,
      address_line: locationData.address_line,
      city: locationData.city,
      state: locationData.state || null,
      district: locationData.district || null,
      pin_code: locationData.pin_code && /^\d{6}$/.test(locationData.pin_code) ? locationData.pin_code : null,
    }).catch(() => null);
  }

  return locationData;
}

