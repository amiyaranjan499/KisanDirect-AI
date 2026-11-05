import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  analyzeCropQuality,
  classifyCropImage,
  createFarmerListing,
  createPricePrediction,
  createQualityPrediction,
  estimateFairPrice,
  getFarmerProfile,
  getLatestMarketPrice,
  listMyFarmerListings,
  mediaUrl,
  reverseGeocodeLocation,
  updateFarmerListing,
  updateFarmerProfile,
  uploadFarmerListingImage,
} from "../services/api";

const sanitizeProfilePayload = (data) => {
  const payload = {};
  if (data.name && String(data.name).trim()) payload.name = String(data.name).trim();
  if (data.phone && String(data.phone).trim()) payload.phone = String(data.phone).trim();
  if (data.address && String(data.address).trim()) payload.address = String(data.address).trim();
  if (data.city && String(data.city).trim()) payload.city = String(data.city).trim();
  if (data.district && String(data.district).trim()) payload.district = String(data.district).trim();
  if (data.state && String(data.state).trim().length >= 2) payload.state = String(data.state).trim();
  if (data.pin_code && /^\d{6}$/.test(String(data.pin_code).trim())) {
    payload.pin_code = String(data.pin_code).trim();
  }
  if (
    data.location &&
    typeof data.location.latitude === "number" &&
    typeof data.location.longitude === "number" &&
    !isNaN(data.location.latitude) &&
    !isNaN(data.location.longitude)
  ) {
    payload.location = {
      latitude: Number(data.location.latitude),
      longitude: Number(data.location.longitude),
    };
  }
  return payload;
};

const initialForm = {
  crop_name: "",
  crop_category: "",
  quantity: "",
  unit: "kg",
  asking_price: "0",
  harvest_date: new Date().toISOString().slice(0, 10),
  farm_location: "",
  latitude: "",
  longitude: "",
  pincode: "",
  description: "",
};

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function FarmerAddCrop({ onBack }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editingId = searchParams.get("listingId");

  const [form, setForm] = useState(initialForm);
  const [draftId, setDraftId] = useState(null);
  const [imageFiles, setImageFiles] = useState([]);
  const [quality, setQuality] = useState(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [market, setMarket] = useState(null);
  const [price, setPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [locLoading, setLocLoading] = useState(false);
  const [locStatus, setLocStatus] = useState("");

  // AI-first flow states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState("");
  const [cropClassification, setCropClassification] = useState(null);
  const [locationDetails, setLocationDetails] = useState({ state: "", district: "", city: "" });

  // Camera & Photo Selection Modal
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const priceDebounceTimer = useRef(null);

  const [showSourceModal, setShowSourceModal] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("environment");
  const [cameraError, setCameraError] = useState("");

  // Load existing listing if editing
  useEffect(() => {
    if (!editingId) return;
    setLoading(true);
    setError("");
    listMyFarmerListings()
      .then((listings) => {
        const items = Array.isArray(listings) ? listings : listings?.items || [];
        const listing = items.find((item) => String(item.id) === String(editingId));
        if (!listing) {
          setError(`Listing #${editingId} not found or you do not have permission to edit it.`);
          return;
        }
        setDraftId(listing.id);
        setForm({
          crop_name: listing.crop_name || "",
          crop_category: listing.crop_category || "",
          quantity: listing.quantity != null ? String(listing.quantity) : "",
          unit: listing.unit || "kg",
          asking_price: listing.asking_price != null ? String(listing.asking_price) : "0",
          harvest_date: listing.harvest_date ? new Date(listing.harvest_date).toISOString().slice(0, 10) : "",
          farm_location: listing.location ? `${listing.location.latitude}, ${listing.location.longitude}` : "",
          latitude: listing.location?.latitude != null ? String(listing.location.latitude) : "",
          longitude: listing.location?.longitude != null ? String(listing.location.longitude) : "",
          pincode: "",
          description: listing.description || "",
        });
        setImageFiles(
          (listing.images || []).map((image) => ({
            file: null,
            preview: image.storage_url ? mediaUrl(image.storage_url) : "",
            url: image.storage_url ? mediaUrl(image.storage_url) : "",
            name: image.id || "Crop image",
          }))
        );
      })
      .catch((requestError) => setError(requestError.message || "Unable to open listing for editing."))
      .finally(() => setLoading(false));
  }, [editingId]);

  // Location resolution logic
  const resolveLocationDetails = async (lat, lng) => {
    setLocLoading(true);
    setLocStatus(`GPS acquired: ${lat}, ${lng}. Resolving address & pincode...`);
    setForm((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
    }));

    let detectedPin = "";
    let detectedAddress = "";
    let detectedCity = "";
    let detectedDistrict = "";
    let detectedState = "";

    try {
      const result = await reverseGeocodeLocation(lat, lng);
      if (result && (result.pincode || result.locality || result.city || result.formatted)) {
        detectedPin = result.pincode || "";
        detectedCity = result.city || "";
        detectedDistrict = result.district || "";
        detectedState = result.state || "";
        detectedAddress = result.formatted || [result.locality, result.city, result.state].filter(Boolean).join(", ") || `${lat}, ${lng}`;
      }
    } catch (apiError) {
      console.warn("Backend reverse-geocode notice:", apiError);
    }

    if (!detectedAddress || !detectedPin) {
      try {
        const resp = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
        );
        if (resp.ok) {
          const d = await resp.json();
          const clientPin = (d.postcode || "").trim();
          if (!detectedPin && /^\d{6}$/.test(clientPin)) detectedPin = clientPin;
          if (!detectedCity && d.city) detectedCity = d.city;
          if (!detectedDistrict && (d.localityInfo?.administrative?.[2]?.name || d.locality)) {
            detectedDistrict = d.localityInfo?.administrative?.[2]?.name || d.locality;
          }
          if (!detectedState && d.principalSubdivision) detectedState = d.principalSubdivision;
          if (!detectedAddress) {
            detectedAddress = [d.locality, d.city, d.principalSubdivision].filter(Boolean).join(", ") || `${lat}, ${lng}`;
          }
        }
      } catch (clientErr) {
        console.warn("Client reverse-geocode notice:", clientErr);
      }
    }

    const finalAddress = detectedAddress || `${lat}, ${lng}`;
    const formattedWithPin = finalAddress + (detectedPin && !finalAddress.includes(detectedPin) ? ` - ${detectedPin}` : "");

    setLocationDetails({
      state: detectedState,
      district: detectedDistrict,
      city: detectedCity,
    });

    setForm((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      pincode: detectedPin || prev.pincode,
      farm_location: formattedWithPin,
    }));
    setLocStatus(`Auto-detected: ${finalAddress}${detectedPin ? ` (PIN: ${detectedPin})` : ""}`);
    setLocLoading(false);

    try {
      const syncPayload = sanitizeProfilePayload({
        location: { latitude: lat, longitude: lng },
        pin_code: detectedPin,
        city: detectedCity,
        district: detectedDistrict,
        state: detectedState,
        address: finalAddress,
      });
      if (Object.keys(syncPayload).length > 0) {
        await updateFarmerProfile(syncPayload);
      }
    } catch (syncErr) {
      console.warn("Farmer profile auto-sync notice:", syncErr);
    }
  };

  // Location auto-detection on mount
  useEffect(() => {
    if (editingId) return;

    let isMounted = true;
    getFarmerProfile()
      .then((farmerProfile) => {
        if (!isMounted || !farmerProfile) return;
        const profileLat = farmerProfile.location?.latitude;
        const profileLng = farmerProfile.location?.longitude;
        const profilePin = farmerProfile.pin_code || "";
        const profileAddr = farmerProfile.address || [farmerProfile.city, farmerProfile.district, farmerProfile.state].filter(Boolean).join(", ");

        if (profileLat != null && profileLng != null && !isNaN(profileLat) && !isNaN(profileLng)) {
          setLocationDetails({
            state: farmerProfile.state || "",
            district: farmerProfile.district || "",
            city: farmerProfile.city || "",
          });
          setForm((prev) => ({
            ...prev,
            latitude: profileLat,
            longitude: profileLng,
            pincode: profilePin || prev.pincode,
            farm_location: profileAddr || `${profileLat}, ${profileLng}`,
          }));
          setLocStatus(`Location loaded from saved profile: ${profileAddr || `${profileLat}, ${profileLng}`}${profilePin ? ` (PIN: ${profilePin})` : ""}`);
        } else if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isMounted) return;
              const lat = Number(pos.coords.latitude.toFixed(6));
              const lng = Number(pos.coords.longitude.toFixed(6));
              resolveLocationDetails(lat, lng);
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000 }
          );
        }
      })
      .catch(() => {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isMounted) return;
              const lat = Number(pos.coords.latitude.toFixed(6));
              const lng = Number(pos.coords.longitude.toFixed(6));
              resolveLocationDetails(lat, lng);
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000 }
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [editingId]);

  const detectLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocStatus("Geolocation is not supported by your browser.");
      return;
    }
    setLocLoading(true);
    setLocStatus("Acquiring current GPS location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        resolveLocationDetails(lat, lng);
      },
      () => {
        setLocLoading(false);
        setLocStatus("Could not detect location. Please enter coordinates or pincode manually.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Camera handling
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async (facing = "environment") => {
    setCameraError("");
    stopCameraStream();
    try {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (envErr) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      setCameraFacing(facing);
      setCameraActive(true);
      setShowSourceModal(false);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 150);
    } catch (err) {
      console.warn("Camera access error:", err);
      setCameraError("Camera permission denied or camera not available. You can upload photos from your device.");
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const filename = `crop_photo_${Date.now()}.jpg`;
        const file = new File([blob], filename, { type: "image/jpeg" });
        const previewUrl = URL.createObjectURL(blob);
        stopCameraStream();
        setCameraActive(false);
        handlePhotoCapturedOrSelected(file, previewUrl);
      },
      "image/jpeg",
      0.92
    );
  };

  const switchCamera = () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    startCamera(nextFacing);
  };

  const closeCamera = () => {
    stopCameraStream();
    setCameraActive(false);
    setCameraError("");
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
      if (priceDebounceTimer.current) {
        clearTimeout(priceDebounceTimer.current);
      }
    };
  }, []);

  const handleImageSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setShowSourceModal(false);
    if (event.target) event.target.value = "";
    handlePhotoCapturedOrSelected(file, previewUrl);
  };

  const persistListing = async (override = {}) => {
    let locationObj = null;
    if (form.latitude != null && form.latitude !== "" && form.longitude != null && form.longitude !== "") {
      locationObj = {
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      };
    } else if (form.farm_location) {
      const match = form.farm_location.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (match) {
        locationObj = {
          latitude: Number(match[1]),
          longitude: Number(match[2]),
        };
      }
    }

    const descParts = [
      form.pincode ? `PIN: ${form.pincode}` : null,
      form.description?.trim() || null,
    ].filter(Boolean);

    const priceValue = override?.asking_price != null ? Number(override.asking_price) : Number(form.asking_price || 0);

    const rawCropName = override?.crop_name || form.crop_name;
    const finalCropName = (rawCropName && String(rawCropName).trim()) || "Crop identification unavailable";

    const payload = {
      crop_name: finalCropName,
      crop_category: (override?.crop_category !== undefined ? override.crop_category : form.crop_category) || null,
      quantity: Number(override?.quantity != null ? override.quantity : (form.quantity || 10)),
      unit: override?.unit || form.unit || "kg",
      asking_price: priceValue >= 0 ? priceValue : 0,
      description: descParts.join(". ") || null,
      harvest_date: form.harvest_date ? new Date(form.harvest_date).toISOString() : new Date().toISOString(),
      location: locationObj,
    };

    if (editingId) {
      const updated = await updateFarmerListing(editingId, payload);
      return updated;
    }

    const created = await createFarmerListing(payload);
    return created;
  };

  /**
   * Main AI-First Pipeline:
   * Photo captured/selected -> Real Crop Classifier & Visual Quality (concurrent) -> Real APMC Market Price -> Real Fair Price.
   * Runs in-memory ONLY. Does NOT create or persist any listing until the farmer explicitly clicks 'Publish Crop'.
   */
  const handlePhotoCapturedOrSelected = async (file, previewUrl) => {
    if (!file) return;
    setError("");
    setSuccess("");
    setImageFiles([{ file, preview: previewUrl, name: file.name }]);
    setIsAnalyzing(true);
    setAnalysisStep("Analyzing crop and assessing quality...");

    try {
      setQualityLoading(true);

      // 1. Run Crop Classifier AND Crop Quality Assessment concurrently in memory
      const [classifyRes, qualityRes] = await Promise.all([
        classifyCropImage(file).catch((cErr) => {
          console.warn("Crop classification error:", cErr);
          return null;
        }),
        analyzeCropQuality(file).catch((qErr) => {
          console.warn("Quality prediction error:", qErr);
          return {
            prediction_status: "UNAVAILABLE",
            quality_label: null,
            confidence: null,
            model_name: "crop-quality-mobilenet-v2",
            result_metadata: { reason: qErr?.message || "Crop quality assessment model is currently unavailable." },
          };
        }),
      ]);

      setCropClassification(classifyRes);
      setQuality(qualityRes);
      setQualityLoading(false);

      let detectedCropName = "Crop identification unavailable";
      let detectedCategory = "Not detected";

      if (classifyRes && classifyRes.crop_name && classifyRes.prediction_status === "COMPLETED") {
        detectedCropName = classifyRes.crop_name;
        detectedCategory = classifyRes.category || "Vegetables";
      } else if (editingId && form.crop_name) {
        detectedCropName = form.crop_name;
        detectedCategory = form.crop_category || "Vegetables";
      } else if (classifyRes && classifyRes.prediction_status === "LOW_CONFIDENCE") {
        setError("Crop identification confidence is low. Please upload a clearer crop image.");
      } else if (classifyRes && classifyRes.prediction_status === "MODEL_UNAVAILABLE") {
        setError("Crop identification model is unavailable.");
      }

      setForm((prev) => ({
        ...prev,
        crop_name: detectedCropName,
        crop_category: detectedCategory,
      }));

      // 2. Fetch real APMC mandi market price for identified crop and location
      setAnalysisStep(`Fetching real APMC mandi market price for ${detectedCropName}...`);
      let marketRes = null;
      if (detectedCropName && detectedCropName !== "Crop identification unavailable" && detectedCropName !== "Not detected") {
        try {
          marketRes = await getLatestMarketPrice(
            detectedCropName,
            locationDetails.state || null,
            locationDetails.district || null
          );
          setMarket(marketRes);
        } catch (mErr) {
          console.warn("Market feed error:", mErr);
          setMarket({
            status: "UNAVAILABLE",
            market_source: "Agmarknet APMC Mandi Network",
            message: "Live market data is currently unavailable.",
          });
        }
      }

      // 3. Run AI Fair Price Prediction in memory using estimateFairPrice (NO database listing needed)
      setAnalysisStep("Evaluating fair price recommendation...");
      try {
        setPriceLoading(true);
        const qualityGrade = qualityRes?.quality_label || "Grade B";
        const mktPriceNum = marketRes?.market_price ? Number(marketRes.market_price) : null;
        const initialQty = form.quantity && Number(form.quantity) > 0 ? Number(form.quantity) : 10;
        const priceRes = await estimateFairPrice({
          crop_name: detectedCropName,
          quality_grade: qualityGrade,
          market_price: mktPriceNum,
          quantity: initialQty,
          unit: form.unit || "kg",
          state: locationDetails.state || null,
          district: locationDetails.district || null,
        });
        setPrice(priceRes);
        if (
          priceRes &&
          priceRes.predicted_price != null &&
          !isNaN(Number(priceRes.predicted_price)) &&
          Number(priceRes.predicted_price) > 0 &&
          priceRes.prediction_status === "COMPLETED"
        ) {
          setForm((prev) => ({ ...prev, asking_price: String(priceRes.predicted_price) }));
        }
      } catch (pErr) {
        console.warn("Price prediction error:", pErr);
        const fallbackPrice = {
          prediction_status: "MODEL_UNAVAILABLE",
          predicted_price: null,
          result_metadata: { reason: pErr?.message || "Fair-price recommendation model is currently unavailable." },
        };
        setPrice(fallbackPrice);
      } finally {
        setPriceLoading(false);
      }

      if (detectedCropName && detectedCropName !== "Crop identification unavailable" && detectedCropName !== "Not detected") {
        const sourceLabel = classifyRes?.source === "gemini" ? "Gemini Vision" : "Local Model";
        setSuccess(`Identified ${detectedCropName} via ${sourceLabel}. Please enter available harvest quantity.`);
      }
    } catch (analysisErr) {
      console.error("AI analysis failure:", analysisErr);
      setError(analysisErr.message || "Failed to analyze crop photo. Please try again.");
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep("");
      setQualityLoading(false);
    }
  };

  // Recalculate price prediction in-memory when farmer changes quantity (NO database updates)
  const handleQuantityChange = (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, quantity: val }));

    if (priceDebounceTimer.current) {
      clearTimeout(priceDebounceTimer.current);
    }

    const qtyNum = Number(val);
    if (isNaN(qtyNum) || qtyNum <= 0) return;

    priceDebounceTimer.current = setTimeout(async () => {
      try {
        setPriceLoading(true);
        const qualityGrade = quality?.quality_label || "Grade B";
        const mktPriceNum = market?.market_price ? Number(market.market_price) : null;
        const result = await estimateFairPrice({
          crop_name: form.crop_name,
          quality_grade: qualityGrade,
          market_price: mktPriceNum,
          quantity: qtyNum,
          unit: form.unit || "kg",
          state: locationDetails.state || null,
          district: locationDetails.district || null,
        });
        setPrice(result);
        if (
          result &&
          result.predicted_price != null &&
          !isNaN(Number(result.predicted_price)) &&
          Number(result.predicted_price) > 0 &&
          result.prediction_status === "COMPLETED"
        ) {
          setForm((prev) => ({ ...prev, asking_price: String(result.predicted_price) }));
        }
      } catch (err) {
        console.warn("Quantity price recalculation notice:", err);
      } finally {
        setPriceLoading(false);
      }
    }, 250);
  };

  // The ONLY operation that publishes and persists a crop listing to the database
  const handlePublish = async () => {
    if (loading || isAnalyzing || qualityLoading) return;
    const qty = Number(form.quantity);
    if (!form.quantity || isNaN(qty) || qty <= 0) {
      setError("Please enter a valid available harvest quantity greater than 0 kg.");
      return;
    }

    if (!form.crop_name || form.crop_name === "Crop identification unavailable" || form.crop_name === "Not detected") {
      setError("Cannot publish without a valid identified crop. Please take or select a clear photo of your produce.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const finalPriceNum = form.asking_price && Number(form.asking_price) >= 0 ? Number(form.asking_price) : 0;
      const listing = await persistListing({
        crop_name: form.crop_name,
        crop_category: form.crop_category !== "Not detected" ? form.crop_category : null,
        quantity: qty,
        unit: form.unit || "kg",
        asking_price: finalPriceNum,
      });

      // 1. Upload harvest photo and store real quality prediction to the created listing
      let finalQualityLabel = quality?.quality_label || null;
      if (imageFiles.length > 0 && imageFiles[0].file) {
        try {
          const qualRes = await createQualityPrediction(listing.id, imageFiles[0].file);
          if (qualRes && qualRes.quality_label) {
            finalQualityLabel = qualRes.quality_label;
          }
        } catch (qualErr) {
          console.warn("Quality prediction direct attachment fallback:", qualErr);
          try {
            await uploadFarmerListingImage(listing.id, imageFiles[0].file);
          } catch (uploadErr) {
            console.warn("Listing image attachment warning:", uploadErr);
          }
          if (finalQualityLabel) {
            try {
              await updateFarmerListing(listing.id, { quality_information: finalQualityLabel });
            } catch {
              // ignore
            }
          }
        }
      }

      // 2. Attach real AI fair price prediction to the created listing
      try {
        await createPricePrediction(listing.id, {
          crop_name: form.crop_name,
          quality_grade: finalQualityLabel || "Grade B",
          quantity: qty,
          unit: form.unit || "kg",
          market_price: market?.market_price ? Number(market.market_price) : null,
          state: locationDetails.state || null,
          district: locationDetails.district || null,
        });
      } catch (priceErr) {
        console.warn("Price prediction attachment warning:", priceErr);
      }

      // 3. Fetch fresh listing with attached images & quality from server
      let freshListing = listing;
      try {
        const fetched = await getFarmerListing(listing.id);
        if (fetched) freshListing = fetched;
      } catch {
        // use listing
      }

      // 4. Update session storage cache and broadcast event
      try {
        const CROP_CACHE_KEY = "kd_farmer_crops_cache";
        const cachedRaw = sessionStorage.getItem(CROP_CACHE_KEY);
        const cachedList = cachedRaw ? JSON.parse(cachedRaw) : [];
        const listArray = Array.isArray(cachedList) ? cachedList : cachedList?.items || [];
        const primaryPreview = imageFiles.length > 0 && imageFiles[0].preview ? imageFiles[0].preview : null;
        const imagesWithFallback = (freshListing.images && freshListing.images.length > 0)
          ? freshListing.images
          : (primaryPreview ? [primaryPreview] : []);
        const enhancedListing = {
          ...freshListing,
          images: imagesWithFallback,
          crop_name: freshListing.crop_name || form.crop_name,
          crop_category: freshListing.crop_category || form.crop_category || null,
          quantity: freshListing.quantity != null ? freshListing.quantity : qty,
          unit: freshListing.unit || form.unit || "kg",
          asking_price: freshListing.asking_price != null ? freshListing.asking_price : finalPriceNum,
          availability_status: freshListing.availability_status || "AVAILABLE",
          ai_quality_label: freshListing.ai_quality_label || finalQualityLabel || null,
          quality_grade: freshListing.quality_grade || finalQualityLabel || null,
        };
        const updatedList = [enhancedListing, ...listArray.filter((i) => String(i.id) !== String(freshListing.id))];
        sessionStorage.setItem(CROP_CACHE_KEY, JSON.stringify(updatedList));
        sessionStorage.removeItem("kd_farmer_dashboard_cache");
        window.dispatchEvent(new CustomEvent("farmer-crop-added", { detail: enhancedListing }));
      } catch (cacheErr) {
        console.warn("Could not write to crops cache:", cacheErr);
      }

      setSuccess("Crop listing published successfully!");
      navigate("/farmer/crops");
    } catch (requestError) {
      setError(requestError.message || "Could not publish listing.");
    } finally {
      setLoading(false);
    }
  };

  const hasCropPhoto = imageFiles.length > 0 && (imageFiles[0].preview || imageFiles[0].url);
  const isPublishable =
    hasCropPhoto &&
    form.crop_name &&
    form.crop_name !== "Crop identification unavailable" &&
    form.crop_name !== "Not detected" &&
    form.quantity &&
    !isNaN(Number(form.quantity)) &&
    Number(form.quantity) > 0 &&
    !isAnalyzing &&
    !qualityLoading;

  return (
    <section className="farmer-dashboard-view add-crop-page" style={{ maxWidth: "720px", margin: "0 auto", padding: "16px 12px 60px" }}>
      {/* Hidden File Picker and Offscreen Canvas */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelection}
        style={{ display: "none" }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {error && <div className="alert alert-danger py-2 px-3 mb-3 small d-flex align-items-center gap-2" style={{ borderRadius: "10px" }}><i className="bi bi-exclamation-circle me-1" /><span>{error}</span></div>}
      {success && <div className="alert alert-success py-2 px-3 mb-3 small d-flex align-items-center gap-2" style={{ borderRadius: "10px" }}><i className="bi bi-check-circle me-1" /><span>{success}</span></div>}

      {/* SCREEN 1: Simple, clean, modern, farmer-friendly Add Crop photo screen */}
      {!hasCropPhoto && !isAnalyzing && (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #EAE5DC",
            borderRadius: "20px",
            padding: "44px 32px 36px",
            boxShadow: "0 4px 20px rgba(14, 50, 36, 0.05)",
            textAlign: "center",
          }}
        >
          {/* Top Camera Icon Badge */}
          <div
            style={{
              width: "68px",
              height: "68px",
              borderRadius: "50%",
              background: "#E8F5E9",
              color: "#1B6B34",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              marginBottom: "18px",
            }}
          >
            <i className="bi bi-camera" />
          </div>

          {/* Heading and Subtitle - EXACT copy required */}
          <h1
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "28px",
              fontWeight: 700,
              color: "#104230",
              margin: "0 0 8px",
              letterSpacing: "-0.01em",
            }}
          >
            Add Crop
          </h1>
          <p style={{ color: "#65766e", fontSize: "15px", margin: "0 0 32px" }}>
            Add a photo of your crop
          </p>

          {cameraError && (
            <div className="alert alert-warning py-2 px-3 mb-3 small d-flex align-items-center gap-2" style={{ maxWidth: "480px", margin: "0 auto 16px", borderRadius: "10px" }}>
              <i className="bi bi-exclamation-triangle" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Clean Action Cards: Take Photo & Choose Photo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "480px", margin: "0 auto 24px" }}>
            <button
              type="button"
              className="farmer-photo-choice-card"
              onClick={() => startCamera("environment")}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "18px 20px",
                border: "1.5px solid #EAE5DC",
                borderRadius: "14px",
                background: "#FFFFFF",
                cursor: "pointer",
                textAlign: "left",
                gap: "16px",
                transition: "all 0.2s ease",
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "12px",
                  background: "#E8F5E9",
                  color: "#1B6B34",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "24px",
                }}
              >
                <i className="bi bi-camera" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "16px", color: "#183229" }}>
                  Take Photo
                </div>
                <div style={{ fontSize: "13px", color: "#65766e", marginTop: "2px" }}>
                  Open live camera to snap fresh crop photos directly
                </div>
              </div>
              <i className="bi bi-chevron-right" style={{ color: "#9CA3AF", fontSize: "16px" }} />
            </button>

            <button
              type="button"
              className="farmer-photo-choice-card"
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.click();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "18px 20px",
                border: "1.5px solid #EAE5DC",
                borderRadius: "14px",
                background: "#FFFFFF",
                cursor: "pointer",
                textAlign: "left",
                gap: "16px",
                transition: "all 0.2s ease",
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "12px",
                  background: "#E3F2FD",
                  color: "#1976D2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "24px",
                }}
              >
                <i className="bi bi-image" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "16px", color: "#183229" }}>
                  Choose Photo
                </div>
                <div style={{ fontSize: "13px", color: "#65766e", marginTop: "2px" }}>
                  Select photos from your device storage or files
                </div>
              </div>
              <i className="bi bi-chevron-right" style={{ color: "#9CA3AF", fontSize: "16px" }} />
            </button>
          </div>

          {/* Compact Location Card: 📍 Location — ↻ Refresh */}
          <div
            style={{
              maxWidth: "480px",
              margin: "0 auto",
              padding: "12px 18px",
              background: "#FDFBF7",
              border: "1px solid #EAE5DC",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
              fontSize: "13px",
              color: "#183229",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
              <i className="bi bi-geo-alt" style={{ color: "#1B6B34", fontSize: "16px", flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
                {locStatus || form.farm_location || "Location loaded from profile"}
              </span>
            </div>
            <button
              type="button"
              onClick={detectLocation}
              disabled={locLoading}
              style={{
                background: "none",
                border: "none",
                color: "#1B6B34",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <i className={`bi bi-arrow-clockwise ${locLoading ? "spin" : ""}`} />
              <span>{locLoading ? "Locating..." : "Refresh"}</span>
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 2: Simple, clean Analyzing State Card */}
      {isAnalyzing && (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #EAE5DC",
            borderRadius: "20px",
            padding: "44px 32px 36px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(14, 50, 36, 0.05)",
          }}
        >
          <div className="spinner-border text-success mb-3" role="status" style={{ width: "40px", height: "40px", color: "#1B6B34" }} />
          <h2
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "24px",
              fontWeight: 700,
              color: "#104230",
              margin: "0 0 8px",
            }}
          >
            Analyzing your crop photo...
          </h2>
          <p style={{ color: "#65766e", fontSize: "14.5px", margin: "0 0 24px" }}>
            Detecting crop name, visual quality, and current mandi benchmark prices
          </p>

          {imageFiles[0]?.preview && (
            <div
              style={{
                width: "130px",
                height: "130px",
                borderRadius: "16px",
                overflow: "hidden",
                margin: "0 auto 24px",
                border: "2px solid #1B6B34",
                boxShadow: "0 4px 14px rgba(27, 107, 52, 0.12)",
              }}
            >
              <img src={imageFiles[0].preview} alt="Crop" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}

          <div
            style={{
              display: "inline-flex",
              flexDirection: "column",
              gap: "8px",
              textAlign: "left",
              fontSize: "13.5px",
              color: "#183229",
              background: "#FDFBF7",
              border: "1px solid #EAE5DC",
              padding: "14px 22px",
              borderRadius: "12px",
              maxWidth: "420px",
              margin: "0 auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <i className="bi bi-check2 text-success fw-bold" /> Photo received
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <i className="bi bi-check2 text-success fw-bold" /> Identifying crop species &amp; quality
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <i className="bi bi-check2 text-success fw-bold" /> Checking APMC mandi benchmark rates &amp; trends
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 3: Review & Publish Screen (Shown after photo is analyzed) */}
      {hasCropPhoto && !isAnalyzing && (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Header Row with Back Button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                  fontSize: "26px",
                  fontWeight: 700,
                  color: "#104230",
                  margin: "0 0 4px",
                }}
              >
                Add Crop
              </h1>
              <p style={{ color: "#65766e", fontSize: "14px", margin: 0 }}>
                Review details, enter available harvest quantity, and publish
              </p>
            </div>
            <button
              type="button"
              className="kisan-btn-outline"
              onClick={onBack || (() => navigate("/farmer/crops"))}
              style={{
                height: "38px",
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <i className="bi bi-chevron-left" /> Back to My Crops
            </button>
          </div>

          {/* Main Clean White Card */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #EAE5DC",
              borderRadius: "20px",
              padding: "28px 24px",
              boxShadow: "0 4px 20px rgba(14, 50, 36, 0.05)",
              display: "flex",
              flexDirection: "column",
              gap: "22px",
            }}
          >
            {/* Produce Photo Banner */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "14px",
                paddingBottom: "18px",
                borderBottom: "1px solid #EAE5DC",
              }}
            >
              <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "14px",
                    overflow: "hidden",
                    border: "1.5px solid #EAE5DC",
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={imageFiles[0].preview || imageFiles[0].url}
                    alt={form.crop_name || "Harvest Crop"}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                <div>
                  <h2
                    style={{
                      fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                      fontSize: "22px",
                      fontWeight: 700,
                      color: "#104230",
                      margin: "0 0 4px",
                    }}
                  >
                    {form.crop_name || "Crop identification unavailable"}
                  </h2>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      borderRadius: "6px",
                      background: "#E8F5E9",
                      color: "#1B6B34",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {form.crop_category || "Produce"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="kisan-btn-outline"
                onClick={() => setShowSourceModal(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontWeight: 600,
                }}
              >
                <i className="bi bi-camera" /> Change Photo
              </button>
            </div>

            {/* AI Crop Analysis Results: EXACT 6 fields (NO Variety, NO Confidence, NO Model Details) */}
            <div>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#104230",
                  margin: "0 0 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <i className="bi bi-check2-circle text-success" /> Crop Analysis Results
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "12px",
                }}
              >
                {/* 1. Crop Name */}
                <div
                  style={{
                    background: "#FDFBF7",
                    border: "1px solid #EAE5DC",
                    borderRadius: "12px",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#65766e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    Crop Name
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#183229" }}>
                    {form.crop_name || "Unavailable"}
                  </div>
                </div>

                {/* 2. Category */}
                <div
                  style={{
                    background: "#FDFBF7",
                    border: "1px solid #EAE5DC",
                    borderRadius: "12px",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#65766e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    Category
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#183229" }}>
                    {form.crop_category || "Not detected"}
                  </div>
                </div>

                {/* 3. Quality */}
                <div
                  style={{
                    background: "#FDFBF7",
                    border: "1px solid #EAE5DC",
                    borderRadius: "12px",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#65766e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    Quality
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#1B6B34" }}>
                    {quality?.quality_label
                      ? (quality.result_metadata?.grade ? `${quality.result_metadata.grade} (${quality.quality_label})` : quality.quality_label)
                      : "Assessed"}
                  </div>
                </div>

                {/* 4. Market Reference Price */}
                <div
                  style={{
                    background: "#FDFBF7",
                    border: "1px solid #EAE5DC",
                    borderRadius: "12px",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#65766e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    Market Reference Price
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#183229" }}>
                    {market?.market_price ? `${money(market.market_price)} / ${form.unit || "kg"}` : "Unavailable"}
                  </div>
                </div>

                {/* 5. AI Fair Price */}
                <div
                  style={{
                    background: "#E8F5E9",
                    border: "1.5px solid #C8E6C9",
                    borderRadius: "12px",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#1B6B34", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    AI Fair Price
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#104230" }}>
                    {price?.predicted_price ? `${money(price.predicted_price)} / ${form.unit || "kg"}` : "Pending"}
                  </div>
                </div>

                {/* 6. Price Trend */}
                <div
                  style={{
                    background: "#FDFBF7",
                    border: "1px solid #EAE5DC",
                    borderRadius: "12px",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#65766e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    Price Trend
                  </div>
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      color: market?.price_trend === "Rising" ? "#15803D" : market?.price_trend === "Falling" ? "#DC2626" : "#4B5563",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {market?.price_trend === "Rising" && <i className="bi bi-arrow-up-right" />}
                    {market?.price_trend === "Falling" && <i className="bi bi-arrow-down-right" />}
                    {(!market?.price_trend || market?.price_trend === "Stable") && <i className="bi bi-dash" />}
                    <span>{market?.price_trend || "Stable"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Farmer Available Quantity */}
            <div
              style={{
                background: "#FDFBF7",
                border: "1.5px solid #EAE5DC",
                borderRadius: "14px",
                padding: "20px",
              }}
            >
              <div style={{ fontWeight: 700, color: "#104230", fontSize: "15px", marginBottom: "4px" }}>
                Available Harvest Quantity
              </div>
              <p style={{ fontSize: "13px", color: "#65766e", margin: "0 0 14px" }}>
                Enter the total harvest quantity you have ready for dispatch to your local Kisan Hub.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#183229", marginBottom: "6px", display: "block" }}>
                    Quantity ({form.unit || "kg"}) <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={form.quantity}
                      onChange={handleQuantityChange}
                      placeholder="e.g. 100"
                      required
                      autoFocus
                      style={{
                        fontSize: "17px",
                        fontWeight: 700,
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1.5px solid #1B6B34",
                        color: "#104230",
                        width: "100%",
                        background: "#FFFFFF",
                      }}
                    />
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#65766e", padding: "0 8px" }}>
                      {form.unit || "kg"}
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#183229", marginBottom: "6px", display: "block" }}>
                    Harvest Date
                  </label>
                  <input
                    type="date"
                    value={form.harvest_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, harvest_date: e.target.value }))}
                    style={{
                      height: "44px",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      border: "1.5px solid #EAE5DC",
                      width: "100%",
                      fontSize: "14px",
                      background: "#FFFFFF",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Compact Location Card: 📍 Location — ↻ Refresh */}
            <div
              style={{
                padding: "12px 16px",
                background: "#FDFBF7",
                border: "1px solid #EAE5DC",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                fontSize: "13px",
                color: "#183229",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                <i className="bi bi-geo-alt" style={{ color: "#1B6B34", fontSize: "16px", flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {locStatus || form.farm_location || "Saved profile location"}
                </span>
              </div>
              <button
                type="button"
                onClick={detectLocation}
                disabled={locLoading}
                style={{
                  background: "none",
                  border: "none",
                  color: "#1B6B34",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <i className={`bi bi-arrow-clockwise ${locLoading ? "spin" : ""}`} />
                <span>{locLoading ? "Locating..." : "Refresh"}</span>
              </button>
            </div>

            {/* Review Summary Box */}
            <div
              style={{
                background: "#E8F5E9",
                border: "1px solid #C8E6C9",
                borderRadius: "14px",
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "15px", color: "#104230" }}>
                  {form.crop_name || "Produce"} · {form.quantity ? `${form.quantity} ${form.unit || "kg"}` : "Enter quantity"}
                </div>
                <div style={{ fontSize: "13px", color: "#1B6B34", marginTop: "2px" }}>
                  Market: {market?.market_price ? money(market.market_price) + "/" + (form.unit || "kg") : "—"} · Fair Price: {price?.predicted_price ? money(price.predicted_price) + "/" + (form.unit || "kg") : "—"} · Trend: {market?.price_trend || "Stable"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11.5px", color: "#1B6B34", fontWeight: 600 }}>Estimated Total Value</div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#104230" }}>
                  {form.quantity && price?.predicted_price
                    ? money(Number(price.predicted_price) * Number(form.quantity))
                    : "—"}
                </div>
              </div>
            </div>

            {/* Single "Publish Crop" Button */}
            <button
              type="button"
              onClick={handlePublish}
              disabled={loading || !isPublishable}
              aria-label="Publish Crop"
              style={{
                width: "100%",
                height: "52px",
                background: isPublishable ? "#1B6B34" : "#D6D0C2",
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: "16px",
                borderRadius: "12px",
                border: "none",
                cursor: isPublishable ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: isPublishable ? "0 4px 14px rgba(27, 107, 52, 0.25)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              {loading ? (
                <>
                  <div className="spinner-border spinner-border-sm" role="status" style={{ width: "18px", height: "18px" }} />
                  <span>Publishing Crop...</span>
                </>
              ) : (
                <>
                  <i className="bi bi-cloud-arrow-up" style={{ fontSize: "18px" }} />
                  <span>Publish Crop</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Modal: Change / Retake Photo */}
      {showSourceModal && (
        <div className="farmer-modal-backdrop" onClick={() => setShowSourceModal(false)}>
          <div
            className="farmer-photo-modal"
            style={{
              maxWidth: "480px",
              padding: "28px 24px",
              borderRadius: "20px",
              border: "1px solid #EAE5DC",
              background: "#FFFFFF",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h3 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#104230" }}>
                Add Crop
              </h3>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={() => setShowSourceModal(false)}
              />
            </div>
            <p style={{ fontSize: "14px", color: "#65766e", marginBottom: "20px" }}>
              Add a photo of your crop
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button
                type="button"
                className="farmer-photo-choice-card"
                onClick={() => {
                  setShowSourceModal(false);
                  startCamera("environment");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "16px 18px",
                  border: "1.5px solid #EAE5DC",
                  borderRadius: "14px",
                  background: "#FFFFFF",
                  cursor: "pointer",
                  textAlign: "left",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "#E8F5E9",
                    color: "#1B6B34",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: "22px",
                  }}
                >
                  <i className="bi bi-camera" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "#183229" }}>
                    Take Photo
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#65766e" }}>
                    Open live camera to snap fresh crop photos directly
                  </div>
                </div>
                <i className="bi bi-chevron-right" style={{ color: "#9CA3AF" }} />
              </button>

              <button
                type="button"
                className="farmer-photo-choice-card"
                onClick={() => {
                  setShowSourceModal(false);
                  if (fileInputRef.current) fileInputRef.current.click();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "16px 18px",
                  border: "1.5px solid #EAE5DC",
                  borderRadius: "14px",
                  background: "#FFFFFF",
                  cursor: "pointer",
                  textAlign: "left",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "#E3F2FD",
                    color: "#1976D2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: "22px",
                  }}
                >
                  <i className="bi bi-image" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "#183229" }}>
                    Choose Photo
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#65766e" }}>
                    Select photos from your device storage or files
                  </div>
                </div>
                <i className="bi bi-chevron-right" style={{ color: "#9CA3AF" }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Viewfinder Modal */}
      {cameraActive && (
        <div className="farmer-modal-backdrop" onClick={closeCamera}>
          <div className="farmer-photo-modal" style={{ maxWidth: "520px", borderRadius: "18px", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div className="p-3 d-flex align-items-center justify-content-between" style={{ background: "#104230", color: "#FFF" }}>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-camera text-white" />
                <span style={{ fontWeight: 600, fontSize: "14px" }}>Take Crop Photo</span>
              </div>
              <button
                type="button"
                className="btn btn-sm text-white"
                onClick={closeCamera}
                style={{ fontSize: "20px", padding: "0 6px", lineHeight: 1 }}
              >
                &times;
              </button>
            </div>

            <div className="farmer-camera-container">
              <video
                ref={videoRef}
                className="farmer-camera-video"
                autoPlay
                playsInline
                muted
              />
              <div className="farmer-camera-shutter-bar" style={{ background: "rgba(16, 66, 48, 0.95)" }}>
                <button
                  type="button"
                  className="btn text-white d-flex flex-column align-items-center"
                  onClick={switchCamera}
                  title="Switch Camera (Front/Rear)"
                  style={{ fontSize: "12px", gap: "2px" }}
                >
                  <i className="bi bi-arrow-clockwise fs-4" />
                  <span>Flip</span>
                </button>

                <button
                  type="button"
                  className="farmer-camera-shutter-btn"
                  onClick={capturePhoto}
                  title="Capture Photo"
                  style={{ background: "#FFFFFF", color: "#104230" }}
                >
                  <i className="bi bi-camera" />
                </button>

                <button
                  type="button"
                  className="btn text-white d-flex flex-column align-items-center"
                  onClick={closeCamera}
                  title="Cancel"
                >
                  <i className="bi bi-x-circle fs-4 text-white-50" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
