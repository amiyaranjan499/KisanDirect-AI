import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  getHubOperationsOverview,
  listHubStaffHubs,
  markHubShipmentReady,
  receiveHubStockDelivery,
  startHubOrderPacking,
} from "../services/api";
import "./hub-staff.css";

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const formatItems = (items = []) => {
  if (!items || !items.length) return "Produce";
  return items.map((item) => `${item.crop_name} (${item.quantity} ${item.unit})`).join(", ");
};

const formatDate = (dateString) => {
  if (!dateString) return "—";
  try {
    return new Date(dateString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
  } catch {
    return String(dateString);
  }
};

export default function HubStaffOperationsPage({ user, logout }) {
  const [hubs, setHubs] = useState([]);
  const [hubId, setHubId] = useState("");
  const [overview, setOverview] = useState(null);
  const [receivedQuantities, setReceivedQuantities] = useState({});
  const [checkedItems, setCheckedItems] = useState({});
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("new_orders");
  // Tabs: "new_orders" | "being_prepared" | "ready_handover" | "completed" | "stock_deliveries"

  // ── One-time login-success banner ────────────────────────────
  const location = useLocation();
  const [loginBanner, setLoginBanner] = useState(() => !!location.state?.loginSuccess);
  useEffect(() => {
    if (!loginBanner) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    const timer = setTimeout(() => setLoginBanner(false), 5000);
    return () => clearTimeout(timer);
  }, [loginBanner]);

  useEffect(() => {
    listHubStaffHubs()
      .then((data) => {
        const assigned = Array.isArray(data) ? data : [];
        setHubs(assigned);
        setHubId(assigned[0]?.id || "");
      })
      .catch((err) => setError(err.message || "Failed to load assigned hubs."))
      .finally(() => setLoadingHubs(false));
  }, []);

  const loadOverview = async (selectedHubId = hubId) => {
    if (!selectedHubId) {
      setOverview(null);
      return;
    }
    try {
      setLoadingOverview(true);
      setError("");
      const resOverview = await getHubOperationsOverview(selectedHubId);
      setOverview(resOverview);
    } catch (err) {
      setError(err.message || "Failed to load hub overview.");
      setOverview(null);
    } finally {
      setLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (hubId) loadOverview(hubId);
  }, [hubId]);

  const perform = async (id, action, successMessage) => {
    try {
      setBusyId(id);
      setError("");
      setSuccess("");
      await action();
      if (successMessage) setSuccess(successMessage);
      await loadOverview();
    } catch (err) {
      setError(err.message || "Action failed.");
    } finally {
      setBusyId("");
    }
  };

  const currentHub = useMemo(
    () => hubs.find((h) => h.id === hubId) || overview?.hub || null,
    [hubs, hubId, overview]
  );

  const staffName =
    user?.display_name ||
    user?.name ||
    (user?.email ? user.email.split("@")[0] : "Staff");

  const ordersToPack = overview?.orders_to_pack || [];
  const packingShipments = overview?.packing_shipments || [];
  const readyShipments = overview?.ready_shipments || [];
  const completedShipments = overview?.completed_shipments || [];
  const incomingDeliveries = overview?.incoming_deliveries || [];

  const toggleItemCheck = (shipmentId, itemIdx) => {
    const key = `${shipmentId}-${itemIdx}`;
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loadingHubs) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F6F8F6" }}>
        <div className="spinner-border text-success" role="status" />
        <p style={{ marginTop: "12px", color: "#64748B", fontWeight: 500 }}>Loading Hub Operations...</p>
      </div>
    );
  }

  return (
    <div className="hub-staff-page">
      {/* ── 1. Top Navbar (Compact, Clean & Responsive) ──────────────────── */}
      <header className="hub-staff-header">
        <div className="hub-header-inner">
          <div className="hub-brand-group">
            <div className="hub-brand-logo" title="KisanDirect">
              <img src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect" />
            </div>
            <div>
              <h1 className="hub-brand-title">KisanDirect</h1>
              <span className="hub-role-badge">
                <i className="bi bi-building-gear" /> Hub Staff
              </span>
            </div>
          </div>

          <div className="hub-header-controls">
            <button
              type="button"
              className="hub-btn-refresh"
              onClick={() => loadOverview()}
              disabled={loadingOverview}
              title="Refresh Live Orders"
            >
              <i className={`bi bi-arrow-clockwise ${loadingOverview ? "spin" : ""}`} />
              <span className="d-none d-sm-inline">Refresh</span>
            </button>

            {logout && (
              <button
                type="button"
                className="hub-btn-logout"
                onClick={logout}
                title="Logout"
              >
                <i className="bi bi-box-arrow-right" />
                <span className="d-none d-sm-inline">Logout</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── 2. Hub Facility Banner Card (Clean, Simple & Modern) ─────────── */}
      <div className="hub-facility-card">
        <div className="hub-facility-card-inner">
          <div className="hub-facility-main">
            <div className="hub-facility-icon">
              <i className="bi bi-building" />
            </div>
            <div>
              <h2 className="hub-facility-name">{currentHub?.name || "Kisan Hub Facility"}</h2>
              <div className="hub-facility-address">
                <i className="bi bi-geo-alt-fill text-warning me-1" />
                {currentHub?.address || "Assigned Fulfillment Facility"}
              </div>
            </div>
          </div>

          <div className="hub-facility-meta">
            {hubs.length > 1 && (
              <select
                className="hub-select-multi"
                value={hubId}
                onChange={(e) => setHubId(e.target.value)}
                aria-label="Switch Facility"
              >
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}
            <span className="hub-staff-pill">
              <i className="bi bi-person-fill" /> {staffName}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. Horizontal Operations Pill Tabs (Touch-Scrollable & NEVER Overlapping) */}
      <nav className="hub-tabs-container" aria-label="Operations Workflow Tabs">
        <div className="hub-tabs-scrollable">
          <button
            type="button"
            className={`hub-pill-tab ${activeTab === "new_orders" ? "active" : ""}`}
            onClick={() => setActiveTab("new_orders")}
          >
            <i className="bi bi-box-arrow-in-down" />
            <span className="hub-tab-text-full">1. New Orders</span>
            <span className="hub-tab-text-short">New</span>
            <span className="hub-tab-count">{ordersToPack.length}</span>
          </button>

          <button
            type="button"
            className={`hub-pill-tab ${activeTab === "being_prepared" ? "active" : ""}`}
            onClick={() => setActiveTab("being_prepared")}
          >
            <i className="bi bi-boxes" />
            <span className="hub-tab-text-full">2. Packing Workbench</span>
            <span className="hub-tab-text-short">Packing</span>
            <span className="hub-tab-count">{packingShipments.length}</span>
          </button>

          <button
            type="button"
            className={`hub-pill-tab ${activeTab === "ready_handover" ? "active" : ""}`}
            onClick={() => setActiveTab("ready_handover")}
          >
            <i className="bi bi-bicycle" />
            <span className="hub-tab-text-full">3. Ready for Rider</span>
            <span className="hub-tab-text-short">Ready</span>
            <span className="hub-tab-count">{readyShipments.length}</span>
          </button>

          <button
            type="button"
            className={`hub-pill-tab ${activeTab === "completed" ? "active" : ""}`}
            onClick={() => setActiveTab("completed")}
          >
            <i className="bi bi-check2-circle" />
            <span className="hub-tab-text-full">4. Completed</span>
            <span className="hub-tab-text-short">Done</span>
            <span className="hub-tab-count">{completedShipments.length}</span>
          </button>

          {incomingDeliveries.length > 0 && (
            <button
              type="button"
              className={`hub-pill-tab ${activeTab === "stock_deliveries" ? "active" : ""}`}
              onClick={() => setActiveTab("stock_deliveries")}
            >
              <i className="bi bi-truck" />
              <span className="hub-tab-text-full">5. Stock Inbound</span>
              <span className="hub-tab-text-short">Inbound</span>
              <span className="hub-tab-count">{incomingDeliveries.length}</span>
            </button>
          )}
        </div>
      </nav>

      {/* ── 4. Main Operations Content ──────────────────────────────────── */}
      <main className="hub-content-wrap">
        {/* Alerts & One-time Login Notification */}
        {loginBanner && (
          <div
            id="hub-staff-login-success-banner"
            className="alert alert-success d-flex align-items-center justify-content-between mb-3 py-2 px-3"
            role="status"
          >
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-check-circle-fill fs-5" />
              <div>
                <strong>Hub Staff login successful!</strong> Welcome back, {staffName}.
              </div>
            </div>
            <button
              type="button"
              className="btn-close"
              onClick={() => setLoginBanner(false)}
              aria-label="Close"
            />
          </div>
        )}

        {error && (
          <div className="alert alert-danger d-flex align-items-center justify-content-between mb-3 py-2 px-3" role="alert">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-exclamation-triangle-fill" />
              <span>{error}</span>
            </div>
            <button type="button" className="btn-close" onClick={() => setError("")} aria-label="Close" />
          </div>
        )}

        {success && (
          <div className="alert alert-success d-flex align-items-center justify-content-between mb-3 py-2 px-3" role="status">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-check-circle-fill" />
              <span>{success}</span>
            </div>
            <button type="button" className="btn-close" onClick={() => setSuccess("")} aria-label="Close" />
          </div>
        )}

        {loadingOverview ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <div className="spinner-border text-success" role="status" />
            <p style={{ marginTop: "12px", color: "#64748B" }}>Loading orders...</p>
          </div>
        ) : (
          <>
            {/* ── TAB 1: INBOUND ORDERS FROM FARMERS ─────────────────────── */}
            {activeTab === "new_orders" && (
              <section aria-label="Inbound Farmer Orders">
                <div className="hub-orders-grid">
                  {ordersToPack.map((order) => {
                    const orderNum = String(order.id).slice(0, 8).toUpperCase();
                    const isBusy = busyId === order.id;

                    return (
                      <article key={order.id} className="hub-order-card">
                        <div className="hub-card-header">
                          <div>
                            <h3 className="hub-order-title">Order #{orderNum}</h3>
                            <div className="hub-customer-name">{order.consumer_name}</div>
                            {order.farmer_name && (
                              <div className="hub-supplier-tag">
                                Supplied by: <strong>{order.farmer_name}</strong>
                              </div>
                            )}
                          </div>
                          <span className="hub-time-badge">{formatDate(order.created_at)}</span>
                        </div>

                        {order.consumer_address && (
                          <div className="hub-address-box">
                            <i className="bi bi-geo-alt-fill text-danger mt-1" />
                            <div>
                              <strong>Dropoff:</strong> {order.consumer_address}
                              {order.consumer_city ? `, ${order.consumer_city}` : ""}
                            </div>
                          </div>
                        )}

                        <div className="hub-items-box">
                          <div className="hub-items-heading">Items to Pack:</div>
                          {order.items?.map((it, idx) => (
                            <div key={idx} className="hub-produce-row">
                              <span>{it.crop_name}</span>
                              <span className="hub-produce-qty">{it.quantity} {it.unit}</span>
                            </div>
                          ))}
                        </div>

                        <div className="hub-card-footer">
                          <div className="hub-total-price">{formatMoney(order.total_amount)}</div>
                          <button
                            type="button"
                            className="hub-primary-btn"
                            disabled={isBusy}
                            onClick={() =>
                              perform(
                                order.id,
                                () => startHubOrderPacking(hubId, order.id),
                                `Order #${orderNum} moved to Packing Workbench.`
                              )
                            }
                          >
                            <i className="bi bi-box-seam" />
                            <span>{isBusy ? "Starting..." : "Accept & Start Packing"}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}

                  {ordersToPack.length === 0 && (
                    <div className="hub-empty-card">
                      <div className="hub-empty-icon-wrap">
                        <i className="bi bi-inbox" />
                      </div>
                      <h3 className="hub-empty-heading">No Inbound Orders</h3>
                      <p className="hub-empty-desc">
                        When farmers dispatch orders to this Kisan Hub, they will appear here instantly.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── TAB 2: PACKING WORKBENCH ──────────────────────────────── */}
            {activeTab === "being_prepared" && (
              <section aria-label="Packing Workbench">
                <div className="hub-orders-grid">
                  {packingShipments.map((shipment) => {
                    const orderNum = String(shipment.order_id).slice(0, 8).toUpperCase();
                    const isBusy = busyId === shipment.id;

                    return (
                      <article key={shipment.id} className="hub-order-card">
                        <div className="hub-card-header">
                          <div>
                            <span className="badge bg-primary-subtle text-primary fw-bold mb-1">
                              ON WORKBENCH
                            </span>
                            <h3 className="hub-order-title">Order #{orderNum}</h3>
                            <div className="hub-customer-name">{shipment.consumer_name}</div>
                          </div>
                          <div className="hub-total-price">{formatMoney(shipment.total_amount)}</div>
                        </div>

                        {shipment.dropoff_address && (
                          <div className="hub-address-box">
                            <i className="bi bi-geo-alt-fill text-danger mt-1" />
                            <div>
                              <strong>Dropoff:</strong> {shipment.dropoff_address}
                            </div>
                          </div>
                        )}

                        <div className="hub-checklist-group">
                          <small style={{ color: "#64748B", fontWeight: 700, textTransform: "uppercase", fontSize: "0.72rem" }}>
                            Packaging Checklist (Tick items as packed):
                          </small>
                          {shipment.items?.map((item, idx) => {
                            const isChecked = !!checkedItems[`${shipment.id}-${idx}`];
                            return (
                              <label
                                key={idx}
                                className={`hub-check-row ${isChecked ? "checked" : ""}`}
                                onClick={() => toggleItemCheck(shipment.id, idx)}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  readOnly
                                  aria-label={item.crop_name}
                                />
                                <span className={`hub-check-content ${isChecked ? "struck" : ""}`}>
                                  <b>{item.crop_name}</b>
                                  <span>{item.quantity} {item.unit}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>

                        <div className="hub-card-footer">
                          <span style={{ fontSize: "0.82rem", color: "#64748B" }}>
                            Tick produce and tap button to alert riders.
                          </span>
                          <button
                            type="button"
                            className="hub-primary-btn"
                            disabled={isBusy}
                            onClick={() =>
                              perform(
                                shipment.id,
                                () => markHubShipmentReady(hubId, shipment.id),
                                `Order #${orderNum} marked packed! Finding nearest rider according to customer location.`
                              )
                            }
                          >
                            <i className="bi bi-check2-circle" />
                            <span>{isBusy ? "Dispatching..." : "Mark Packed & Call Rider"}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}

                  {packingShipments.length === 0 && (
                    <div className="hub-empty-card">
                      <div className="hub-empty-icon-wrap">
                        <i className="bi bi-boxes" />
                      </div>
                      <h3 className="hub-empty-heading">Workbench is Empty</h3>
                      <p className="hub-empty-desc">
                        Accept inbound orders from Tab 1 to assemble packages here.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── TAB 3: READY FOR RIDER HANDOVER ───────────────────────── */}
            {activeTab === "ready_handover" && (
              <section aria-label="Rider Dispatch and Handover">
                <div className="hub-orders-grid">
                  {readyShipments.map((shipment) => {
                    const orderNum = String(shipment.order_id).slice(0, 8).toUpperCase();
                    const shipNum = String(shipment.id).slice(0, 8).toUpperCase();

                    return (
                      <article key={shipment.id} className="hub-order-card">
                        <div className="hub-card-header">
                          <div>
                            <span className="badge bg-warning text-dark fw-bold mb-1">
                              READY FOR RIDER
                            </span>
                            <h3 className="hub-order-title">Shipment #{shipNum}</h3>
                            <div className="hub-customer-name">
                              Order #{orderNum} · {shipment.consumer_name}
                            </div>
                          </div>
                          <div className="hub-total-price">{formatMoney(shipment.total_amount)}</div>
                        </div>

                        <div className="hub-address-box">
                          <i className="bi bi-geo-alt-fill text-danger mt-1" />
                          <div>
                            <strong>Destination:</strong> {shipment.dropoff_address || "Customer Address"}
                          </div>
                        </div>

                        <div className="hub-items-box">
                          <div className="hub-items-heading">Packed Produce:</div>
                          {shipment.items?.map((it, idx) => (
                            <div key={idx} className="hub-produce-row">
                              <span>{it.crop_name}</span>
                              <span className="hub-produce-qty">{it.quantity} {it.unit}</span>
                            </div>
                          ))}
                        </div>

                        <div className="hub-card-footer">
                          {shipment.rider_name ? (
                            <div className="hub-status-pill hub-status-assigned">
                              <i className="bi bi-bicycle fs-6" />
                              <span>
                                Assigned Rider: <b>{shipment.rider_name}</b> ({shipment.rider_vehicle || "Bike"})
                              </span>
                            </div>
                          ) : (
                            <div className="hub-status-pill hub-status-searching">
                              <span className="spinner-grow spinner-grow-sm" role="status" aria-hidden="true" />
                              <span>Scanning for nearest available riders...</span>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}

                  {readyShipments.length === 0 && (
                    <div className="hub-empty-card">
                      <div className="hub-empty-icon-wrap">
                        <i className="bi bi-bicycle" />
                      </div>
                      <h3 className="hub-empty-heading">No Orders Awaiting Pickup</h3>
                      <p className="hub-empty-desc">
                        Packed orders waiting for delivery riders will appear here.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── TAB 4: COMPLETED ARCHIVE ──────────────────────────────── */}
            {activeTab === "completed" && (
              <section aria-label="Completed Shipments">
                <div className="hub-orders-grid">
                  {completedShipments.map((shipment) => {
                    const orderNum = String(shipment.order_id).slice(0, 8).toUpperCase();

                    return (
                      <article key={shipment.id} className="hub-order-card">
                        <div className="hub-card-header">
                          <div>
                            <span className="badge bg-success-subtle text-success fw-bold mb-1">
                              DELIVERED
                            </span>
                            <h3 className="hub-order-title">Order #{orderNum}</h3>
                            <div className="hub-customer-name">{shipment.consumer_name}</div>
                          </div>
                          <div className="hub-total-price">{formatMoney(shipment.total_amount)}</div>
                        </div>

                        <div style={{ fontSize: "0.85rem", color: "#475569", margin: "6px 0" }}>
                          <strong>Produce:</strong> {formatItems(shipment.items)}
                        </div>

                        {shipment.rider_name && (
                          <div style={{ fontSize: "0.82rem", color: "#64748B" }}>
                            Delivered by: <strong>{shipment.rider_name}</strong>
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {completedShipments.length === 0 && (
                    <div className="hub-empty-card">
                      <div className="hub-empty-icon-wrap">
                        <i className="bi bi-check2-circle" />
                      </div>
                      <h3 className="hub-empty-heading">No Completed Orders Yet</h3>
                      <p className="hub-empty-desc">
                        Successfully delivered hub shipments will appear here in the archive.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── TAB 5: STOCK INBOUND FROM FARMERS ───────────────────────── */}
            {activeTab === "stock_deliveries" && (
              <section aria-label="Farmer Harvest Stock Deliveries">
                <div className="hub-orders-grid">
                  {incomingDeliveries.map((delivery) => {
                    const isBusy = busyId === delivery.id;
                    const acceptedQty = receivedQuantities[delivery.id] ?? delivery.quantity;

                    return (
                      <article key={delivery.id} className="hub-order-card">
                        <div className="hub-card-header">
                          <div>
                            <span className="badge bg-info-subtle text-info fw-bold mb-1">
                              STOCK INBOUND
                            </span>
                            <h3 className="hub-order-title">{delivery.crop_name}</h3>
                            <div className="hub-customer-name">Farmer: {delivery.farmer_name}</div>
                          </div>
                          <span className="hub-time-badge">{formatDate(delivery.created_at)}</span>
                        </div>

                        <div style={{ fontSize: "0.88rem", margin: "8px 0" }}>
                          Reported quantity: <strong>{delivery.quantity} kg</strong>
                        </div>

                        <div className="hub-card-footer">
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <label htmlFor={`qty-${delivery.id}`} style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                              Verified Qty (kg):
                            </label>
                            <input
                              id={`qty-${delivery.id}`}
                              type="number"
                              min="0"
                              step="0.1"
                              className="form-control form-control-sm"
                              style={{ width: "90px" }}
                              value={acceptedQty}
                              onChange={(e) =>
                                setReceivedQuantities((prev) => ({
                                  ...prev,
                                  [delivery.id]: e.target.value,
                                }))
                              }
                            />
                          </div>

                          <button
                            type="button"
                            className="hub-primary-btn"
                            disabled={isBusy}
                            onClick={() =>
                              perform(
                                delivery.id,
                                () =>
                                  receiveHubStockDelivery(hubId, delivery.id, {
                                    received_quantity: Number(acceptedQty),
                                  }),
                                `Received ${acceptedQty} kg of ${delivery.crop_name} into hub inventory.`
                              )
                            }
                          >
                            <i className="bi bi-box-arrow-in-down" />
                            <span>{isBusy ? "Receiving..." : "Verify & Receive"}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}

                  {incomingDeliveries.length === 0 && (
                    <div className="hub-empty-card">
                      <div className="hub-empty-icon-wrap">
                        <i className="bi bi-truck" />
                      </div>
                      <h3 className="hub-empty-heading">No Pending Stock Deliveries</h3>
                      <p className="hub-empty-desc">
                        Harvest deliveries sent by farmers will appear here for verification.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
