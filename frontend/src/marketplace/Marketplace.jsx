import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addCartItem } from "../services/cartApi";
import { listListings } from "../services/marketplaceApi";
import ProductCard from "./ProductCard";
import { initialFilters } from "../utils/listing";
import { useI18n } from "../i18n";

export default function Marketplace({ user }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { setLoading(true); listListings(filters).then(setData).catch((error) => setStatus(error.message)).finally(() => setLoading(false)); }, [filters]);
  const update = (key) => (event) => setFilters({ ...filters, [key]: event.target.value, page: 1 });
  async function addToCart(item) { try { await addCartItem({ listing_id: item.id, quantity: item.minimum_order_quantity || 1 }); setStatus("Added to cart."); } catch (error) { setStatus(error.message); } }

  return <section className="marketplace-view"><section className="hero"><div><span className="eyebrow">{t("marketplace")}</span><h1>{t("heroTitle")}</h1><p>{t("heroSubtitle")}</p></div><div className="hero-note"><b>{data.total}</b><span>{t("activeListings")}</span></div></section>{status && <div className="info-box">{status}</div>}<section className="controls premium-controls"><input placeholder={t("searchCrops") || "Search crops..."} value={filters.search} onChange={update("search")} /><input placeholder={t("category") || "Category"} value={filters.category} onChange={update("category")} /><input placeholder={t("quality") || "Quality"} value={filters.quality} onChange={update("quality")} /><input type="number" min="0" placeholder={t("minPrice") || "Budget from"} value={filters.min_price} onChange={update("min_price")} /><select value={filters.sort} onChange={update("sort")}><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="nearest">Nearest</option></select></section>{loading ? <div className="loading">{t("loading")}</div> : data.items.length ? <div className="listing-grid">{data.items.map((item) => <ProductCard key={item.id} item={item} onOpen={(id) => navigate(`/p/${id}`)} onAddToCart={user?.role === "CONSUMER" ? addToCart : null} />)}</div> : <div className="empty"><h2>{t("noListings")}</h2><p>{t("tryFilters")}</p></div>}{data.pages > 1 && <div className="pagination"><button disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button><span>Page {filters.page} of {data.pages}</span><button disabled={filters.page >= data.pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button></div>}</section>;
}
