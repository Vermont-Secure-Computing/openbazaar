export default function TransactionPreview({
    open,
    title,
    description,
    rows = [],
    explanation,
    confirmLabel = "Continue to Wallet",
    cancelLabel = "Cancel",
    processing = false,
    onConfirm,
    onCancel,
}) {
    if (!open) return null;

    return (
        <div
            className="transaction-preview-backdrop"
            role="presentation"
            onMouseDown={event => {
                if (event.target === event.currentTarget && !processing) {
                    onCancel?.();
                }
            }}
        >
            <section
                className="transaction-preview"
                role="dialog"
                aria-modal="true"
                aria-labelledby="transaction-preview-title"
            >
                <div className="transaction-preview-header">
                    <div>
                        <span className="transaction-preview-eyebrow">Transaction Preview</span>

                        <h2 id="transaction-preview-title">{title}</h2>

                        {description && (<p>{description}</p>)}
                    </div>

                    <button
                        type="button"
                        className="transaction-preview-close"
                        onClick={onCancel}
                        disabled={processing}
                        aria-label="Close transaction preview"
                    >
                        ×
                    </button>
                </div>

                {rows.length > 0 && (
                    <div className="transaction-preview-summary">
                        {rows.map((row, index) => (
                            <div
                                key={`${row.label}-${index}`}
                                className={`transaction-preview-row${
                                    row.emphasis ? " emphasis" : ""
                                }`}
                            >
                                <span>{row.label}</span>
                                <strong>{row.value}</strong>
                            </div>
                        ))}
                    </div>
                )}

                {explanation && (
                    <div className="transaction-preview-explanation">
                        <strong>What this transaction does</strong>
                        <p>{explanation}</p>
                    </div>
                )}

                <p className="transaction-preview-wallet-note">
                    Your wallet will open next so you can review and sign
                    the transaction. SolZaar cannot sign transactions for you.
                </p>

                <div className="transaction-preview-actions">
                    <button
                        type="button"
                        className="transaction-preview-cancel"
                        onClick={onCancel}
                        disabled={processing}
                    >
                        {cancelLabel}
                    </button>

                    <button
                        type="button"
                        className="transaction-preview-confirm"
                        onClick={onConfirm}
                        disabled={processing}
                    >
                        {processing
                            ? "Opening Wallet..."
                            : confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    );
}