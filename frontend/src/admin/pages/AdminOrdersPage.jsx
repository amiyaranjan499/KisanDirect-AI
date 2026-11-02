import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import AdminFilterTabs from "../components/AdminFilterTabs";
import AdminDetailDrawer from "../components/AdminDetailDrawer";
import { listAdminOrders } from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listAdminOrders();
      setOrders(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || "Failed to load platform orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesSearch =
        !q ||
        `${o.id || ""} ${o.consumer_name || ""} ${o.consumer_email || ""} ${o.status || ""}`
          .toLowerCase()
          .includes(q);
      const matchesStatus =
        statusFilter === "ALL" || (o.status || "").toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const handleView = (order, e) => {
    if (e) e.stopPropagation();
    setSelectedOrder(order);
    setDrawerOpen(true);
  };

  const columns = [
    {
      key: "id",
      label: "Order Reference",
      sortable: true,
      width: "140px",
      render: (o) => (
        <strong className="font-monospace text-forest">
          {`ORD-${String(o.id).slice(0, 8).toUpperCase()}`}
        </strong>
      ),
    },
    {
      key: "consumer_name",
      label: "Customer",
      sortable: true,
      render: (o) => (
        <div>
          <span>{o.consumer_name || "Customer"}</span>
          {o.consumer_email && <div className="text-muted small">{o.consumer_email}</div>}
        </div>
      ),
    },
    {
      key: "item_count",
      label: "Items",
      sortable: true,
      align: "center",
      width: "90px",
      render: (o) => `${o.item_count ?? 1} item(s)`,
    },
    {
      key: "total_amount",
      label: "Order Total",
      sortable: true,
      render: (o) => <strong>{money(o.total_amount || 0)}</strong>,
    },
    {
      key: "status",
      label: "Order Status",
      sortable: true,
      render: (o) => (
        <span className={`admin-badge admin-badge-${String(o.status).toLowerCase()}`}>
          {o.status}
        </span>
      ),
    },
    {
      key: "payment_status",
      label: "Payment",
      sortable: true,
      render: (o) => (
        <span className={`admin-badge admin-badge-${String(o.payment_status || "pending").toLowerCase()}`}>
          {o.payment_status || "Pending"}
        </span>
      ),
    },
    {
      key: "delivery_status",
      label: "Fulfillment",
      sortable: true,
      render: (o) => (
        <span className={`admin-badge admin-badge-${String(o.delivery_status || "pending").toLowerCase()}`}>
          {o.delivery_status || "Pending"}
        </span>
      ),
    },
    {
      key: "created_at",
      label: "Placed At",
      sortable: true,
      render: (o) => formatDate(o.created_at),
    },
    {
      key: "actions",
      label: "Actions",
      width: "100px",
      align: "right",
      render: (o) => (
        <button
          type="button"
          className="admin-table-action-btn"
          onClick={(e) => handleView(o, e)}
        >
          <i className="bi bi-eye" /> View
        </button>
      ),
    },
  ];

  const statusTabs = [
    { key: "ALL", label: "All Orders", count: orders.length },
    {
      key: "PENDING",
      label: "Pending",
      count: orders.filter((o) => (o.status || "").toUpperCase() === "PENDING").length,
    },
    {
      key: "CONFIRMED",
      label: "Confirmed",
      count: orders.filter((o) => (o.status || "").toUpperCase() === "CONFIRMED").length,
    },
    {
      key: "COMPLETED",
      label: "Completed",
      count: orders.filter((o) => (o.status || "").toUpperCase() === "COMPLETED").length,
    },
    {
      key: "CANCELLED",
      label: "Cancelled",
      count: orders.filter((o) => (o.status || "").toUpperCase() === "CANCELLED").length,
    },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Commerce Operations</span>
          <h1>Customer Orders</h1>
          <p>Monitor end-to-end order processing, inventory reservations, settlement, and customer delivery states.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-btn-secondary" onClick={loadOrders} disabled={loading}>
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <AdminFilterTabs tabs={statusTabs} activeTab={statusFilter} onChange={setStatusFilter} />

      <AdminDataTable
        columns={columns}
        data={filteredOrders}
        loading={loading}
        error={error}
        onRetry={loadOrders}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search orders by reference ID, customer name, or status..."
        pageSize={12}
        emptyTitle="No orders found"
        emptyDescription="There are no consumer orders matching your active filter criteria."
        onRowClick={handleView}
      />

      {/* Order Detail Drawer */}
      <AdminDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`Order ORD-${String(selectedOrder?.id || "").slice(0, 8).toUpperCase()}`}
        subtitle={`Placed on ${formatDate(selectedOrder?.created_at)}`}
        badge={
          selectedOrder && (
            <span className={`admin-badge admin-badge-${String(selectedOrder.status).toLowerCase()}`}>
              {selectedOrder.status}
            </span>
          )
        }
      >
        {selectedOrder && (
          <>
            <section className="admin-detail-section">
              <h4>Order Breakdown</h4>
              <dl className="admin-detail-list">
                <dt>Full Order UUID</dt>
                <dd className="font-monospace">{selectedOrder.id}</dd>
                <dt>Order Total</dt>
                <dd><strong>{money(selectedOrder.total_amount || 0)}</strong></dd>
                <dt>Total Items</dt>
                <dd>{selectedOrder.item_count ?? 1} item(s)</dd>
                <dt>Created Timestamp</dt>
                <dd>{formatDate(selectedOrder.created_at)}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Customer Information</h4>
              <dl className="admin-detail-list">
                <dt>Customer Name</dt>
                <dd>{selectedOrder.consumer_name || "Guest / Direct Consumer"}</dd>
                <dt>Email Address</dt>
                <dd>{selectedOrder.consumer_email || "Not specified"}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Fulfillment Telemetry</h4>
              <dl className="admin-detail-list">
                <dt>Lifecycle Status</dt>
                <dd>
                  <span className={`admin-badge admin-badge-${String(selectedOrder.status).toLowerCase()}`}>
                    {selectedOrder.status}
                  </span>
                </dd>
                <dt>Payment Gateway</dt>
                <dd>
                  <span className={`admin-badge admin-badge-${String(selectedOrder.payment_status || "pending").toLowerCase()}`}>
                    {selectedOrder.payment_status || "Pending"}
                  </span>
                </dd>
                <dt>Dispatch & Delivery</dt>
                <dd>
                  <span className={`admin-badge admin-badge-${String(selectedOrder.delivery_status || "pending").toLowerCase()}`}>
                    {selectedOrder.delivery_status || "Pending"}
                  </span>
                </dd>
              </dl>
            </section>
          </>
        )}
      </AdminDetailDrawer>
    </div>
  );
}
