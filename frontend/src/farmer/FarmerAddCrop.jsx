import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createFarmerListing,
  createPricePrediction,
  createQualityPrediction,
  getFarmerProfile,
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
  crop_category: "Vegetables",
  variety: "",
  quantity: "",
  unit: "kg",
  asking_price: "",
  harvest_date: new Date().toISOString().slice(0, 10),
  farm_location: "",
  latitude: "",
  longitude: "",
  pincode: "",
  description: "",
};

const steps = [
  "Crop Details",
  "Upload Images",
  "AI Quality",
  "Market Price",
  "AI Price",
  "Review",
];

const VARIETY_OPTIONS_BY_CATEGORY = {
  "Vegetables": ["Hybrid", "Desi (Native)", "Organic", "Indam-2", "Pusa Ruby", "Roma", "Cherry", "Greenhouse"],
  "Leafy Greens & Herbs": ["Spinach (Palak)", "Methi (Fenugreek)", "Coriander (Dhaniya)", "Mint (Pudina)", "Curry Leaves", "Amaranth", "Organic"],
  "Fruits": ["Desi (Native)", "Hybrid", "Organic", "Alphonso", "Kesar", "Robusta", "Nagpur", "Export Grade"],
  "Grains & Cereals": ["Desi", "Basmati", "Sona Masoori", "Sharbati", "Organic", "High-Yield 1509", "1121", "Brown Rice"],
  "Pulses & Lentils": ["Desi Chana", "Kabuli", "Toor / Arhar", "Moong", "Urad", "Masoor", "Organic", "Unhulled"],
  "Roots & Tubers": ["Desi", "Kufri Jyoti", "Chipsona", "Organic", "Sweet Red", "Table Grade", "Beetroot", "Carrot"],
  "Spices & Condiments": ["Desi / Local", "Guntur Chilli", "Byadgi", "Salem Turmeric", "Black Pepper", "Cardamom", "Cumin (Jeera)", "Organic"],
  "Millets": ["Ragi (Finger)", "Bajra (Pearl)", "Jowar (Sorghum)", "Foxtail (Kangni)", "Little Millet", "Kodo", "Organic"],
  "Oilseeds & Edible Oils": ["Groundnut / Peanut", "Mustard (Sarson)", "Sesame (Til)", "Sunflower", "Soybean", "Cold Pressed", "Organic"],
  "Dry Fruits & Nuts": ["Almonds (Badam)", "Cashews (Kaju)", "Walnuts (Akhrot)", "Raisins (Kishmish)", "Pistachio", "Dates", "Organic"],
  "Dairy & Farm Fresh": ["A2 Cow Milk", "Buffalo Milk", "Desi Ghee", "Fresh Paneer", "Curd / Dahi", "Farm Eggs", "Butter"],
  "Flowers & Floriculture": ["Marigold (Genda)", "Rose (Gulab)", "Jasmine (Mogra)", "Chrysanthemum (Sevanti)", "Tuberose", "Lotus"],
  "Mushrooms & Exotic Produce": ["Button Mushroom", "Oyster Mushroom", "Milky Mushroom", "Bell Pepper", "Broccoli", "Zucchini", "Hydroponic"],
  "Honey & Natural Sweeteners": ["Raw Wild Honey", "Multi-Flora Honey", "Organic Jaggery (Gud)", "Jaggery Powder", "Liquid Jaggery", "Raw Sugar"],
  "Plantation & Beverages": ["Fresh Coconut", "Tender Coconut", "Coffee Beans", "Green Tea", "CTC Tea", "Arecanut"],
  "Medicinal & Ayurvedic Herbs": ["Tulsi", "Ashwagandha", "Aloe Vera", "Giloy", "Neem", "Brahmi", "Shatavari", "Organic"],
  "Certified Organic Produce": ["Certified Organic", "Natural Farming", "Zero Budget (SPNF)", "Heirloom", "Desi (Native)"],
};

const DEFAULT_VARIETIES = ["Hybrid", "Desi (Native)", "Organic", "Heirloom", "Greenhouse", "Export Grade"];

const CATEGORY_OPTIONS = [
  "Vegetables",
  "Leafy Greens & Herbs",
  "Fruits",
  "Grains & Cereals",
  "Pulses & Lentils",
  "Roots & Tubers",
  "Spices & Condiments",
  "Millets",
  "Oilseeds & Edible Oils",
  "Dry Fruits & Nuts",
  "Dairy & Farm Fresh",
  "Flowers & Floriculture",
  "Mushrooms & Exotic Produce",
  "Honey & Natural Sweeteners",
  "Plantation & Beverages",
  "Medicinal & Ayurvedic Herbs",
  "Certified Organic Produce",
];

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const SAMPLE_CROP_IMAGES = [
  {
    preview: "/assets/images/onion.png",
    url: "/assets/images/onion.png",
    fallbackUrl: "https://images.unsplash.com/photo-1508747703725-719777637510?q=80&w=400&auto=format&fit=crop",
    name: "Fresh Onion",
    isSample: true,
  },
  {
    preview: "/assets/images/potato.png",
    url: "/assets/images/potato.png",
    fallbackUrl: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?q=80&w=400&auto=format&fit=crop",
    name: "Farm Potato",
    isSample: true,
  },
];

async function urlToFile(url, filename = "crop_image.png") {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || "image/png" });
  } catch (err) {
    console.warn("Could not convert url to file:", err);
    return null;
  }
}

export default function FarmerAddCrop({ onBack }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editingId = searchParams.get("listingId");
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [draftId, setDraftId] = useState(null);
  const [imageFiles, setImageFiles] = useState(SAMPLE_CROP_IMAGES);
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
          crop_category: listing.crop_category || "Vegetables",
          variety: listing.crop_name || "",
          quantity: listing.quantity != null ? String(listing.quantity) : "",
          unit: listing.unit || "kg",
          asking_price: listing.asking_price != null ? String(listing.asking_price) : "",
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
      // 1. Try backend reverse-geocode endpoint
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

    // 2. Client-side fallback via BigDataCloud if address or pin still missing
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

    setForm((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      pincode: detectedPin || prev.pincode,
      farm_location: formattedWithPin,
    }));
    setLocStatus(`Auto-detected: ${finalAddress}${detectedPin ? ` (PIN: ${detectedPin})` : ""}`);
    setLocLoading(false);

    // Sync detected location and PIN to the farmer's database profile so both sections stay updated
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

  // On mount: first load saved location from farmer profile; if none, auto-detect GPS
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
          setForm((prev) => ({
            ...prev,
            latitude: profileLat,
            longitude: profileLng,
            pincode: profilePin || prev.pincode,
            farm_location: profileAddr || `${profileLat}, ${profileLng}`,
          }));
          setLocStatus(`Location loaded from saved profile: ${profileAddr || `${profileLat}, ${profileLng}`}${profilePin ? ` (PIN: ${profilePin})` : ""}`);
        } else if (typeof navigator !== "undefined" && navigator.geolocation) {
          // If no location saved in profile yet, auto-detect via browser geolocation
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isMounted) return;
              const lat = Number(pos.coords.latitude.toFixed(6));
              const lng = Number(pos.coords.longitude.toFixed(6));
              resolveLocationDetails(lat, lng);
            },
            () => {
              // Location permission not granted or prompt dismissed
            },
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

  const [isCustomVariety, setIsCustomVariety] = useState(false);

  const handleCategoryChange = (e) => {
    const nextCat = e.target.value;
    setForm((prev) => ({
      ...prev,
      crop_category: nextCat,
      variety: "",
    }));
    setIsCustomVariety(false);
  };

  const handleVarietySelect = (e) => {
    const val = e.target.value;
    if (val === "Other") {
      setIsCustomVariety(true);
      setForm((prev) => ({ ...prev, variety: "" }));
    } else {
      setIsCustomVariety(false);
      setForm((prev) => ({ ...prev, variety: val }));
    }
  };

  const updateField = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

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
      form.variety ? `Variety: ${form.variety}` : null,
      form.pincode ? `PIN: ${form.pincode}` : null,
      form.description?.trim() || null,
    ].filter(Boolean);

    const priceValue = override?.asking_price != null ? Number(override.asking_price) : Number(form.asking_price);

    const payload = {
      crop_name: (override?.crop_name || form.crop_name).trim(),
      crop_category: (override?.crop_category || form.crop_category || "Vegetables").trim(),
      quantity: Number(override?.quantity != null ? override.quantity : form.quantity),
      unit: override?.unit || form.unit || "kg",
      asking_price: priceValue,
      description: descParts.join(". ") || null,
      harvest_date: form.harvest_date ? new Date(form.harvest_date).toISOString() : null,
      location: locationObj,
    };

    if (!payload.crop_name || !payload.quantity || !payload.asking_price) {
      throw new Error("Crop name, quantity, and expected price are required.");
    }

    if (draftId) {
      const updated = await updateFarmerListing(draftId, payload);
      setDraftId(updated.id);
      if (updated.asking_price != null) {
        setForm((prev) => ({ ...prev, asking_price: String(updated.asking_price) }));
      }
      return updated;
    }

    const created = await createFarmerListing(payload);
    setDraftId(created.id);
    if (created.asking_price != null) {
      setForm((prev) => ({ ...prev, asking_price: String(created.asking_price) }));
    }
    return created;
  };

  const uploadImages = async () => {
    if (!draftId || !imageFiles.length) return;
    for (const item of imageFiles) {
      const fileToUpload = item.file || (item.preview ? await urlToFile(item.preview, item.name || "crop.png") : null);
      if (fileToUpload) {
        try {
          await uploadFarmerListingImage(draftId, fileToUpload);
        } catch (uploadErr) {
          console.warn("Upload image notice:", uploadErr);
        }
      }
    }
    setSuccess("Images uploaded successfully.");
  };

  const runQualityPrediction = async () => {
    if (!draftId || qualityLoading) return null;
    const primaryItem = imageFiles.find((item) => item.file) || imageFiles[0];
    const primaryFile = primaryItem?.file || (primaryItem?.preview ? await urlToFile(primaryItem.preview, primaryItem.name || "crop.png") : null);
    if (!primaryFile) {
      const fallbackResult = {
        prediction_status: "UNAVAILABLE",
        quality_label: "No Image",
        confidence: null,
        model_name: "crop-quality-mobilenet-v2",
        result_metadata: { reason: "Please upload an image in Step 2 to assess crop quality." },
      };
      setQuality(fallbackResult);
      return fallbackResult;
    }
    try {
      setQualityLoading(true);
      const result = await createQualityPrediction(draftId, primaryFile);
      setQuality(result);
      return result;
    } catch (qualityErr) {
      console.warn("Quality prediction notice:", qualityErr);
      const fallbackResult = {
        prediction_status: "UNAVAILABLE",
        quality_label: "Unavailable",
        confidence: null,
        model_name: "crop-quality-mobilenet-v2",
        result_metadata: { reason: qualityErr?.message || "Crop quality assessment model is currently unavailable." },
      };
      setQuality(fallbackResult);
      return fallbackResult;
    } finally {
      setQualityLoading(false);
    }
  };

  const runPricePrediction = async () => {
    if (!draftId || priceLoading) return null;
    try {
      setPriceLoading(true);
      const result = await createPricePrediction(draftId, { quality_grade: quality?.quality_label || "Good" });
      setPrice(result);
      if (
        result &&
        result.predicted_price != null &&
        !isNaN(Number(result.predicted_price)) &&
        Number(result.predicted_price) > 0 &&
        result.prediction_status !== "MODEL_UNAVAILABLE"
      ) {
        // Populate Final Listing Price only when a valid recommendation is returned
        setForm((prev) => ({
          ...prev,
          asking_price: prev.asking_price && Number(prev.asking_price) > 0 ? prev.asking_price : String(result.predicted_price),
        }));
      }
      return result;
    } catch (priceErr) {
      console.warn("Price prediction request error:", priceErr);
      const fallback = {
        prediction_status: "MODEL_UNAVAILABLE",
        predicted_price: null,
        result_metadata: { reason: priceErr?.message || "Fair-price recommendation model is currently unavailable." },
      };
      setPrice(fallback);
      return fallback;
    } finally {
      setPriceLoading(false);
    }
  };

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [showSourceModal, setShowSourceModal] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("environment");
  const [cameraError, setCameraError] = useState("");

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
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const filename = `crop_photo_${Date.now()}.jpg`;
        const file = new File([blob], filename, { type: "image/jpeg" });
        const previewUrl = URL.createObjectURL(blob);
        setImageFiles((prev) => [...prev, { file, preview: previewUrl, name: filename }]);
        stopCameraStream();
        setCameraActive(false);
        setSuccess("Photo captured from live camera successfully!");
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
    };
  }, []);

  const handleImageSelection = (event) => {
    const nextFiles = Array.from(event.target.files || []).slice(0, 5).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }));
    setImageFiles((previous) => [...previous.filter((item) => !item.file), ...nextFiles]);
    setShowSourceModal(false);
    if (event.target) event.target.value = "";
  };

  const validateStep1 = () => {
    const name = form.crop_name?.trim();
    const qty = Number(form.quantity);
    const askingPrice = Number(form.asking_price);
    if (!name) return "Please enter a crop name before proceeding.";
    if (!form.quantity || isNaN(qty) || qty <= 0) return "Please enter a valid available quantity greater than 0.";
    if (!form.asking_price || isNaN(askingPrice) || askingPrice <= 0) return "Please enter a valid expected price greater than ₹0.";
    return null;
  };

  useEffect(() => {
    if (currentStep === 2 && draftId && !quality && !qualityLoading) {
      runQualityPrediction();
    }
  }, [currentStep, draftId, quality, qualityLoading]);

  useEffect(() => {
    if (currentStep === 4 && draftId && !price && !priceLoading) {
      runPricePrediction();
    }
  }, [currentStep, draftId, price, priceLoading]);

  const goToStep = async (targetIndex) => {
    if (targetIndex === currentStep || targetIndex < 0 || targetIndex >= steps.length) return;
    if (loading || qualityLoading || priceLoading) return;
    setError("");
    setSuccess("");

    // Prevent bypassing Step 1 if required fields are missing
    if (targetIndex > 0) {
      const step1Error = validateStep1();
      if (step1Error) {
        setError(step1Error);
        setCurrentStep(0);
        return;
      }
    }

    // If leaving step 0 and fields are valid, auto-persist draft
    if (currentStep === 0 && !validateStep1()) {
      try {
        setLoading(true);
        await persistListing();
      } catch (err) {
        console.warn("Draft auto-save notice:", err);
      } finally {
        setLoading(false);
      }
    }

    setCurrentStep(targetIndex);
  };

  const nextStep = async () => {
    if (loading || qualityLoading || priceLoading) return;
    try {
      setError("");
      setSuccess("");
      if (currentStep === 0) {
        const step1Error = validateStep1();
        if (step1Error) {
          setError(step1Error);
          return;
        }
        setLoading(true);
        await persistListing();
        setLoading(false);
      }
      if (currentStep === 1) {
        setLoading(true);
        await uploadImages();
        setLoading(false);
      }
      if (currentStep === 2) {
        if (!quality && draftId) {
          setLoading(true);
          await runQualityPrediction();
          setLoading(false);
          return;
        }
      }
      if (currentStep === 4) {
        setLoading(true);
        let predictionResult = price;
        if (draftId && !predictionResult) {
          try {
            predictionResult = await runPricePrediction();
          } catch (predErr) {
            console.warn("Price prediction call notice:", predErr);
          }
        }

        // Handle real response:
        // Populate Final Listing Price only when a valid recommendation is returned
        if (
          predictionResult &&
          predictionResult.predicted_price != null &&
          !isNaN(Number(predictionResult.predicted_price)) &&
          Number(predictionResult.predicted_price) > 0 &&
          predictionResult.prediction_status !== "MODEL_UNAVAILABLE"
        ) {
          setForm((prev) => ({
            ...prev,
            asking_price: prev.asking_price ? prev.asking_price : String(predictionResult.predicted_price),
          }));
        }

        // Validate final price before moving to Review (Step 6)
        const finalPriceNum = Number(form.asking_price);
        if (!form.asking_price || isNaN(finalPriceNum) || finalPriceNum <= 0) {
          setLoading(false);
          throw new Error("Please enter a valid listing price greater than ₹0.");
        }

        // Persist validated final price to the existing listing API
        if (draftId) {
          await persistListing({ asking_price: finalPriceNum });
        }
        setLoading(false);
      }

      setCurrentStep((previous) => Math.min(previous + 1, steps.length - 1));
    } catch (requestError) {
      setLoading(false);
      setError(requestError.message || "Unable to continue with this step.");
    }
  };

  const previousStep = () => {
    setError("");
    setSuccess("");
    if (currentStep > 0) {
      setCurrentStep((previous) => Math.max(previous - 1, 0));
    } else {
      if (onBack) {
        onBack();
      } else {
        navigate("/farmer/crops");
      }
    }
  };

  const handlePublish = async () => {
    if (loading || qualityLoading || priceLoading) return;
    try {
      const step1Error = validateStep1();
      if (step1Error) {
        throw new Error(step1Error);
      }
      const finalPriceNum = Number(form.asking_price);
      if (!form.asking_price || isNaN(finalPriceNum) || finalPriceNum <= 0) {
        throw new Error("Please enter a valid listing price greater than ₹0.");
      }
      setLoading(true);
      setError("");
      setSuccess("");
      const listing = await persistListing({ asking_price: finalPriceNum });
      setDraftId(listing.id);

      // Immediate optimistic update into session cache & broadcast event
      try {
        const CROP_CACHE_KEY = "kd_farmer_crops_cache";
        const cachedRaw = sessionStorage.getItem(CROP_CACHE_KEY);
        const cachedList = cachedRaw ? JSON.parse(cachedRaw) : [];
        const listArray = Array.isArray(cachedList) ? cachedList : (cachedList?.items || []);
        const primaryPreview = imageFiles.length > 0 && imageFiles[0].preview ? imageFiles[0].preview : null;
        const imagesWithFallback = (listing.images && listing.images.length > 0)
          ? listing.images
          : (primaryPreview ? [primaryPreview] : []);
        const enhancedListing = {
          ...listing,
          images: imagesWithFallback,
          crop_name: listing.crop_name || form.crop_name,
          crop_category: listing.crop_category || form.crop_category || "Vegetables",
          quantity: listing.quantity != null ? listing.quantity : form.quantity,
          unit: listing.unit || form.unit || "kg",
          asking_price: listing.asking_price != null ? listing.asking_price : finalPriceNum,
          availability_status: listing.availability_status || "AVAILABLE",
        };
        const updatedList = [enhancedListing, ...listArray.filter((i) => i.id !== listing.id)];
        sessionStorage.setItem(CROP_CACHE_KEY, JSON.stringify(updatedList));
        window.dispatchEvent(new CustomEvent("farmer-crop-added", { detail: enhancedListing }));
      } catch (cacheErr) {
        console.warn("Could not write to crops cache:", cacheErr);
      }

      setSuccess("Listing published successfully.");
      setTimeout(() => navigate("/farmer/crops"), 400);
    } catch (requestError) {
      setError(requestError.message || "Could not publish listing.");
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    if (currentStep === 0) {
      return (
        <div className="farmer-add-crop-step0">
          <div className="field">
            <label>Crop name</label>
            <input
              type="text"
              value={form.crop_name}
              onChange={updateField("crop_name")}
              placeholder="e.g. Fresh Tomato"
              required
            />
          </div>

          <div className="form-row-2col">
            <div className="field" style={{ flex: 1 }}>
              <label>Category</label>
              <select value={form.crop_category} onChange={handleCategoryChange}>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Variety</label>
              <select
                value={
                  isCustomVariety
                    ? "Other"
                    : (VARIETY_OPTIONS_BY_CATEGORY[form.crop_category] || DEFAULT_VARIETIES).includes(form.variety)
                    ? form.variety
                    : form.variety
                    ? "Other"
                    : ""
                }
                onChange={handleVarietySelect}
              >
                <option value="">Select variety...</option>
                {(VARIETY_OPTIONS_BY_CATEGORY[form.crop_category] || DEFAULT_VARIETIES).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
                <option value="Other">Other / Custom</option>
              </select>
              {(isCustomVariety || (form.variety && !(VARIETY_OPTIONS_BY_CATEGORY[form.crop_category] || DEFAULT_VARIETIES).includes(form.variety))) && (
                <input
                  type="text"
                  value={form.variety}
                  onChange={updateField("variety")}
                  placeholder="Enter custom variety (e.g. Indam-2)"
                  style={{ marginTop: "8px" }}
                  autoFocus
                />
              )}
            </div>
          </div>

          <div className="form-row-2col">
            <div className="field" style={{ flex: 1 }}>
              <label>Available quantity ({form.unit || "kg"})</label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.quantity}
                onChange={updateField("quantity")}
                placeholder="e.g. 120"
                required
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Expected price (₹/unit)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.asking_price}
                onChange={updateField("asking_price")}
                placeholder="e.g. 28"
                required
              />
            </div>
          </div>

          <div className="form-row-2col">
            <div className="field" style={{ flex: 1 }}>
              <label>Harvest date</label>
              <input
                type="date"
                value={form.harvest_date}
                onChange={updateField("harvest_date")}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Pincode / Postal code</label>
              <input
                type="text"
                maxLength={6}
                value={form.pincode}
                onChange={updateField("pincode")}
                placeholder="e.g. 560064"
              />
            </div>
          </div>

          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ margin: 0 }}>Farm location (Auto-detected with Pincode)</label>
              <button
                type="button"
                onClick={detectLocation}
                disabled={locLoading}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--forest, #1B6B34)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: 0
                }}
              >
                <i className={`bi bi-geo-alt-fill ${locLoading ? "spin" : ""}`} />
                {locLoading ? "Detecting location..." : "Auto-detect location"}
              </button>
            </div>
            <input
              type="text"
              value={form.farm_location}
              onChange={updateField("farm_location")}
              placeholder="e.g. Yelahanka, Bengaluru Urban, Karnataka - 560064"
            />

            {/* Live GPS Coordinates & Pincode Badges */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "8px",
              marginTop: "8px"
            }}>
              <div style={{ background: "#FAF8F5", border: "1px solid var(--line, #E4DFD1)", borderRadius: "8px", padding: "6px 10px" }}>
                <span style={{ fontSize: "10.5px", color: "var(--clay, #79705F)", fontWeight: 700, display: "block" }}>LATITUDE</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink, #1C1C16)" }}>
                  {form.latitude ? `${Number(form.latitude).toFixed(6)}°` : "Detecting..."}
                </span>
              </div>
              <div style={{ background: "#FAF8F5", border: "1px solid var(--line, #E4DFD1)", borderRadius: "8px", padding: "6px 10px" }}>
                <span style={{ fontSize: "10.5px", color: "var(--clay, #79705F)", fontWeight: 700, display: "block" }}>LONGITUDE</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink, #1C1C16)" }}>
                  {form.longitude ? `${Number(form.longitude).toFixed(6)}°` : "Detecting..."}
                </span>
              </div>
              <div style={{ background: "#FAF8F5", border: "1px solid var(--line, #E4DFD1)", borderRadius: "8px", padding: "6px 10px" }}>
                <span style={{ fontSize: "10.5px", color: "var(--clay, #79705F)", fontWeight: 700, display: "block" }}>PINCODE</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--forest, #1B6B34)" }}>
                  {form.pincode || "Fetching..."}
                </span>
              </div>
            </div>

            {locStatus && (
              <div style={{ fontSize: "11.5px", color: "var(--forest, #1B6B34)", marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                <i className="bi bi-info-circle-fill" style={{ fontSize: "12px" }} /> {locStatus}
              </div>
            )}
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>
              Description <span style={{ fontWeight: 400, color: "var(--clay, #79705F)" }}>(Optional)</span>
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={updateField("description")}
              placeholder="Describe growing method, freshness, etc."
            />
          </div>
        </div>
      );
    }

    if (currentStep === 1) {
      return (
        <div>
          <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", marginBottom: "14px" }}>
            Upload clear photos of your crop. These will be used for AI quality assessment.
          </p>

          {/* 4-Column Image Grid matching design reference */}
          <div className="farmer-upload-grid">
            {imageFiles.map((image, index) => (
              <div key={`${image.preview || image.url || index}`} className="farmer-upload-item">
                <a
                  href={image.preview || image.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="farmer-upload-link"
                  title="Click to view full image in a new tab"
                >
                  <img
                    src={image.preview || image.url}
                    alt={image.name || `Crop upload ${index + 1}`}
                    onError={(e) => {
                      if (image.fallbackUrl && e.target.src !== image.fallbackUrl) {
                        e.target.src = image.fallbackUrl;
                      }
                    }}
                  />
                  <span className="farmer-image-link-icon" title="Open full image">
                    <i className="bi bi-box-arrow-up-right" />
                  </span>
                </a>
                <button
                  type="button"
                  className="farmer-upload-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageFiles((prev) => prev.filter((_, i) => i !== index));
                  }}
                  title="Remove image"
                  aria-label="Remove image"
                >
                  &times;
                </button>
              </div>
            ))}

            {/* The 4th slot / Add photo tile matching design reference */}
            <div
              className="farmer-add-photo-tile"
              title="Click to add photos of your crop"
              onClick={() => setShowSourceModal(true)}
            >
              <i className="bi bi-camera" style={{ fontSize: "22px", color: "var(--forest, #1B6B34)" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink, #1C1C16)" }}>Add photo</span>
            </div>
          </div>

          {/* Hidden Device File Picker & Canvas for Photo Snapping */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelection}
            style={{ display: "none" }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Source Selection Modal (Live Camera or Device Photo) */}
          {showSourceModal && (
            <div className="farmer-modal-backdrop" onClick={() => setShowSourceModal(false)}>
              <div className="farmer-photo-modal p-4" onClick={(e) => e.stopPropagation()}>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h3 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "var(--forest, #1B6B34)" }}>
                    Add Crop Photo
                  </h3>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setShowSourceModal(false)}
                  />
                </div>

                <p style={{ fontSize: "13px", color: "var(--clay, #79705F)", marginBottom: "16px" }}>
                  Choose how you want to add photos for your crop:
                </p>

                {cameraError && (
                  <div className="alert alert-warning py-2 px-3 mb-3 small d-flex align-items-center gap-2">
                    <i className="bi bi-exclamation-triangle-fill text-warning" />
                    <span>{cameraError}</span>
                  </div>
                )}

                <button
                  type="button"
                  className="farmer-photo-choice-card"
                  onClick={() => startCamera("environment")}
                >
                  <div className="farmer-choice-icon-wrap" style={{ background: "#E8F5E9", color: "#1B6B34" }}>
                    <i className="bi bi-camera-fill" style={{ fontSize: "26px" }} />
                  </div>
                  <div className="farmer-choice-text">
                    <div className="farmer-choice-title">Take Photo (Live Camera)</div>
                    <div className="farmer-choice-desc">Open live camera to snap fresh crop photos directly</div>
                  </div>
                  <i className="bi bi-chevron-right text-muted" />
                </button>

                <button
                  type="button"
                  className="farmer-photo-choice-card"
                  onClick={() => {
                    setShowSourceModal(false);
                    if (fileInputRef.current) fileInputRef.current.click();
                  }}
                >
                  <div className="farmer-choice-icon-wrap" style={{ background: "#E3F2FD", color: "#1976D2" }}>
                    <i className="bi bi-images" style={{ fontSize: "26px" }} />
                  </div>
                  <div className="farmer-choice-text">
                    <div className="farmer-choice-title">Choose from Device / Gallery</div>
                    <div className="farmer-choice-desc">Select photos from your device storage or files</div>
                  </div>
                  <i className="bi bi-chevron-right text-muted" />
                </button>
              </div>
            </div>
          )}

          {/* Live Camera Viewfinder Modal */}
          {cameraActive && (
            <div className="farmer-modal-backdrop" onClick={closeCamera}>
              <div className="farmer-photo-modal" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
                <div className="p-3 d-flex align-items-center justify-content-between" style={{ background: "#111", color: "#FFF" }}>
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-camera-video-fill text-success" />
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>Live Camera Preview</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm text-white"
                    onClick={closeCamera}
                    style={{ fontSize: "18px", padding: "0 6px", lineHeight: 1 }}
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
                  <div className="farmer-camera-shutter-bar">
                    <button
                      type="button"
                      className="btn text-white d-flex flex-column align-items-center"
                      onClick={switchCamera}
                      title="Switch Camera (Front/Rear)"
                      style={{ fontSize: "12px", gap: "2px" }}
                    >
                      <i className="bi bi-arrow-repeat fs-4" />
                      <span>Flip</span>
                    </button>

                    <button
                      type="button"
                      className="farmer-camera-shutter-btn"
                      onClick={capturePhoto}
                      title="Capture Photo"
                    >
                      <i className="bi bi-camera-fill" />
                    </button>

                    <button
                      type="button"
                      className="btn text-white d-flex flex-column align-items-center"
                      onClick={closeCamera}
                      title="Cancel"
                      style={{ fontSize: "12px", gap: "2px" }}
                    >
                      <i className="bi bi-x-circle fs-4 text-danger" />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (currentStep === 2) {
      return (
        <div style={{ background: "var(--sage-light, #E3F5E4)", borderRadius: "10px", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--forest, #1B6B34)", fontSize: "14px" }}>
            <i className="bi bi-stars" /> AI Crop Quality Assessment
          </div>
          {qualityLoading ? (
            <div style={{ marginTop: "16px", padding: "20px", textAlign: "center", color: "var(--forest, #1B6B34)" }}>
              <div className="spinner-border spinner-border-sm mb-2" role="status" style={{ width: "24px", height: "24px" }} />
              <div style={{ fontSize: "13.5px", fontWeight: 600 }}>Analyzing crop quality using on-device/backend ONNX model...</div>
            </div>
          ) : quality ? (
            <>
              <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <div style={{ fontSize: "11.5px", color: "var(--clay, #79705F)", fontWeight: 600 }}>QUALITY CLASS</div>
                  <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "22px", fontWeight: 600, color: "var(--forest, #1B6B34)" }}>
                    {quality.result_metadata?.grade ? `${quality.result_metadata.grade} (${quality.quality_label})` : quality.quality_label || "Pending"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11.5px", color: "var(--clay, #79705F)", fontWeight: 600 }}>CONFIDENCE SCORE</div>
                  <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "22px", fontWeight: 600, color: "var(--forest, #1B6B34)" }}>
                    {quality.confidence != null ? `${Math.round(Number(quality.confidence) * 100)}%` : "N/A"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11.5px", color: "var(--clay, #79705F)", fontWeight: 600 }}>STATUS</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "4px" }}>{quality.prediction_status}</div>
                </div>
                <div>
                  <div style={{ fontSize: "11.5px", color: "var(--clay, #79705F)", fontWeight: 600 }}>MODEL</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "4px" }}>{quality.model_name || "crop-quality-mobilenet-v2"}</div>
                </div>
              </div>
              <div style={{ height: "1px", background: "var(--line, #E4DFD1)", margin: "14px 0" }} />
              <div style={{ fontSize: "12.5px", color: "var(--forest-2, #164024)", lineHeight: 1.6 }}>
                <b>Explanation:</b> {quality.result_metadata?.quality_description || quality.result_metadata?.reason || "Real-time visual quality inference completed."}
              </div>
            </>
          ) : (
            <div style={{ marginTop: "12px" }}>
              <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", marginBottom: "12px" }}>
                No completed quality assessment yet. Click Continue to run the real AI quality assessment on your uploaded crop image.
              </p>
              <button
                type="button"
                className="btn btn-sm btn-outline-success"
                onClick={runQualityPrediction}
                disabled={qualityLoading}
              >
                {qualityLoading ? "Running assessment..." : "Run Quality Assessment Now"}
              </button>
            </div>
          )}
        </div>
      );
    }

    if (currentStep === 3) {
      return (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--forest, #1B6B34)", marginBottom: "14px" }}>
            <i className="bi bi-graph-up-arrow" /> Market Price Reference
          </div>
          <div className="kv" style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line, #E4DFD1)" }}>
            <span style={{ color: "var(--clay, #79705F)" }}>Market reference price</span>
            <b>{market?.current ? `${money(market.current)} / ${form.unit || "kg"}` : "Market feed unavailable"}</b>
          </div>
          <div className="kv" style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line, #E4DFD1)" }}>
            <span style={{ color: "var(--clay, #79705F)" }}>7-day range</span>
            <b>{market?.range ? `${money(market.range[0])} – ${money(market.range[1])}` : "Market feed unavailable"}</b>
          </div>
          <div className="kv" style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
            <span style={{ color: "var(--clay, #79705F)" }}>Your listed price</span>
            <b>{form.asking_price && Number(form.asking_price) > 0 ? `${money(form.asking_price)} / ${form.unit || "kg"}` : "Not entered"}</b>
          </div>
          {!market?.current && (
            <div style={{ marginTop: "14px", padding: "10px", background: "#FAF8F5", borderRadius: "8px", fontSize: "12px", color: "var(--clay, #79705F)" }}>
              <i className="bi bi-info-circle me-1" /> External APMC mandi market price feed is currently unconfigured. Your entered listing price will be used.
            </div>
          )}
        </div>
      );
    }

    if (currentStep === 4) {
      const isModelUnavailable = price && (price.prediction_status === "MODEL_UNAVAILABLE" || price.predicted_price == null);
      const hasValidPrediction = price && !isModelUnavailable && price.predicted_price != null && Number(price.predicted_price) > 0;

      return (
        <div>
          <div style={{ background: "var(--ochre-light, #FEF7EE)", borderRadius: "10px", padding: "16px", border: "1px solid #EBD8C1" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontWeight: 700, color: "#8A5A1C", fontSize: "14px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <i className="bi bi-lightning-charge-fill" /> AI Price Recommendation
              </span>
              {price && !priceLoading && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "6px",
                    background: isModelUnavailable ? "#F5E6D3" : "#D4EDDA",
                    color: isModelUnavailable ? "#8A5A1C" : "#155724",
                  }}
                >
                  {isModelUnavailable ? "MODEL UNAVAILABLE" : (price.prediction_status || "COMPLETED")}
                </span>
              )}
            </div>

            {priceLoading ? (
              <div style={{ marginTop: "14px", padding: "16px", textAlign: "center", color: "#8A5A1C" }}>
                <div className="spinner-border spinner-border-sm mb-2" role="status" style={{ width: "20px", height: "20px" }} />
                <div style={{ fontSize: "13px", fontWeight: 600 }}>Evaluating fair price recommendation using AI pricing model...</div>
              </div>
            ) : hasValidPrediction ? (
              <>
                <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "11.5px", color: "#8A5A1C", fontWeight: 600 }}>SUGGESTED LISTING PRICE</div>
                    <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "22px", fontWeight: 600, color: "var(--forest, #1B6B34)" }}>
                      {money(price.predicted_price)} / {form.unit || "kg"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11.5px", color: "#8A5A1C", fontWeight: 600 }}>CONFIDENCE</div>
                    <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "22px", fontWeight: 600, color: "var(--forest, #1B6B34)" }}>
                      {price.confidence != null ? `${Math.round(Number(price.confidence) * 100)}%` : "Standard"}
                    </div>
                  </div>
                  {price.result_metadata?.range && (
                    <div>
                      <div style={{ fontSize: "11.5px", color: "#8A5A1C", fontWeight: 600 }}>RECOMMENDED RANGE</div>
                      <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "4px" }}>
                        {money(price.result_metadata.range[0])} – {money(price.result_metadata.range[1])}
                      </div>
                    </div>
                  )}
                  {form.asking_price && Number(price.predicted_price) >= Number(form.asking_price) && (
                    <div>
                      <div style={{ fontSize: "11.5px", color: "#8A5A1C", fontWeight: 600 }}>ESTIMATED MARGIN</div>
                      <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "4px" }}>
                        +{money(Number(price.predicted_price) - Number(form.asking_price))}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ height: "1px", background: "#EBD8C1", margin: "14px 0" }} />
                <div style={{ fontSize: "12.5px", color: "#684310", lineHeight: 1.6 }}>
                  <b>Explanation:</b> {price.result_metadata?.reason || "Recommendation computed using real quality grade and hub pricing model."}
                </div>
              </>
            ) : isModelUnavailable ? (
              <div style={{ marginTop: "12px" }}>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", fontWeight: 600, color: "#8A5A1C" }}>
                  AI fair-price model is currently unavailable for this crop.
                </p>
                <p style={{ margin: 0, fontSize: "12.5px", color: "#684310", lineHeight: 1.5 }}>
                  {price.result_metadata?.reason || "No trained and evaluated price model artifact is configured."} You can specify your listing price manually below.
                </p>
              </div>
            ) : (
              <p style={{ marginTop: "12px", fontSize: "13.5px", color: "var(--clay, #79705F)" }}>
                Click Continue to evaluate fair price recommendation using the AI pricing model.
              </p>
            )}
          </div>

          <div className="field" style={{ marginTop: "16px" }}>
            <label style={{ fontWeight: 600, color: "var(--ink, #1C1C16)", fontSize: "13.5px", display: "block", marginBottom: "6px" }}>
              Your listing price (₹/{form.unit || "kg"})
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.asking_price}
              onChange={updateField("asking_price")}
              placeholder="e.g. 28"
              required
            />
          </div>
        </div>
      );
    }

    const step1Err = validateStep1();
    const finalPriceNum = Number(form.asking_price);
    const isPublishable = !step1Err && !isNaN(finalPriceNum) && finalPriceNum > 0;

    return (
      <div>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "14px", color: "var(--forest, #1B6B34)" }}>
          Review your listing
        </h3>

        {!isPublishable && (
          <div className="alert alert-warning d-flex align-items-center gap-2 mb-3" style={{ fontSize: "13px", borderRadius: "8px" }}>
            <i className="bi bi-exclamation-triangle-fill text-warning flex-shrink-0" />
            <div style={{ flex: 1 }}>
              <b>Incomplete listing details:</b> {step1Err || "A valid listing price greater than ₹0 is required before publishing."}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-dark"
              style={{ fontSize: "12px", padding: "2px 8px" }}
              onClick={() => setCurrentStep(0)}
            >
              Edit Details
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          <div style={{ width: "80px", height: "80px", borderRadius: "10px", overflow: "hidden", background: "#FAF8F5", border: "1px solid var(--line, #E4DFD1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {imageFiles[0]?.preview ? (
              <a
                href={imageFiles[0].preview || imageFiles[0].url}
                target="_blank"
                rel="noopener noreferrer"
                title="Click hyperlink to view full image in a new tab"
                style={{ display: "block", width: "100%", height: "100%" }}
              >
                <img src={imageFiles[0].preview || imageFiles[0].url} alt={form.crop_name || "Crop"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </a>
            ) : (
              <i className="bi bi-image" style={{ fontSize: "24px", color: "var(--clay, #79705F)" }} />
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "16px", color: form.crop_name ? "var(--ink, #1C1C16)" : "#C0392B" }}>
              {form.crop_name || "Crop Name Missing (Required)"}
            </div>
            <div style={{ fontSize: "13px", color: "var(--clay, #79705F)", marginTop: "2px" }}>
              {form.crop_category || "Vegetables"} · {form.quantity ? `${form.quantity} ${form.unit || "kg"} available` : "Quantity missing (Required)"}
            </div>
            {quality?.quality_label && quality.prediction_status !== "UNAVAILABLE" && (
              <div style={{ marginTop: "6px" }}>
                <span className="badge badge-sage">AI {quality.result_metadata?.grade || (quality.quality_label === "Good" ? "Grade A" : quality.quality_label === "Average" ? "Grade B" : quality.quality_label === "Poor" ? "Grade C" : quality.quality_label)}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ height: "1px", background: "var(--line, #E4DFD1)", margin: "16px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13.5px" }}>
          <span style={{ color: "var(--clay, #79705F)" }}>Listing price</span>
          <b>{form.asking_price && Number(form.asking_price) > 0 ? `${money(form.asking_price)} / ${form.unit || "kg"}` : "Price missing (Required)"}</b>
        </div>
        {price && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13.5px" }}>
            <span style={{ color: "var(--clay, #79705F)" }}>AI price recommendation</span>
            <b>
              {price.predicted_price != null && price.prediction_status !== "MODEL_UNAVAILABLE"
                ? `${money(price.predicted_price)} / ${form.unit || "kg"}`
                : "Model unavailable (Manual price set)"}
            </b>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13.5px" }}>
          <span style={{ color: "var(--clay, #79705F)" }}>Harvest date</span>
          <b>{form.harvest_date || "Not specified"}</b>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13.5px" }}>
          <span style={{ color: "var(--clay, #79705F)" }}>Farm location</span>
          <b style={{ textAlign: "right" }}>{form.farm_location || "Not specified"}</b>
        </div>
        {form.pincode && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13.5px" }}>
            <span style={{ color: "var(--clay, #79705F)" }}>PIN Code</span>
            <b>{form.pincode}</b>
          </div>
        )}
        {form.latitude && form.longitude && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13.5px" }}>
            <span style={{ color: "var(--clay, #79705F)" }}>GPS Coordinates</span>
            <b>{Number(form.latitude).toFixed(6)}°, {Number(form.longitude).toFixed(6)}°</b>
          </div>
        )}
        {form.description && (
          <div style={{ marginTop: "12px", padding: "10px", background: "#FAF8F5", borderRadius: "8px", fontSize: "12.5px", color: "var(--clay, #79705F)" }}>
            {form.description}
          </div>
        )}
      </div>
    );
  };

  const isPublishable = !validateStep1() && !isNaN(Number(form.asking_price)) && Number(form.asking_price) > 0;

  return (
    <section className="farmer-dashboard-view add-crop-page" style={{ maxWidth: "880px", margin: "0 auto", padding: "16px 8px 60px" }}>
      {/* Standard Farmer Page Header */}
      <div className="farmer-page-header">
        <div>
          <div className="eyebrow"><i className="bi bi-flower1 me-1" /> FARM PRODUCE & HARVEST</div>
          <h1 className="farmer-page-title">{editingId ? "Edit Crop Listing" : "Add New Crop"}</h1>
          <p className="farmer-page-sub">Step-by-step listing wizard with AI quality grading, APMC mandi rates, and automated price intelligence.</p>
        </div>
        <div className="farmer-header-actions">
          <button
            type="button"
            className="kisan-btn-outline"
            onClick={onBack || (() => navigate("/farmer/crops"))}
          >
            <i className="bi bi-chevron-left me-1" /> Back to My Crops
          </button>
        </div>
      </div>

      {/* Stepper Dots Track */}
      <div
        className="step-track"
        role="navigation"
        aria-label="Add Crop Steps"
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          marginBottom: "18px",
          padding: "4px 0",
        }}
      >
        {steps.map((s, i) => {
          const isDone = i < currentStep;
          const isNow = i === currentStep;

          return (
            <div
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                flex: i < steps.length - 1 ? 1 : "0 0 auto",
              }}
            >
              <button
                type="button"
                className={`step-dot ${isDone ? "done" : isNow ? "now" : ""}`}
                onClick={() => goToStep(i)}
                title={`Click to go to Step ${i + 1}: ${s}`}
                aria-label={`Step ${i + 1}: ${s}`}
                style={{
                  width: "32px",
                  height: "32px",
                  minWidth: "32px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.2s ease",
                  backgroundColor: isDone ? "var(--forest, #1B6B34)" : "#FFFFFF",
                  color: isDone
                    ? "#FFFFFF"
                    : isNow
                    ? "var(--forest, #1B6B34)"
                    : "var(--clay, #79705F)",
                  border: isDone
                    ? "2px solid var(--forest, #1B6B34)"
                    : isNow
                    ? "2px solid var(--forest, #1B6B34)"
                    : "2px solid var(--sand, #D8D2C2)",
                  boxShadow: isNow ? "0 0 0 3px rgba(27, 107, 52, 0.12)" : "none",
                }}
              >
                {isDone ? (
                  <i className="bi bi-check" style={{ fontSize: "18px", strokeWidth: "2" }} />
                ) : (
                  i + 1
                )}
              </button>
              {i < steps.length - 1 && (
                <div
                  className={`step-line ${isDone ? "done" : ""}`}
                  onClick={() => goToStep(i + 1)}
                  title={`Click to jump to Step ${i + 2}: ${steps[i + 1]}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") goToStep(i + 1);
                  }}
                  style={{
                    flex: 1,
                    height: "2px",
                    backgroundColor: isDone ? "var(--forest, #1B6B34)" : "var(--sand, #E4DFD1)",
                    margin: "0 8px",
                    cursor: "pointer",
                    transition: "background-color 0.2s ease",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          fontSize: "14px",
          fontWeight: 700,
          color: "var(--forest, #1B6B34)",
          marginBottom: "16px",
        }}
      >
        Step {currentStep + 1} of {steps.length}: {steps[currentStep]}
      </div>

      {error && <div className="error" style={{ marginBottom: "14px" }}>{error}</div>}
      {success && <div className="success" style={{ marginBottom: "14px" }}>{success}</div>}

      <div className="card card-pad" style={{ background: "var(--paper, #FFFFFF)", border: "1px solid var(--line, #E4DFD1)", borderRadius: "14px", padding: "20px" }}>
        {renderStepContent()}
      </div>

      {/* Bottom Navigation Buttons */}
      <div className="farmer-form-bottom-actions">
        <button
          type="button"
          className="btn btn-outline"
          style={{
            borderColor: "var(--line, #D6D0C2)",
            background: "var(--paper, #FFFFFF)",
            color: "var(--ink, #1C1C16)",
            fontWeight: 600,
            padding: "12px 24px",
            fontSize: "14px",
            borderRadius: "10px",
          }}
          onClick={previousStep}
          disabled={loading || qualityLoading || priceLoading}
          aria-label="Back"
        >
          Back
        </button>

        {currentStep < steps.length - 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{
              background: "var(--forest, #1B6B34)",
              color: "#FFFFFF",
              fontWeight: 600,
              padding: "12px 24px",
              fontSize: "14px",
              borderRadius: "10px",
              border: "none",
            }}
            onClick={nextStep}
            disabled={loading || qualityLoading || priceLoading}
            aria-label="Continue"
          >
            {loading ? "Saving..." : qualityLoading ? "Assessing..." : priceLoading ? "Evaluating..." : "Continue"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-accent"
            style={{
              background: isPublishable ? "var(--ochre, #C8822A)" : "#D6D0C2",
              color: "#FFFFFF",
              fontWeight: 600,
              padding: "11px 24px",
              cursor: isPublishable ? "pointer" : "not-allowed",
            }}
            onClick={handlePublish}
            disabled={loading || !isPublishable}
            aria-label="Publish Listing"
          >
            {loading ? "Publishing..." : "Publish Listing"}
          </button>
        )}
      </div>
    </section>
  );
}
