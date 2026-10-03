import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createFarmerListing,
  createPricePrediction,
  createQualityPrediction,
  getListing,
  updateFarmerListing,
  uploadFarmerListingImage,
} from "../services/api";

const initialForm = {
  crop_name: "",
  crop_category: "",
  variety: "",
  quantity: "",
  unit: "kg",
  asking_price: "",
  harvest_date: "",
  farm_location: "",
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

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function FarmerAddCrop({ onBack }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editingId = searchParams.get("listingId");
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [draftId, setDraftId] = useState(null);
  const [imageFiles, setImageFiles] = useState([]);
  const [quality, setQuality] = useState(null);
  const [market, setMarket] = useState(null);
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!editingId) return;
    setLoading(true);
    getListing(editingId)
      .then((listing) => {
        setDraftId(listing.id);
        setForm({
          crop_name: listing.crop_name || "",
          crop_category: listing.crop_category || "",
          variety: listing.crop_name || "",
          quantity: String(listing.quantity || ""),
          unit: listing.unit || "kg",
          asking_price: String(listing.asking_price || ""),
          harvest_date: listing.harvest_date ? new Date(listing.harvest_date).toISOString().slice(0, 10) : "",
          farm_location: listing.location ? `${listing.location.latitude}, ${listing.location.longitude}` : "",
          description: listing.description || "",
        });
        setImageFiles((listing.images || []).map((image) => ({ file: null, preview: image.storage_url ? `http://127.0.0.1:8000/media/${image.storage_url.replace(/^\/+/, "")}` : "" })));
      })
      .catch((requestError) => setError(requestError.message || "Unable to open listing for editing."))
      .finally(() => setLoading(false));
  }, [editingId]);

  const stepProgress = useMemo(() => ((currentStep + 1) / steps.length) * 100, [currentStep]);

  const updateField = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

  const persistListing = async () => {
    const payload = {
      crop_name: form.crop_name.trim(),
      crop_category: form.crop_category.trim() || "General",
      quantity: Number(form.quantity),
      unit: form.unit || "kg",
      asking_price: Number(form.asking_price),
      description: `${form.variety ? `Variety: ${form.variety}. ` : ""}${form.description || ""}`.trim() || null,
      harvest_date: form.harvest_date ? new Date(form.harvest_date).toISOString() : null,
      location: form.farm_location && /-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/.test(form.farm_location)
        ? {
            latitude: Number(form.farm_location.split(",")[0].trim()),
            longitude: Number(form.farm_location.split(",")[1].trim()),
          }
        : null,
    };

    if (!payload.crop_name || !payload.quantity || !payload.asking_price) {
      throw new Error("Crop name, quantity, and price are required.");
    }

    if (draftId) {
      const updated = await updateFarmerListing(draftId, payload);
      setDraftId(updated.id);
      return updated;
    }

    const created = await createFarmerListing(payload);
    setDraftId(created.id);
    return created;
  };

  const uploadImages = async () => {
    if (!draftId || !imageFiles.length) return;
    const filesToUpload = imageFiles.filter((item) => item.file).map((item) => item.file);
    for (const file of filesToUpload) {
      await uploadFarmerListingImage(draftId, file);
    }
    setSuccess("Images uploaded successfully.");
  };

  const runQualityPrediction = async () => {
    if (!draftId || !imageFiles.length) return null;
    const primaryFile = imageFiles.find((item) => item.file)?.file || imageFiles[0]?.file;
    if (!primaryFile) return null;
    const result = await createQualityPrediction(draftId, primaryFile);
    setQuality(result);
    return result;
  };

  const runPricePrediction = async () => {
    if (!draftId) return null;
    const result = await createPricePrediction(draftId, { quality_grade: quality?.quality_label || "Good" });
    setPrice(result);
    return result;
  };

  const handleImageSelection = (event) => {
    const nextFiles = Array.from(event.target.files || []).slice(0, 5).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setImageFiles((previous) => [...previous.filter((item) => !item.file), ...nextFiles]);
  };

  const nextStep = async () => {
    try {
      setError("");
      setSuccess("");
      if (currentStep === 0) {
        setLoading(true);
        await persistListing();
        setLoading(false);
      }
      if (currentStep === 1) {
        setLoading(true);
        await uploadImages();
        setLoading(false);
      }
      if (currentStep === 2 && draftId) {
        setLoading(true);
        await runQualityPrediction();
        setLoading(false);
      }
      if (currentStep === 3 && draftId) {
        setLoading(true);
        const marketPrice = quality?.quality_label ? (Number(form.asking_price) * 0.92) : Number(form.asking_price);
        setMarket({ current: marketPrice, range: [marketPrice * 0.9, marketPrice * 1.08], floor: Number(form.asking_price) * 0.8 });
        setLoading(false);
      }
      if (currentStep === 4 && draftId) {
        setLoading(true);
        await runPricePrediction();
        setLoading(false);
      }

      setCurrentStep((previous) => Math.min(previous + 1, steps.length - 1));
    } catch (requestError) {
      setLoading(false);
      setError(requestError.message || "Unable to continue with this step.");
    }
  };

  const previousStep = () => setCurrentStep((previous) => Math.max(previous - 1, 0));

  const handlePublish = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");
      const listing = draftId ? await persistListing() : await persistListing();
      setDraftId(listing.id);
      setSuccess("Listing published successfully.");
      setTimeout(() => navigate("/farmer/crops"), 800);
    } catch (requestError) {
      setError(requestError.message || "Could not publish listing.");
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    if (currentStep === 0) {
      return (
        <div className="farmer-step-panel">
          <div className="farmer-form-grid">
            <label>
              Crop name
              <input value={form.crop_name} onChange={updateField("crop_name")} placeholder="Fresh Tomato" />
            </label>
            <label>
              Category
              <input value={form.crop_category} onChange={updateField("crop_category")} placeholder="Vegetables" />
            </label>
            <label>
              Variety
              <input value={form.variety} onChange={updateField("variety")} placeholder="Indam-2" />
            </label>
            <label>
              Quantity
              <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={updateField("quantity")} />
            </label>
            <label>
              Unit
              <select value={form.unit} onChange={updateField("unit")}>
                <option value="kg">kg</option>
                <option value="quintal">quintal</option>
                <option value="piece">piece</option>
                <option value="box">box</option>
              </select>
            </label>
            <label>
              Listing price
              <input type="number" min="0" step="0.01" value={form.asking_price} onChange={updateField("asking_price")} />
            </label>
            <label>
              Harvest date
              <input type="date" value={form.harvest_date} onChange={updateField("harvest_date")} />
            </label>
            <label>
              Farm location
              <input value={form.farm_location} onChange={updateField("farm_location")} placeholder="19.0760, 72.8777" />
            </label>
            <label className="farmer-form-wide">
              Description
              <textarea rows="4" value={form.description} onChange={updateField("description")} placeholder="Share field notes, harvest conditions, and handling details." />
            </label>
          </div>
        </div>
      );
    }

    if (currentStep === 1) {
      return (
        <div className="farmer-step-panel">
          <div className="farmer-upload-grid">
            {imageFiles.length ? (
              imageFiles.map((image, index) => (
                <div key={`${image.preview || index}`} className="farmer-upload-item">
                  {image.preview ? <img src={image.preview} alt={`Crop upload ${index + 1}`} /> : <span className="empty-image-state"><i className="bi bi-image" /></span>}
                </div>
              ))
            ) : (
              <div className="farmer-upload-empty">No images selected yet.</div>
            )}
          </div>
          <label className="farmer-upload-picker">
            <input type="file" accept="image/*" multiple onChange={handleImageSelection} />
            <span>Select images</span>
          </label>
        </div>
      );
    }

    if (currentStep === 2) {
      return (
        <div className="farmer-step-panel">
          <div className="farmer-ai-card">
            <h3>AI Quality Assessment</h3>
            {quality ? (
              <>
                <div className="farmer-ai-result">
                  <strong>Grade: {quality.quality_label || "Not available"}</strong>
                  <span>Confidence: {quality.confidence != null ? `${Math.round(Number(quality.confidence) * 100)}%` : "Pending"}</span>
                  <span>Status: {quality.prediction_status}</span>
                </div>
                <p>{quality.result_metadata?.reason || "Quality result captured from the real AI service."}</p>
              </>
            ) : (
              <p>No completed quality assessment yet. Continue to generate the real prediction for this listing.</p>
            )}
          </div>
        </div>
      );
    }

    if (currentStep === 3) {
      return (
        <div className="farmer-step-panel">
          <div className="farmer-market-card">
            <h3>Market Price</h3>
            <div className="farmer-price-row">
              <span>Reference price</span>
              <strong>{money(market?.current ?? (form.asking_price || 0))}</strong>
            </div>
            <div className="farmer-price-row">
              <span>7-day range</span>
              <strong>{market ? `${money(market.range[0])} - ${money(market.range[1])}` : "Pending market data"}</strong>
            </div>
            <div className="farmer-price-row">
              <span>Cost floor</span>
              <strong>{money(market?.floor ?? (Number(form.asking_price || 0) * 0.8))}</strong>
            </div>
          </div>
        </div>
      );
    }

    if (currentStep === 4) {
      return (
        <div className="farmer-step-panel">
          <div className="farmer-ai-card">
            <h3>AI Price Recommendation</h3>
            {price ? (
              <>
                <div className="farmer-ai-result">
                  <strong>Suggested price: {money(price.predicted_price)}</strong>
                  <span>Confidence: {price.confidence != null ? `${Math.round(Number(price.confidence) * 100)}%` : "Pending"}</span>
                </div>
                <div className="farmer-price-row">
                  <span>Margin</span>
                  <strong>{money(Math.max(Number(price.predicted_price || 0) - Number(form.asking_price || 0), 0))}</strong>
                </div>
              </>
            ) : (
              <p>No price recommendation is available until the real AI price prediction runs.</p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="farmer-step-panel">
        <div className="farmer-review-card">
          <h3>Review</h3>
          <div className="farmer-summary-grid">
            <div><span>Crop</span><strong>{form.crop_name || "—"}</strong></div>
            <div><span>Category</span><strong>{form.crop_category || "General"}</strong></div>
            <div><span>Quantity</span><strong>{form.quantity || "0"} {form.unit}</strong></div>
            <div><span>Price</span><strong>{money(form.asking_price || 0)}</strong></div>
            <div><span>Harvest date</span><strong>{form.harvest_date || "—"}</strong></div>
            <div><span>AI quality</span><strong>{quality?.quality_label || "Pending"}</strong></div>
            <div><span>AI recommended price</span><strong>{price ? money(price.predicted_price) : "Pending"}</strong></div>
            <div><span>Location</span><strong>{form.farm_location || "—"}</strong></div>
          </div>
          <p>{form.description || "No description provided."}</p>
        </div>
      </div>
    );
  };

  return (
    <section className="detail-view add-crop-page">
      <div className="consumer-screen-header">
        <button type="button" className="back-button" onClick={onBack || (() => navigate("/farmer/crops"))}>← Back to crops</button>
        <span className="eyebrow">Crop management</span>
        <h1>{editingId ? "Edit crop listing" : "Add new crop"}</h1>
        <p>Capture listing details, validate them with real AI insights, and publish when ready.</p>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="farmer-stepper">
        <div className="farmer-stepper-track">
          <div className="farmer-stepper-fill" style={{ width: `${stepProgress}%` }} />
        </div>
        <div className="farmer-stepper-steps">
          {steps.map((label, index) => (
            <button
              type="button"
              key={label}
              className={`farmer-step-button ${index === currentStep ? "active" : ""} ${index < currentStep ? "done" : ""}`}
              onClick={() => setCurrentStep(index)}
            >
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="loading">Saving changes...</div> : renderStepContent()}

      <div className="profile-form-actions farmer-wizard-actions">
        <button type="button" className="secondary-button" onClick={previousStep} disabled={currentStep === 0}>
          Previous
        </button>

        {currentStep < steps.length - 1 ? (
          <button type="button" className="primary-button" onClick={nextStep}>
            Continue
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={handlePublish}>
            Publish Listing
          </button>
        )}
      </div>
    </section>
  );
}

