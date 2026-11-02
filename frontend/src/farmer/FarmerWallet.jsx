import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getFarmerProfile, getFarmerWallet, requestFarmerWithdrawal } from "../services/api";
import "./farmer-operations.css";

const emptyWithdrawForm = {
  amount: "",
  payout_method: "BANK_TRANSFER", // "BANK_TRANSFER" | "UPI"
  account_holder_name: "",
  account_number: "",
  confirm_account_number: "",
  ifsc_code: "",
  bank_name: "",
  upi_id: "",
  note: "",
};

export default function FarmerWallet() {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState(emptyWithdrawForm);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [walletData, profileData] = await Promise.all([
        getFarmerWallet().catch(() => null),
        getFarmerProfile().catch(() => null),
      ]);
      if (walletData) {
        setWallet(walletData);
      }
      if (profileData && profileData.name) {
        setWithdrawForm((prev) => ({
          ...prev,
          account_holder_name: prev.account_holder_name || profileData.name || "",
        }));
      }
    } catch (err) {
      setError(err.message || "Failed to load wallet data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = () => {
    setModalError("");
    setWithdrawForm((prev) => ({
      ...prev,
      amount: "",
      confirm_account_number: "",
      note: "",
    }));
    setShowModal(true);
  };

  const handleQuickAmount = (val) => {
    if (!wallet) return;
    const maxBal = Number(wallet.available_balance || 0);
    const target = val === "ALL" ? maxBal : Math.min(Number(val), maxBal);
    setWithdrawForm((prev) => ({
      ...prev,
      amount: target > 0 ? String(target) : "",
    }));
  };

  const handleSubmitWithdrawal = async (e) => {
    e.preventDefault();
    setModalError("");

    const amountNum = parseFloat(withdrawForm.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setModalError("Please enter a valid withdrawal amount greater than zero.");
      return;
    }

    const available = Number(wallet?.available_balance || 0);
    if (amountNum > available) {
      setModalError(`Withdrawal amount exceeds your available balance of ₹${available.toLocaleString("en-IN")}.`);
      return;
    }

    if (!withdrawForm.account_holder_name.trim()) {
      setModalError("Account holder name is required.");
      return;
    }

    if (withdrawForm.payout_method === "BANK_TRANSFER") {
      if (!withdrawForm.account_number.trim()) {
        setModalError("Bank account number is required.");
        return;
      }
      if (withdrawForm.account_number !== withdrawForm.confirm_account_number) {
        setModalError("Account number confirmation does not match.");
        return;
      }
      if (!withdrawForm.ifsc_code.trim() || withdrawForm.ifsc_code.trim().length < 5) {
        setModalError("Please enter a valid IFSC code.");
        return;
      }
    } else if (withdrawForm.payout_method === "UPI") {
      if (!withdrawForm.upi_id.trim() || !withdrawForm.upi_id.includes("@")) {
        setModalError("Please enter a valid UPI ID (e.g. 9876543210@upi or name@bank).");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        amount: amountNum,
        payout_method: withdrawForm.payout_method,
        account_holder_name: withdrawForm.account_holder_name.trim(),
        note: withdrawForm.note.trim() || undefined,
      };

      if (withdrawForm.payout_method === "BANK_TRANSFER") {
        payload.account_number = withdrawForm.account_number.trim();
        payload.ifsc_code = withdrawForm.ifsc_code.trim().toUpperCase();
        payload.bank_name = withdrawForm.bank_name.trim() || undefined;
      } else {
        payload.upi_id = withdrawForm.upi_id.trim();
      }

      const res = await requestFarmerWithdrawal(payload);
      setShowModal(false);
      setSuccess(`Withdrawal of ₹${Number(res.amount).toLocaleString("en-IN")} processed successfully! (Ref: ${res.reference_id})`);
      await loadData();
    } catch (err) {
      setModalError(err.message || "Failed to process withdrawal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "16px 8px 60px" }}>
      {/* Standard Farmer Page Header */}
      <div className="farmer-page-header">
        <div>
          <div className="eyebrow"><i className="bi bi-wallet2 me-1" /> PAYMENTS & DISBURSEMENTS</div>
          <h1 className="farmer-page-title">My Wallet & Payouts</h1>
          <p className="farmer-page-sub">Track your produce sales revenue, check available balances, and withdraw earnings directly to your bank account or UPI.</p>
        </div>
        <div className="farmer-header-actions">
          <button
            type="button"
            className="kisan-btn-accent"
            onClick={handleOpenModal}
            disabled={!wallet || Number(wallet.available_balance || 0) <= 0}
          >
            <i className="bi bi-cash-stack me-1" /> Withdraw Money
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="kisan-card kisan-card-pad mb-3" style={{ borderColor: "#F28B82", background: "#FDF2F0" }}>
          <div className="d-flex align-items-center justify-content-between">
            <span style={{ color: "#C53929", fontWeight: 600, fontSize: "13.5px" }}>
              <i className="bi bi-exclamation-triangle-fill me-2" />
              {error}
            </span>
            <button type="button" className="btn-close" onClick={() => setError("")} aria-label="Close" />
          </div>
        </div>
      )}
      {success && (
        <div className="kisan-card kisan-card-pad mb-3" style={{ borderColor: "#CDEBD7", background: "#F5FBF7" }}>
          <div className="d-flex align-items-center justify-content-between">
            <span style={{ color: "#1B6B34", fontWeight: 600, fontSize: "13.5px" }}>
              <i className="bi bi-check-circle-fill me-2" />
              {success}
            </span>
            <button type="button" className="btn-close" onClick={() => setSuccess("")} aria-label="Close" />
          </div>
        </div>
      )}

      {loading ? (
        <div className="kisan-card kisan-card-pad text-center py-5">
          <div className="spinner-border text-success" role="status" style={{ width: "2rem", height: "2rem" }} />
          <p style={{ marginTop: "12px", color: "#79705F", fontSize: "14px" }}>Loading your wallet balance and transactions...</p>
        </div>
      ) : (
        <>
          {/* Rectangular Balance & Stats Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            {/* Box 1: Available Balance */}
            <div className="kisan-card kisan-card-pad" style={{ background: "linear-gradient(135deg, #FAFDFB 0%, #EDF8DF 100%)", border: "1px solid #CDEBD7" }}>
              <div className="d-flex justify-content-between align-items-start mb-2">
                <span style={{ fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#1B6B34", fontWeight: 700 }}>
                  Available Balance
                </span>
                <span
                  style={{
                    background: "#1B6B34",
                    color: "#FFFFFF",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  Ready to Payout
                </span>
              </div>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "32px", fontWeight: 700, color: "#1B6B34", margin: "6px 0 12px" }}>
                ₹{Number(wallet?.available_balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="d-flex justify-content-between align-items-center">
                <span style={{ fontSize: "12.5px", color: "#79705F" }}>
                  Instant withdrawal to Bank or UPI
                </span>
                <button
                  type="button"
                  className="kisan-btn-accent kisan-btn-sm"
                  onClick={handleOpenModal}
                  disabled={Number(wallet?.available_balance || 0) <= 0}
                >
                  Withdraw Now
                </button>
              </div>
            </div>

            {/* Box 2: Total Sales Earnings */}
            <div className="kisan-card kisan-card-pad">
              <span style={{ fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#79705F", fontWeight: 700, display: "block" }}>
                Total Produce Earnings
              </span>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "28px", fontWeight: 700, color: "#1C1C16", margin: "6px 0 10px" }}>
                ₹{Number(wallet?.total_earned || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p style={{ margin: 0, fontSize: "12.5px", color: "#79705F" }}>
                Gross revenue realized from fulfilled and confirmed orders.
              </p>
            </div>

            {/* Box 3: Total Disbursed */}
            <div className="kisan-card kisan-card-pad">
              <span style={{ fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#79705F", fontWeight: 700, display: "block" }}>
                Total Withdrawn
              </span>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "28px", fontWeight: 700, color: "#0E5A3C", margin: "6px 0 10px" }}>
                ₹{Number(wallet?.withdrawn_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p style={{ margin: 0, fontSize: "12.5px", color: "#79705F" }}>
                {wallet?.withdrawals?.length || 0} payout transaction(s) completed to your accounts.
              </p>
            </div>
          </div>

          {/* Withdrawal History Section */}
          <div className="kisan-card kisan-card-pad">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
              <div>
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "18px", fontWeight: 700, margin: 0, color: "#1B6B34" }}>
                  Withdrawal & Payout History
                </h2>
                <p style={{ margin: "2px 0 0", color: "#79705F", fontSize: "13px" }}>
                  Real-time disbursement records to your personal bank accounts and UPI IDs.
                </p>
              </div>
              <button
                type="button"
                className="kisan-btn-outline kisan-btn-sm"
                onClick={loadData}
              >
                <i className="bi bi-arrow-clockwise me-1" /> Refresh
              </button>
            </div>

            {!wallet?.withdrawals || wallet.withdrawals.length === 0 ? (
              <div className="text-center py-5" style={{ background: "#FAF8F3", borderRadius: "10px", border: "1px dashed #E4DFD1" }}>
                <div
                  style={{
                    width: "50px",
                    height: "50px",
                    borderRadius: "50%",
                    background: "#EDF8DF",
                    color: "#1B6B34",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "22px",
                    margin: "0 auto 12px",
                  }}
                >
                  <i className="bi bi-wallet2" />
                </div>
                <h3 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 4px", color: "#1C1C16" }}>
                  No Withdrawals Yet
                </h3>
                <p style={{ color: "#79705F", fontSize: "13px", maxWidth: "420px", margin: "0 auto 14px" }}>
                  When you request a payout of your sales revenue, details including transaction IDs and bank references will appear here.
                </p>
                {Number(wallet?.available_balance || 0) > 0 && (
                  <button
                    type="button"
                    className="kisan-btn-accent kisan-btn-sm"
                    onClick={handleOpenModal}
                  >
                    Request First Withdrawal
                  </button>
                )}
              </div>
            ) : (
              <div className="kisan-table-wrap">
                <table className="kisan-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Reference ID</th>
                      <th>Payout Method</th>
                      <th>Destination Account</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.withdrawals.map((w) => {
                      const isBank = w.payout_method === "BANK_TRANSFER";
                      const maskedAcct = w.account_number
                        ? `•••• ${w.account_number.slice(-4)}`
                        : w.upi_id || "Personal Account";
                      const formattedDate = new Date(w.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                        <tr key={w.id}>
                          <td style={{ color: "#79705F", fontSize: "12.5px" }}>{formattedDate}</td>
                          <td>
                            <strong style={{ color: "#1C1C16", fontFamily: "monospace", fontSize: "12.5px" }}>
                              {w.reference_id}
                            </strong>
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: isBank ? "#EDF8DF" : "#E8F5E9",
                                color: "#1B6B34",
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "6px",
                              }}
                            >
                              <i className={isBank ? "bi bi-bank" : "bi bi-phone"} />
                              {isBank ? "Bank Transfer" : "UPI Payout"}
                            </span>
                          </td>
                          <td>
                            <div>
                              <strong style={{ fontSize: "13px", color: "#1C1C16" }}>{w.account_holder_name}</strong>
                              <div style={{ fontSize: "12px", color: "#79705F" }}>
                                {isBank ? `${w.bank_name || "Bank Account"} (${maskedAcct})` : maskedAcct}
                                {w.ifsc_code && ` · IFSC: ${w.ifsc_code}`}
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong style={{ fontSize: "14px", color: "#1B6B34" }}>
                              ₹{Number(w.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </strong>
                          </td>
                          <td>
                            <span
                              style={{
                                background: "#EDF8DF",
                                color: "#1B6B34",
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "6px",
                              }}
                            >
                              <i className="bi bi-check-circle-fill me-1" />
                              {w.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* WITHDRAWAL MODAL */}
      {showModal && (
        <div className="farmer-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div className="farmer-modal-header" style={{ padding: "16px 20px" }}>
              <div>
                <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1B6B34", margin: 0, fontSize: "18px" }}>
                  Withdraw to Personal Account
                </h3>
                <span style={{ fontSize: "12.5px", color: "#79705F" }}>
                  Available Balance: <strong style={{ color: "#1B6B34" }}>₹{Number(wallet?.available_balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                </span>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowModal(false)}
                aria-label="Close"
              />
            </div>

            <form onSubmit={handleSubmitWithdrawal}>
              <div className="farmer-modal-body" style={{ padding: "18px 20px" }}>
                {modalError && (
                  <div className="alert alert-danger py-2 px-3 mb-3" style={{ fontSize: "13px" }}>
                    <i className="bi bi-exclamation-triangle-fill me-1" /> {modalError}
                  </div>
                )}

                {/* Payout Method Toggle */}
                <div className="mb-3">
                  <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#1C1C16", display: "block", marginBottom: "6px" }}>
                    Select Payout Method
                  </label>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className={`kisan-btn-outline ${withdrawForm.payout_method === "BANK_TRANSFER" ? "active" : ""}`}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        fontSize: "13px",
                        borderRadius: "8px",
                        background: withdrawForm.payout_method === "BANK_TRANSFER" ? "#EDF8DF" : "#FFFFFF",
                        borderColor: withdrawForm.payout_method === "BANK_TRANSFER" ? "#1B6B34" : "#E4DFD1",
                        color: withdrawForm.payout_method === "BANK_TRANSFER" ? "#1B6B34" : "#1C1C16",
                        fontWeight: 600,
                      }}
                      onClick={() => setWithdrawForm((c) => ({ ...c, payout_method: "BANK_TRANSFER" }))}
                    >
                      <i className="bi bi-bank me-2" /> Bank Account
                    </button>
                    <button
                      type="button"
                      className={`kisan-btn-outline ${withdrawForm.payout_method === "UPI" ? "active" : ""}`}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        fontSize: "13px",
                        borderRadius: "8px",
                        background: withdrawForm.payout_method === "UPI" ? "#EDF8DF" : "#FFFFFF",
                        borderColor: withdrawForm.payout_method === "UPI" ? "#1B6B34" : "#E4DFD1",
                        color: withdrawForm.payout_method === "UPI" ? "#1B6B34" : "#1C1C16",
                        fontWeight: 600,
                      }}
                      onClick={() => setWithdrawForm((c) => ({ ...c, payout_method: "UPI" }))}
                    >
                      <i className="bi bi-phone me-2" /> Instant UPI
                    </button>
                  </div>
                </div>

                {/* Amount with quick selection */}
                <div className="farmer-form-group mb-3">
                  <label htmlFor="withdraw-amt" style={{ fontSize: "12.5px", fontWeight: 700, color: "#1C1C16" }}>
                    Withdrawal Amount (₹) *
                  </label>
                  <div className="input-group">
                    <span className="input-group-text" style={{ background: "#FAF8F3", borderColor: "#E4DFD1", fontWeight: 700, color: "#1B6B34" }}>₹</span>
                    <input
                      id="withdraw-amt"
                      type="number"
                      step="1"
                      min="1"
                      max={wallet?.available_balance || undefined}
                      className="form-control farmer-form-control"
                      placeholder="Enter amount"
                      value={withdrawForm.amount}
                      onChange={(e) => setWithdrawForm((c) => ({ ...c, amount: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="d-flex gap-2 mt-2 flex-wrap">
                    {["500", "1000", "2500"].map((quickVal) => (
                      <button
                        key={quickVal}
                        type="button"
                        className="btn btn-sm btn-light border"
                        style={{ fontSize: "11.5px", padding: "2px 8px" }}
                        onClick={() => handleQuickAmount(quickVal)}
                      >
                        ₹{quickVal}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success"
                      style={{ fontSize: "11.5px", padding: "2px 8px", fontWeight: 600 }}
                      onClick={() => handleQuickAmount("ALL")}
                    >
                      Withdraw All (₹{Number(wallet?.available_balance || 0).toLocaleString("en-IN")})
                    </button>
                  </div>
                </div>

                {/* Account Holder Name */}
                <div className="farmer-form-group mb-3">
                  <label htmlFor="holder-name" style={{ fontSize: "12.5px", fontWeight: 700, color: "#1C1C16" }}>
                    Account Holder Name *
                  </label>
                  <input
                    id="holder-name"
                    type="text"
                    className="farmer-form-control"
                    placeholder="Full name registered on bank account"
                    value={withdrawForm.account_holder_name}
                    onChange={(e) => setWithdrawForm((c) => ({ ...c, account_holder_name: e.target.value }))}
                    required
                  />
                </div>

                {/* Conditional Fields based on method */}
                {withdrawForm.payout_method === "BANK_TRANSFER" ? (
                  <>
                    <div className="row g-2 mb-2">
                      <div className="col-sm-6 farmer-form-group">
                        <label htmlFor="bank-acct" style={{ fontSize: "12.5px", fontWeight: 700, color: "#1C1C16" }}>
                          Bank Account Number *
                        </label>
                        <input
                          id="bank-acct"
                          type="password"
                          className="farmer-form-control"
                          placeholder="Account number"
                          value={withdrawForm.account_number}
                          onChange={(e) => setWithdrawForm((c) => ({ ...c, account_number: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="col-sm-6 farmer-form-group">
                        <label htmlFor="confirm-bank-acct" style={{ fontSize: "12.5px", fontWeight: 700, color: "#1C1C16" }}>
                          Confirm Account Number *
                        </label>
                        <input
                          id="confirm-bank-acct"
                          type="text"
                          className="farmer-form-control"
                          placeholder="Re-enter account number"
                          value={withdrawForm.confirm_account_number}
                          onChange={(e) => setWithdrawForm((c) => ({ ...c, confirm_account_number: e.target.value }))}
                          required
                        />
                      </div>
                    </div>

                    <div className="row g-2 mb-2">
                      <div className="col-sm-6 farmer-form-group">
                        <label htmlFor="bank-ifsc" style={{ fontSize: "12.5px", fontWeight: 700, color: "#1C1C16" }}>
                          IFSC Code *
                        </label>
                        <input
                          id="bank-ifsc"
                          type="text"
                          maxLength="11"
                          className="farmer-form-control text-uppercase"
                          placeholder="e.g. SBIN0001234"
                          value={withdrawForm.ifsc_code}
                          onChange={(e) => setWithdrawForm((c) => ({ ...c, ifsc_code: e.target.value.toUpperCase() }))}
                          required
                        />
                      </div>
                      <div className="col-sm-6 farmer-form-group">
                        <label htmlFor="bank-name-input" style={{ fontSize: "12.5px", fontWeight: 700, color: "#1C1C16" }}>
                          Bank Name (Optional)
                        </label>
                        <input
                          id="bank-name-input"
                          type="text"
                          className="farmer-form-control"
                          placeholder="e.g. State Bank of India"
                          value={withdrawForm.bank_name}
                          onChange={(e) => setWithdrawForm((c) => ({ ...c, bank_name: e.target.value }))}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="farmer-form-group mb-3">
                    <label htmlFor="upi-id-input" style={{ fontSize: "12.5px", fontWeight: 700, color: "#1C1C16" }}>
                      UPI ID (Virtual Payment Address) *
                    </label>
                    <input
                      id="upi-id-input"
                      type="text"
                      className="farmer-form-control"
                      placeholder="e.g. 9876543210@upi or name@okhdfcbank"
                      value={withdrawForm.upi_id}
                      onChange={(e) => setWithdrawForm((c) => ({ ...c, upi_id: e.target.value }))}
                      required
                    />
                    <small style={{ color: "#79705F", fontSize: "11.5px" }}>
                      Supports Google Pay, PhonePe, Paytm, BHIM, and bank UPI apps.
                    </small>
                  </div>
                )}

                <div className="farmer-form-group mb-2">
                  <label htmlFor="payout-note" style={{ fontSize: "12.5px", fontWeight: 700, color: "#1C1C16" }}>
                    Note / Remarks (Optional)
                  </label>
                  <input
                    id="payout-note"
                    type="text"
                    className="farmer-form-control"
                    placeholder="e.g. Onion harvest earnings"
                    value={withdrawForm.note}
                    onChange={(e) => setWithdrawForm((c) => ({ ...c, note: e.target.value }))}
                  />
                </div>
              </div>

              <div className="farmer-modal-footer" style={{ padding: "14px 20px" }}>
                <button
                  type="button"
                  className="kisan-btn-outline kisan-btn-sm"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="kisan-btn-accent kisan-btn-sm"
                  disabled={submitting}
                >
                  {submitting ? "Processing Transfer..." : "Confirm & Withdraw"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

