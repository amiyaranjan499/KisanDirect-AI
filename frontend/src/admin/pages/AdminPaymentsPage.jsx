import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import AdminFilterTabs from "../components/AdminFilterTabs";
import AdminDetailDrawer from "../components/AdminDetailDrawer";
import { listAdminPayments } from "../../services/adminApi";

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

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedPayment, setSelectedPayment] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listAdminPayments();
      setPayments(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || "Failed to load payment transactions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      const matchesSearch =
        !q ||
        `${p.id || ""} ${p.order_id || ""} ${p.consumer_name || ""} ${p.provider_reference || ""} ${p.payment_method || ""}`
          .toLowerCase()
          .includes(q);
      const matchesStatus =
        statusFilter === "ALL" || (p.status || "").toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [payments, search, statusFilter]);

  const handleView = (payment, e) => {
    if (e) e.stopPropagation();
    setSelectedPayment(payment);
    setDrawerOpen(true);
  };

  const columns = [
    {
      key: "order_id",
      label: "Order Reference",
      sortable: true,
      width: "140px",
      render: (p) => (
        <strong className="font-monospace text-forest">
          {`ORD-${String(p.order_id).slice(0, 8).toUpperCase()}`}
        </strong>
      ),
    },
    {
      key: "consumer_name",
      label: "Payer / Customer",
      sortable: true,
      render: (p) => p.consumer_name || "Direct Consumer",
    },
    {
      key: "payment_method",
      label: "Payment Method",
      sortable: true,
      render: (p) => (
        <span className="badge bg-light text-dark border">
          <i className="bi bi-wallet2 me-1" />
          {p.payment_method || "Online"}
        </span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      render: (p) => <strong>{money(p.amount || 0)}</strong>,
    },
    {
      key: "provider_reference",
      label: "Gateway Reference",
      render: (p) => (
        <span className="font-monospace text-muted small" title={p.provider_reference}>
          {p.provider_reference
            ? p.provider_reference.startsWith("test_")
              ? "TEST_SANDBOX"
              : p.provider_reference
            : "—"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Settlement Status",
      sortable: true,
      render: (p) => (
        <span className={`admin-badge admin-badge-${String(p.status).toLowerCase()}`}>
          {p.status}
        </span>
      ),
    },
    {
      key: "created_at",
      label: "Timestamp",
      sortable: true,
      render: (p) => formatDate(p.created_at),
    },
    {
      key: "actions",
      label: "Actions",
      width: "100px",
      align: "right",
      render: (p) => (
        <button
          type="button"
          className="admin-table-action-btn"
          onClick={(e) => handleView(p, e)}
        >
          <i className="bi bi-eye" /> View
        </button>
      ),
    },
  ];

  const statusTabs = [
    { key: "ALL", label: "All Payments", count: payments.length },
    {
      key: "SUCCESSFUL",
      label: "Successful",
      count: payments.filter((p) => (p.status || "").toUpperCase() === "SUCCESSFUL").length,
    },
    {
      key: "PENDING",
      label: "Pending",
      count: payments.filter((p) => (p.status || "").toUpperCase() === "PENDING").length,
    },
    {
      key: "REFUNDED",
      label: "Refunded",
      count: payments.filter((p) => (p.status || "").toUpperCase() === "REFUNDED").length,
    },
    {
      key: "FAILED",
      label: "Failed",
      count: payments.filter((p) => (p.status || "").toUpperCase() === "FAILED").length,
    },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Financial Ledger</span>
          <h1>Payment Transactions</h1>
          <p>Inspect incoming consumer payments, gateway references, settlement health, and refunds.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-btn-secondary" onClick={loadPayments} disabled={loading}>
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <AdminFilterTabs tabs={statusTabs} activeTab={statusFilter} onChange={setStatusFilter} />

      <AdminDataTable
        columns={columns}
        data={filteredPayments}
        loading={loading}
        error={error}
        onRetry={loadPayments}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search payments by order reference, customer, or gateway ID..."
        pageSize={12}
        emptyTitle="No payments found"
        emptyDescription="There are no payment transaction records matching your current filter criteria."
        onRowClick={handleView}
      />

      {/* Payment Detail Drawer */}
      <AdminDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Payment Record"
        subtitle={`Transaction ID: ${selectedPayment?.id || ""}`}
        badge={
          selectedPayment && (
            <span
              className={`admin-badge admin-badge-${String(
                selectedPayment.status
              ).toLowerCase()}`}
            >
              {selectedPayment.status}
            </span>
          )
        }
      >
        {selectedPayment && (
          <>
            <section className="admin-detail-section">
              <h4>Transaction Details</h4>
              <dl className="admin-detail-list">
                <dt>Payment UUID</dt>
                <dd className="font-monospace">{selectedPayment.id}</dd>
                <dt>Order Reference</dt>
                <dd className="font-monospace">{selectedPayment.order_id}</dd>
                <dt>Amount Paid</dt>
                <dd><strong>{money(selectedPayment.amount || 0)}</strong></dd>
                <dt>Payment Method</dt>
                <dd>{selectedPayment.payment_method || "Direct Gateway"}</dd>
                <dt>Gateway Ref</dt>
                <dd className="font-monospace">
                  {selectedPayment.provider_reference?.startsWith("test_")
                    ? "TEST_SANDBOX"
                    : selectedPayment.provider_reference || "None Recorded"}
                </dd>
                <dt>Date & Time</dt>
                <dd>{formatDate(selectedPayment.created_at)}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Payer Information</h4>
              <dl className="admin-detail-list">
                <dt>Customer Name</dt>
                <dd>{selectedPayment.consumer_name || "Direct Customer"}</dd>
                <dt>Settlement Status</dt>
                <dd>
                  <span className={`admin-badge admin-badge-${String(selectedPayment.status).toLowerCase()}`}>
                    {selectedPayment.status}
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
