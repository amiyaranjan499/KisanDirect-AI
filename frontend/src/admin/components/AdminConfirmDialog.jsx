import { useState, useEffect } from "react";

export default function AdminConfirmDialog({
  isOpen = false,
  onClose = () => {},
  onConfirm = async () => {},
  title = "Confirm Action",
  message = "Are you sure you want to perform this action?",
  confirmLabel = "Confirm",
  confirmVariant = "danger", // 'danger' | 'primary' | 'warning'
  requireReason = true,
  reasonLabel = "Audit Reason (required)",
  reasonPlaceholder = "Enter the reason for this administrative action...",
  loading = false,
  error = "",
}) {
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setValidationError("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (requireReason && !reason.trim()) {
      setValidationError("An audit reason is required for this action.");
      return;
    }
    setValidationError("");
    await onConfirm(reason.trim());
  };

  return (
    <div className="admin-modal-root" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="admin-modal-backdrop" onClick={!loading ? onClose : undefined} aria-hidden="true" />
      <div className="admin-modal-card">
        <header className="admin-modal-header">
          <div className={`admin-modal-icon ${confirmVariant}`}>
            <i className={confirmVariant === "danger" ? "bi bi-exclamation-triangle-fill" : "bi bi-shield-check"} />
          </div>
          <div className="admin-modal-title-area">
            <h3 id="dialog-title">{title}</h3>
            <p>{message}</p>
          </div>
        </header>

        <form onSubmit={handleSubmit}>
          {requireReason && (
            <div className="admin-modal-reason-group">
              <label htmlFor="admin-action-reason-input">
                {reasonLabel} <span className="text-danger">*</span>
              </label>
              <textarea
                id="admin-action-reason-input"
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (validationError) setValidationError("");
                }}
                placeholder={reasonPlaceholder}
                disabled={loading}
                required
                maxLength={1000}
                className={validationError ? "has-error" : ""}
              />
              {validationError && (
                <span className="admin-input-error">{validationError}</span>
              )}
            </div>
          )}

          {error && (
            <div className="admin-modal-error" role="alert">
              <i className="bi bi-x-circle-fill" /> {error}
            </div>
          )}

          <footer className="admin-modal-footer">
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`admin-btn-${confirmVariant}`}
              disabled={loading || (requireReason && !reason.trim())}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                  Processing...
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

