import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import AdminFilterTabs from "../components/AdminFilterTabs";
import AdminDetailDrawer from "../components/AdminDetailDrawer";
import { listAdminListings } from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export default function AdminListingsPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedListing, setSelectedListing] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listAdminListings();
      setListings(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || "Failed to load crop listings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((item) => {
      const matchesSearch =
        !q ||
        `${item.crop_name || ""} ${item.farmer_name || ""} ${item.crop_category || ""} ${item.id || ""}`
          .toLowerCase()
          .includes(q);
      const matchesStatus =
        statusFilter === "ALL" || (item.availability_status || "").toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [listings, search, statusFilter]);

  const handleView = (listing, e) => {
    if (e) e.stopPropagation();
    setSelectedListing(listing);
    setDrawerOpen(true);
  };

  const columns = [
    {
      key: "crop_name",
      label: "Crop Produce",
      sortable: true,
      render: (item) => (
        <div>
          <strong>{item.crop_name}</strong>
          <div className="text-muted small">{item.crop_category || "General"}</div>
        </div>
      ),
    },
    {
      key: "farmer_name",
      label: "Producer / Farmer",
      sortable: true,
      render: (item) => (
        <div>
          <span>{item.farmer_name}</span>
          {item.farmer_email && <div className="text-muted small">{item.farmer_email}</div>}
        </div>
      ),
    },
    {
      key: "quantity",
      label: "Stock Available",
      sortable: true,
      render: (item) => `${item.quantity} ${item.unit}`,
    },
    {
      key: "asking_price",
      label: "Asking Price",
      sortable: true,
      render: (item) => <strong>{money(item.asking_price || 0)}</strong>,
    },
    {
      key: "ai_quality_label",
      label: "AI Quality Grade",
      render: (item) => (
        <span className="admin-badge quality-badge">
          <i className="bi bi-patch-check-fill me-1" />
          {item.ai_quality_label || item.ai_quality_status || "Pending Audit"}
        </span>
      ),
    },
    {
      key: "availability_status",
      label: "Status",
      sortable: true,
      render: (item) => (
        <span className={`admin-badge admin-badge-${String(item.availability_status).toLowerCase()}`}>
          {item.availability_status}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      width: "110px",
      align: "right",
      render: (item) => (
        <button
          type="button"
          className="admin-table-action-btn"
          onClick={(e) => handleView(item, e)}
        >
          <i className="bi bi-eye" /> View
        </button>
      ),
    },
  ];

  const statusTabs = [
    { key: "ALL", label: "All Listings", count: listings.length },
    {
      key: "AVAILABLE",
      label: "Available",
      count: listings.filter((l) => (l.availability_status || "").toUpperCase() === "AVAILABLE").length,
    },
    {
      key: "SOLD_OUT",
      label: "Sold Out",
      count: listings.filter((l) => (l.availability_status || "").toUpperCase() === "SOLD_OUT").length,
    },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Inventory Oversight</span>
          <h1>Marketplace Listings</h1>
          <p>Inspect farmer-supplied crop lots, quantity reservations, pricing, and AI quality classifications.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-btn-secondary" onClick={loadListings} disabled={loading}>
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <AdminFilterTabs tabs={statusTabs} activeTab={statusFilter} onChange={setStatusFilter} />

      <AdminDataTable
        columns={columns}
        data={filteredListings}
        loading={loading}
        error={error}
        onRetry={loadListings}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search crop listings by produce, farmer, or category..."
        pageSize={12}
        emptyTitle="No crop listings found"
        emptyDescription="There are no agricultural produce listings matching your current filter criteria."
        onRowClick={handleView}
      />

      {/* Listing Detail Drawer */}
      <AdminDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedListing?.crop_name || "Listing Details"}
        subtitle={selectedListing?.crop_category || "Agricultural Produce"}
        badge={
          selectedListing && (
            <span
              className={`admin-badge admin-badge-${String(
                selectedListing.availability_status
              ).toLowerCase()}`}
            >
              {selectedListing.availability_status}
            </span>
          )
        }
      >
        {selectedListing && (
          <>
            <section className="admin-detail-section">
              <h4>Produce Specification</h4>
              <dl className="admin-detail-list">
                <dt>Listing ID</dt>
                <dd className="font-monospace">{selectedListing.id}</dd>
                <dt>Crop Name</dt>
                <dd>{selectedListing.crop_name}</dd>
                <dt>Category</dt>
                <dd>{selectedListing.crop_category || "General Produce"}</dd>
                <dt>Available Qty</dt>
                <dd>{`${selectedListing.quantity} ${selectedListing.unit}`}</dd>
                <dt>Asking Price</dt>
                <dd><strong>{money(selectedListing.asking_price || 0)}</strong></dd>
                <dt>Created Date</dt>
                <dd>{formatDate(selectedListing.created_at)}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Farmer & Source</h4>
              <dl className="admin-detail-list">
                <dt>Farmer Name</dt>
                <dd>{selectedListing.farmer_name}</dd>
                <dt>Contact Email</dt>
                <dd>{selectedListing.farmer_email || "Not specified"}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>AI Quality & Price Model</h4>
              <dl className="admin-detail-list">
                <dt>Quality Label</dt>
                <dd>
                  <span className="admin-badge quality-badge">
                    {selectedListing.ai_quality_label || "No label assigned"}
                  </span>
                </dd>
                <dt>Quality Status</dt>
                <dd>{selectedListing.ai_quality_status || "Pending"}</dd>
                <dt>Model Price</dt>
                <dd>
                  {selectedListing.ai_price_predicted_price != null
                    ? money(selectedListing.ai_price_predicted_price)
                    : "Not evaluated"}
                </dd>
                <dt>Price Model Status</dt>
                <dd>{selectedListing.ai_price_prediction_status || "Pending"}</dd>
              </dl>
            </section>
          </>
        )}
      </AdminDetailDrawer>
    </div>
  );
}
