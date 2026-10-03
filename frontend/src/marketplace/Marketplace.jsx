import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addCartItem } from "../services/cartApi";
import { listListings } from "../services/marketplaceApi";
import ProductCard from "./ProductCard";
import { initialFilters } from "../utils/listing";
import { useI18n } from "../i18n";

export default function Marketplace({ user }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const marketplaceMode = searchParams.get("view") === "marketplace";

  useEffect(() => { setLoading(true); listListings(filters).then(setData).catch((error) => setStatus(error.message)).finally(() => setLoading(false)); }, [filters]);
  const update = (key) => (event) => setFilters({ ...filters, [key]: event.target.value, page: 1 });
  async function addToCart(item) { try { await addCartItem({ listing_id: item.id, quantity: item.minimum_order_quantity || 1 }); setStatus("Added to cart."); } catch (error) { setStatus(error.message); } }

  const categories = ["", "Vegetables", "Fruits", "Grains", "Pulses", "Roots & Tubers", "Spices", "Millets"];
  return <section className={`marketplace-view consumer-marketplace ${marketplaceMode ? "marketplace-mode" : "home-mode"}`}>{!marketplaceMode && <section className="consumer-home-hero"><div><span className="eyebrow">KisanDirect marketplace</span><h1>Fresh picks from farms near you.</h1><p>Browse current listings from local farmers and add only what is really available.</p><button className="accent-button" onClick={() => document.querySelector(".consumer-listings")?.scrollIntoView({ behavior: "smooth" })}>Shop fresh crops</button></div></section>}<div className="consumer-section-heading"><h2>{marketplaceMode ? "Marketplace" : "Fresh crops near you"}</h2><button className="text-link" onClick={() => document.querySelector(".consumer-listings")?.scrollIntoView({ behavior: "smooth" })}>See all</button></div><section className="consumer-search-panel"><label className="search-control"><i className="bi bi-search" /><input placeholder={t("searchCrops") || "Search crops, farmers..."} value={filters.search} onChange={update("search")} /></label><button className="filter-button" type="button" aria-label="Show filters"><i className="bi bi-sliders" /><span>Filter</span></button></section><div className="consumer-category-row">{categories.map((category) => <button className={filters.category === category ? "active" : ""} key={category || "all"} onClick={() => setFilters({ ...filters, category, page: 1 })}>{category || "All"}</button>)}</div>{status && <div className="info-box">{status}</div>}<section className="consumer-listings">{loading ? <div className="loading"><span className="loading-mark" />{t("loading")}</div> : data.items.length ? <div className="listing-grid">{data.items.map((item) => <ProductCard key={item.id} item={item} onOpen={(id) => navigate(`/p/${id}`)} onAddToCart={user?.role === "CONSUMER" ? addToCart : null} />)}</div> : <div className="empty"><h2>{t("noListings")}</h2><p>{t("tryFilters")}</p></div>}</section>{data.pages > 1 && <div className="pagination"><button disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button><span>Page {filters.page} of {data.pages}</span><button disabled={filters.page >= data.pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button></div>}</section>;
}
