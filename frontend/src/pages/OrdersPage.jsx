import { useEffect, useState } from "react";
import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";
import {
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
    ESCROW_STATUS,
    getBuyerEscrows,
    getSellerEscrows,
    getEscrowStatusLabel,
    getEscrowTimeline,
    sellerAcceptEscrow,
    closeCompletedEscrow,
    sellerSuggestCompletion,
    retrieveBuyerDeposit,
    recordCompletedSale,
} from "../lib/escrow";

import { getProduct } from "../lib/product";
import { getMerchants } from "../lib/merchant";
import OrderChat from "../components/OrderChat";
import {
    initializeMerchantReputation,
    submitProductReview,
    hasOrderReview,
} from "../lib/review";

function lamportsToSol(value) {
    try {
        const lamports = Number(
            value?.toString?.() ?? value
        );

        if (!Number.isFinite(lamports)) {
            return "0.0000";
        }

        return (
            lamports / LAMPORTS_PER_SOL
        ).toFixed(4);
    } catch {
        return "0.0000";
    }
}

function calculateBuyerRefund(escrow) {
    const requiredDepositA = Number(
        escrow.requiredDepositA?.toString?.() ??
            escrow.requiredDepositA ??
            0
    );

    const referenceAmount = Number(
        escrow.referenceAmount?.toString?.() ??
            escrow.referenceAmount ??
            0
    );

    const refund =
        requiredDepositA - referenceAmount;

    return refund > 0 ? refund : 0;
}

function shortenAddress(address) {
    if (!address) {
        return "";
    }

    return `${address.slice(
        0,
        6
    )}...${address.slice(-6)}`;
}

function formatTimestamp(timestamp) {
    const value = Number(
        timestamp?.toString?.() ?? timestamp
    );

    if (!value || value <= 0) {
        return "";
    }

    return new Date(
        value * 1000
    ).toLocaleString();
}

export default function OrdersPage() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [buyerOrders, setBuyerOrders] =
        useState([]);

    const [sellerOrders, setSellerOrders] =
        useState([]);

    const [loading, setLoading] =
        useState(true);

    const [
        processingEscrow,
        setProcessingEscrow,
    ] = useState("");

    const [error, setError] =
        useState("");

    const enrichOrders = async (
        escrows,
        merchants
    ) => {
        return Promise.all(
            escrows.map(async (escrow) => {
                let product = null;

                if (escrow.order?.product) {
                    try {
                        product = await getProduct(
                            escrow.order.product
                        );
                    } catch (productError) {
                        console.error(
                            "Product lookup error:",
                            productError
                        );
                    }
                }

                const sellerMerchant =
                    merchants.find(
                        (merchant) =>
                            merchant.authority ===
                            escrow.partyB
                    );

                return {
                    ...escrow,
                    product,
                    sellerMerchant:
                        sellerMerchant || null,
                };
            })
        );
    };

    const loadOrders = async () => {
        if (!wallet.publicKey) {
            setBuyerOrders([]);
            setSellerOrders([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError("");

            const [
                buyerEscrows,
                sellerEscrows,
                merchants,
            ] = await Promise.all([
                getBuyerEscrows({
                    connection,
                    wallet,
                }),

                getSellerEscrows({
                    connection,
                    wallet,
                }),

                getMerchants(),
            ]);

            const [
                enrichedBuyer,
                enrichedSeller,
            ] = await Promise.all([
                enrichOrders(
                    buyerEscrows,
                    merchants
                ),

                enrichOrders(
                    sellerEscrows,
                    merchants
                ),
            ]);

            setBuyerOrders(enrichedBuyer);
            setSellerOrders(enrichedSeller);
        } catch (loadError) {
            console.error(
                "Load orders error:",
                loadError
            );

            setError(
                loadError?.message ||
                    "Failed to load orders."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
    }, [
        wallet.publicKey,
        connection,
    ]);

    const runEscrowAction = async (
        escrow,
        action,
        successMessage
    ) => {
        try {
            setProcessingEscrow(
                escrow.publicKey
            );

            const signature =
                await action();

            alert(
                `${successMessage}\n\nTransaction: ${signature}`
            );

            await loadOrders();
            return true;
        } catch (actionError) {
            console.error(
                "Escrow action error:",
                actionError
            );

            alert(
                actionError?.message ||
                    "Transaction failed."
            );
            return false;
        } finally {
            setProcessingEscrow("");
        }
    };

    const acceptOrder = async (
        escrow
    ) => {
        await runEscrowAction(
            escrow,
            () =>
                sellerAcceptEscrow({
                    connection,
                    wallet,
                    escrow
                }),
            "Order accepted and seller deposit submitted."
        );
    };

    const proposeCompletion = async (
        escrow,
        donationPercent = 0
    ) => {
        await runEscrowAction(
            escrow,
            () =>
                sellerSuggestCompletion({
                    connection,
                    wallet,
                    escrow,
                    donationPercent,
                }),
            "Order marked ready for buyer confirmation."
        );
    };

    const retrieveDeposit = async (
        escrow
    ) => {
        const buyerRefund =
            lamportsToSol(
                escrow.proposedPayoutA
            );

        const sellerPayout =
            lamportsToSol(
                escrow.proposedPayoutB
            );

        const confirmed =
            window.confirm(
                `Confirm that you received the product?\n\n` +
                    `${buyerRefund} SOL will be returned to you.\n` +
                    `${sellerPayout} SOL will be released to the seller.`
            );

        if (!confirmed) {
            return;
        }

        await runEscrowAction(
            escrow,
            async () => {
                const escrowSignature = await retrieveBuyerDeposit({ connection, wallet, escrow });
                const saleSignature = await recordCompletedSale({ connection, wallet, escrow });
                return saleSignature || escrowSignature;
            },
            "Your deposit was returned and the seller was paid."
        );
    };

    const submitReview = async ({
        escrow,
        rating,
        comment,
    }) => {
        const productPublicKey =
            escrow.product?.publicKey ||
            escrow.order?.product;

        const merchantAuthority =
            escrow.sellerMerchant?.authority ||
            escrow.partyB;

        if (!productPublicKey) {
            throw new Error(
                "Product account is unavailable."
            );
        }

        if (!merchantAuthority) {
            throw new Error(
                "Seller merchant authority is unavailable."
            );
        }

        return runEscrowAction(
            escrow,
            async () => {
                await initializeMerchantReputation({
                    connection,
                    wallet,
                    merchantAuthority,
                });

                const result =
                    await submitProductReview({
                        connection,
                        wallet,
                        escrow: escrow.publicKey,
                        product: productPublicKey,
                        merchantAuthority,
                        rating,
                        comment,
                    });

                return result.signature;
            },
            "Review submitted successfully."
        );
    };

    const closeOrder = async (
        escrow
    ) => {
        const confirmed =
            window.confirm(
                "Close this completed order and recover the escrow account rent? The order will disappear from the current escrow list."
            );

        if (!confirmed) {
            return;
        }

        await runEscrowAction(
            escrow,
            () =>
                closeCompletedEscrow({
                    connection,
                    wallet,
                    escrow,
                }),
            "Order closed and escrow rent recovered."
        );
    };

    if (!wallet.publicKey) {
        return (
            <main style={{ padding: 24 }}>
                <h1>Orders</h1>

                <p>
                    Connect your wallet to
                    view your purchases and
                    seller orders.
                </p>
            </main>
        );
    }

    if (loading) {
        return (
            <main style={{ padding: 24 }}>
                <h1>Orders</h1>
                <p>Loading orders...</p>
            </main>
        );
    }

    return (
        <main
            style={{
                maxWidth: 1100,
                margin: "0 auto",
                padding: 24,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent:
                        "space-between",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <h1>Orders</h1>

                    <p>
                        Manage your purchases
                        and seller transactions.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={loadOrders}
                    disabled={loading}
                >
                    Refresh Orders
                </button>
            </div>

            {error && (
                <p
                    style={{
                        color: "#dc2626",
                    }}
                >
                    {error}
                </p>
            )}

            <section
                style={{ marginTop: 32 }}
            >
                <h2>My Purchases</h2>

                {buyerOrders.length ===
                0 ? (
                    <p>
                        No purchase orders
                        yet.
                    </p>
                ) : (
                    buyerOrders.map(
                        (escrow) => (
                            <OrderCard
                                key={
                                    escrow.publicKey
                                }
                                connection={
                                    connection
                                }
                                escrow={
                                    escrow
                                }
                                role="buyer"
                                processing={
                                    processingEscrow ===
                                    escrow.publicKey
                                }
                                onRetrieveDeposit={() =>
                                    retrieveDeposit(
                                        escrow
                                    )
                                }
                                onCloseOrder={() =>
                                    closeOrder(
                                        escrow
                                    )
                                }
                                onSubmitReview={(rating, comment) =>
                                    submitReview({
                                        escrow,
                                        rating,
                                        comment,
                                    })
                                }
                            />
                        )
                    )
                )}
            </section>

            <section
                style={{ marginTop: 48 }}
            >
                <h2>Seller Orders</h2>

                {sellerOrders.length ===
                0 ? (
                    <p>
                        No seller orders yet.
                    </p>
                ) : (
                    sellerOrders.map(
                        (escrow) => (
                            <OrderCard
                                key={
                                    escrow.publicKey
                                }
                                connection={
                                    connection
                                }
                                escrow={
                                    escrow
                                }
                                role="seller"
                                processing={
                                    processingEscrow ===
                                    escrow.publicKey
                                }
                                onAccept={() =>
                                    acceptOrder(
                                        escrow
                                    )
                                }
                                onProposeCompletion={(donationPercent) =>
                                    proposeCompletion(escrow, donationPercent)
                                }
                            />
                        )
                    )
                )}
            </section>
        </main>
    );
}

function OrderCard({
    connection,
    escrow,
    role,
    processing,
    onAccept,
    onProposeCompletion,
    onRetrieveDeposit,
    onCloseOrder,
    onSubmitReview,
}) {
    const product = escrow.product;
    const merchant =
        escrow.sellerMerchant;
    const [showCompletionOptions, setShowCompletionOptions] = useState(false);
    const [donationPercent, setDonationPercent] = useState(0);
    const [rating, setRating] = useState(5);
    const [reviewComment, setReviewComment] = useState("");
    const [reviewExists, setReviewExists] = useState(false);
    const [checkingReview, setCheckingReview] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const checkReview = async () => {
            if (
                role !== "buyer" ||
                escrow.status !== ESCROW_STATUS.COMPLETED
            ) {
                return;
            }

            try {
                setCheckingReview(true);
                const result = await hasOrderReview({
                    connection,
                    escrow: escrow.publicKey,
                });

                if (!cancelled) {
                    setReviewExists(result.exists);
                }
            } catch (reviewError) {
                console.error(
                    "Review status check failed:",
                    reviewError
                );
            } finally {
                if (!cancelled) {
                    setCheckingReview(false);
                }
            }
        };

        checkReview();

        return () => {
            cancelled = true;
        };
    }, [
        connection,
        role,
        escrow.status,
        escrow.publicKey,
    ]);

    const timeline =
        getEscrowTimeline(escrow);

    const sellerNeedsDeposit =
        escrow.status ===
            ESCROW_STATUS.CREATED &&
        Number(
            escrow.depositedB
                ?.toString?.() ??
                escrow.depositedB ??
                0
        ) === 0;

    const sellerDisplayName =
        merchant?.storeName ||
        shortenAddress(
            escrow.partyB
        );

    const buyerRefundLamports =
        calculateBuyerRefund(escrow);

    return (
        <article
            style={{
                border:
                    "1px solid #ddd",
                borderRadius: 16,
                padding: 20,
                marginTop: 16,
                background: "#fff",
            }}
        >
            <div
                style={{
                    display: "flex",
                    gap: 20,
                    flexWrap: "wrap",
                }}
            >
                <div
                    style={{
                        width: 160,
                        flexShrink: 0,
                    }}
                >
                    {product?.imageUri ? (
                        <img
                            src={
                                product.imageUri
                            }
                            alt={
                                product.title
                            }
                            style={{
                                width: "100%",
                                height: 150,
                                objectFit:
                                    "cover",
                                borderRadius:
                                    12,
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: "100%",
                                height: 150,
                                borderRadius:
                                    12,
                                border:
                                    "1px solid #ddd",
                                display:
                                    "flex",
                                alignItems:
                                    "center",
                                justifyContent:
                                    "center",
                            }}
                        >
                            No Image
                        </div>
                    )}
                </div>

                <div
                    style={{
                        flex: 1,
                        minWidth: 260,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent:
                                "space-between",
                            gap: 16,
                            flexWrap:
                                "wrap",
                        }}
                    >
                        <div>
                            <h3
                                style={{
                                    marginTop:
                                        0,
                                }}
                            >
                                {product?.title ||
                                    "Product unavailable"}
                            </h3>

                            <p>
                                Order{" "}
                                {shortenAddress(
                                    escrow.publicKey
                                )}
                            </p>
                        </div>

                        <StatusBadge
                            status={
                                escrow.status
                            }
                        />
                    </div>

                    <p>
                        <strong>
                            Quantity:
                        </strong>{" "}
                        {escrow.order
                            ?.quantity || 1}
                    </p>

                    <p>
                        <strong>
                            Product price:
                        </strong>{" "}
                        {lamportsToSol(
                            escrow.referenceAmount
                        )}{" "}
                        SOL
                    </p>

                    <p>
                        <strong>
                            Buyer total locked:
                        </strong>{" "}
                        {lamportsToSol(
                            escrow.requiredDepositA
                        )}{" "}
                        SOL
                    </p>

                    <p>
                        <strong>
                            Refundable buyer
                            deposit:
                        </strong>{" "}
                        {lamportsToSol(
                            buyerRefundLamports
                        )}{" "}
                        SOL
                    </p>

                    <p>
                        <strong>
                            Seller refundable
                            deposit:
                        </strong>{" "}
                        {lamportsToSol(
                            escrow.requiredDepositB
                        )}{" "}
                        SOL
                    </p>

                    <p>
                        <strong>
                            Buyer:
                        </strong>{" "}
                        {shortenAddress(
                            escrow.partyA
                        )}
                    </p>

                    <p>
                        <strong>
                            Seller:
                        </strong>{" "}
                        {sellerDisplayName}
                    </p>

                    {merchant?.shipsFrom && (
                        <p>
                            <strong>
                                Ships from:
                            </strong>{" "}
                            {
                                merchant.shipsFrom
                            }
                        </p>
                    )}

                    <div
                        style={{
                            marginTop: 20,
                        }}
                    >
                        {role ===
                            "seller" &&
                            sellerNeedsDeposit && (
                                <button
                                    type="button"
                                    onClick={
                                        onAccept
                                    }
                                    disabled={
                                        processing
                                    }
                                >
                                    {processing
                                        ? "Accepting..."
                                        : `Accept Order and Deposit ${lamportsToSol(
                                              escrow.requiredDepositB
                                          )} SOL`}
                                </button>
                            )}

                        {role ===
                            "seller" &&
                            escrow.status ===
                                ESCROW_STATUS.DEPOSITS_COMPLETE && (
                                <div>
                                    {!showCompletionOptions ? (
                                        <button type="button" onClick={() => setShowCompletionOptions(true)} disabled={processing}>
                                            Mark Ready for Buyer Confirmation
                                        </button>
                                    ) : (
                                        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12, background: "#f9fafb", maxWidth: 520 }}>
                                            <strong>Optional website donation: {donationPercent}%</strong>
                                            <input type="range" min="0" max="100" step="1" value={donationPercent}
                                                onChange={(e) => setDonationPercent(Number(e.target.value))}
                                                disabled={processing} style={{ width: "100%", marginTop: 12 }} />
                                            <p>Donation amount: <strong>{lamportsToSol(Math.floor(Number(escrow.referenceAmount) * donationPercent / 100))} SOL</strong></p>
                                            <small>Deducted only from seller proceeds. Buyer refund is unchanged.</small>
                                            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                                                <button type="button" onClick={() => onProposeCompletion(donationPercent)} disabled={processing}>
                                                    {processing ? "Proposing..." : donationPercent > 0 ? `Confirm Ready + Donate ${donationPercent}%` : "Confirm Ready Without Donation"}
                                                </button>
                                                <button type="button" onClick={() => { setDonationPercent(0); setShowCompletionOptions(false); }} disabled={processing}>Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                        {role ===
                            "buyer" &&
                            escrow.status ===
                                ESCROW_STATUS.FINALIZATION_SUGGESTED && (
                                <div>
                                    <div
                                        style={{
                                            marginBottom:
                                                14,
                                            padding:
                                                14,
                                            border:
                                                "1px solid #ddd",
                                            borderRadius:
                                                10,
                                            background:
                                                "#f9fafb",
                                        }}
                                    >
                                        <p>
                                            <strong>
                                                Deposit
                                                returned
                                                to you:
                                            </strong>{" "}
                                            {lamportsToSol(
                                                escrow.proposedPayoutA
                                            )}{" "}
                                            SOL
                                        </p>

                                        <p>
                                            <strong>
                                                Released
                                                to seller:
                                            </strong>{" "}
                                            {lamportsToSol(
                                                escrow.proposedPayoutB
                                            )}{" "}
                                            SOL
                                        </p>

                                        <small>
                                            Confirm
                                            only after
                                            receiving
                                            and checking
                                            the product.
                                        </small>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={
                                            onRetrieveDeposit
                                        }
                                        disabled={
                                            processing
                                        }
                                    >
                                        {processing
                                            ? "Processing..."
                                            : "Retrieve Deposit & Release Payment"}
                                    </button>
                                </div>
                            )}

                        {role ===
                            "buyer" &&
                            escrow.status ===
                                ESCROW_STATUS.COMPLETED && (
                                <div
                                    style={{
                                        display: "grid",
                                        gap: 16,
                                        maxWidth: 520,
                                    }}
                                >
                                    {checkingReview ? (
                                        <p>Checking review status...</p>
                                    ) : reviewExists ? (
                                        <div
                                            style={{
                                                padding: 14,
                                                border: "1px solid #bbf7d0",
                                                borderRadius: 10,
                                                background: "#f0fdf4",
                                            }}
                                        >
                                            Review already submitted.
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                padding: 16,
                                                border: "1px solid #ddd",
                                                borderRadius: 12,
                                                background: "#f9fafb",
                                            }}
                                        >
                                            <h4 style={{ marginTop: 0 }}>
                                                Review this product
                                            </h4>

                                            <label style={{ display: "block", marginBottom: 8 }}>
                                                Rating
                                            </label>

                                            <select
                                                value={rating}
                                                onChange={(event) =>
                                                    setRating(Number(event.target.value))
                                                }
                                                disabled={processing}
                                                style={{
                                                    width: "100%",
                                                    padding: 10,
                                                    marginBottom: 12,
                                                }}
                                            >
                                                <option value={5}>5 - Excellent</option>
                                                <option value={4}>4 - Very Good</option>
                                                <option value={3}>3 - Good</option>
                                                <option value={2}>2 - Fair</option>
                                                <option value={1}>1 - Poor</option>
                                            </select>

                                            <label style={{ display: "block", marginBottom: 8 }}>
                                                Comment
                                            </label>

                                            <textarea
                                                value={reviewComment}
                                                onChange={(event) =>
                                                    setReviewComment(event.target.value)
                                                }
                                                maxLength={280}
                                                rows={4}
                                                placeholder="Share your experience with this product..."
                                                disabled={processing}
                                                style={{
                                                    width: "100%",
                                                    padding: 10,
                                                    resize: "vertical",
                                                    boxSizing: "border-box",
                                                }}
                                            />

                                            <small>
                                                {reviewComment.length}/280
                                            </small>

                                            <button
                                                type="button"
                                                disabled={processing}
                                                onClick={async () => {
                                                    const success =
                                                        await onSubmitReview(
                                                            rating,
                                                            reviewComment
                                                        );

                                                    if (success) {
                                                        setReviewExists(true);
                                                    }
                                                }}
                                                style={{
                                                    display: "block",
                                                    marginTop: 14,
                                                }}
                                            >
                                                {processing
                                                    ? "Submitting Review..."
                                                    : "Submit Review"}
                                            </button>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={onCloseOrder}
                                        disabled={
                                            processing ||
                                            checkingReview ||
                                            !reviewExists
                                        }
                                    >
                                        {processing
                                            ? "Processing..."
                                            : !reviewExists
                                            ? "Submit Review Before Closing"
                                            : "Close Order and Recover Rent"}
                                    </button>
                                </div>
                            )}
                    </div>
                </div>
            </div>

            <div
                style={{
                    marginTop: 24,
                    borderTop:
                        "1px solid #eee",
                    paddingTop: 20,
                }}
            >
                <h4>Order Timeline</h4>

                <div
                    style={{
                        display: "grid",
                        gap: 12,
                    }}
                >
                    {timeline.map(
                        (
                            event,
                            index
                        ) => (
                            <div
                                key={`${event.label}-${index}`}
                                style={{
                                    display:
                                        "flex",
                                    gap: 12,
                                    alignItems:
                                        "flex-start",
                                }}
                            >
                                <span>
                                    {event.completed
                                        ? "✅"
                                        : "○"}
                                </span>

                                <div>
                                    <strong>
                                        {
                                            event.label
                                        }
                                    </strong>

                                    {event.timestamp >
                                        0 && (
                                        <div
                                            style={{
                                                fontSize:
                                                    13,
                                                color:
                                                    "#666",
                                                marginTop:
                                                    2,
                                            }}
                                        >
                                            {formatTimestamp(
                                                event.timestamp
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>

            <OrderChat escrow={escrow} />
        </article>
    );
}

function StatusBadge({ status }) {
    const label =
        getEscrowStatusLabel(status);

    let background = "#e5e7eb";
    let color = "#111827";

    if (
        status ===
        ESCROW_STATUS.CREATED
    ) {
        background = "#fef3c7";
        color = "#92400e";
    }

    if (
        status ===
        ESCROW_STATUS.DEPOSITS_COMPLETE
    ) {
        background = "#dbeafe";
        color = "#1e40af";
    }

    if (
        status ===
        ESCROW_STATUS.FINALIZATION_SUGGESTED
    ) {
        background = "#ede9fe";
        color = "#5b21b6";
    }

    if (
        status ===
        ESCROW_STATUS.COMPLETED
    ) {
        background = "#dcfce7";
        color = "#166534";
    }

    return (
        <span
            style={{
                display:
                    "inline-block",
                padding:
                    "6px 10px",
                borderRadius: 999,
                background,
                color,
                fontWeight: 700,
                fontSize: 13,
            }}
        >
            {label}
        </span>
    );
}