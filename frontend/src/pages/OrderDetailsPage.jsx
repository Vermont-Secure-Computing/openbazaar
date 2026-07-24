import { useEffect, useState } from "react";
import {
    Link,
    useNavigate,
    useParams,
} from "react-router-dom";
import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";
import {
    LAMPORTS_PER_SOL,
    PublicKey,
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
    releaseBuyerAndRecordSale,
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

function addressToString(address) {
    if (!address) return "";
    if (typeof address === "string") return address;
    if (typeof address?.toBase58 === "function") {
        return address.toBase58();
    }
    if (typeof address?.toString === "function") {
        const value = address.toString();
        return value === "[object Object]" ? "" : value;
    }
    return "";
}

function getBuyerAddress(escrow) {
    return addressToString(
        escrow?.partyA ??
        escrow?.party_a ??
        escrow?.buyer ??
        escrow?.buyerAddress ??
        escrow?.order?.buyer
    );
}

function getSellerAddress(escrow) {
    return addressToString(
        escrow?.partyB ??
        escrow?.party_b ??
        escrow?.seller ??
        escrow?.sellerAddress ??
        escrow?.order?.seller
    );
}

function shortenAddress(address) {
    const value = addressToString(address);
    if (!value) return "Address unavailable";
    if (value.length <= 14) return value;
    return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatTimestamp(timestamp) {
    const value = Number(
        timestamp?.toString?.() ?? timestamp
    );
    if (!value || value <= 0) return "";
    return new Date(value * 1000).toLocaleString();
}

async function getCompletionSignature(
    connection,
    escrowPublicKey
) {
    try {
        const address =
            escrowPublicKey instanceof PublicKey
                ? escrowPublicKey
                : new PublicKey(
                    addressToString(
                        escrowPublicKey
                    )
                );

        const signatures =
            await connection.getSignaturesForAddress(
                address,
                { limit: 20 },
                "confirmed"
            );

        for (const signatureInfo of signatures) {
            if (signatureInfo.err) continue;

            const transaction =
                await connection.getTransaction(
                    signatureInfo.signature,
                    {
                        commitment: "confirmed",
                        maxSupportedTransactionVersion:
                            0,
                    }
                );

            const logs =
                transaction?.meta?.logMessages || [];

            const recordedSale = logs.some((log) =>
                log.includes(
                    "Instruction: RecordCompletedSale"
                )
            );

            if (recordedSale) {
                return signatureInfo.signature;
            }
        }
        return "";
    } catch (error) {
        console.error(
            "Completion transaction lookup failed:",
            error
        );
        return "";
    }
}

export default function OrderDetailsPage() {
    const { role, escrowAddress } = useParams();
    const navigate = useNavigate();
    const { connection } = useConnection();
    const wallet = useWallet();

    const [escrow, setEscrow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [processing, setProcessing] =
        useState(false);
    const [completionSignature, setCompletionSignature] =
        useState("");
    const [loadingCompletionSignature, setLoadingCompletionSignature] =
        useState(false);

    const loadOrder = async () => {
        if (!wallet.publicKey) {
            setEscrow(null);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError("");

            if (role !== "buyer" && role !== "seller") {
                throw new Error("Invalid order role.");
            }

            const [escrows, merchants] =
                await Promise.all([
                    role === "buyer"
                        ? getBuyerEscrows({
                            connection,
                            wallet,
                        })
                        : getSellerEscrows({
                            connection,
                            wallet,
                        }),
                    getMerchants(),
                ]);

            const matchedEscrow = escrows.find(
                (entry) =>
                    addressToString(entry.publicKey) ===
                    escrowAddress
            );

            if (!matchedEscrow) {
                throw new Error(
                    "Order not found for this wallet."
                );
            }

            let product = null;
            if (matchedEscrow.order?.product) {
                try {
                    product = await getProduct(
                        matchedEscrow.order.product
                    );
                } catch (productError) {
                    console.error(
                        "Product lookup error:",
                        productError
                    );
                }
            }

            const sellerAddress =
                getSellerAddress(matchedEscrow);

            const sellerMerchant = merchants.find(
                (merchant) =>
                    addressToString(
                        merchant.authority
                    ) === sellerAddress
            ) || null;

            setEscrow({
                ...matchedEscrow,
                product,
                sellerMerchant,
            });
        } catch (loadError) {
            console.error(
                "Order detail load error:",
                loadError
            );
            setEscrow(null);
            setError(
                loadError?.message ||
                "Failed to load order."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrder();
    }, [
        connection,
        wallet.publicKey,
        role,
        escrowAddress,
    ]);

    useEffect(() => {
        let cancelled = false;

        const loadSignature = async () => {
            if (
                !escrow ||
                escrow.status !==
                    ESCROW_STATUS.COMPLETED
            ) {
                setCompletionSignature("");
                return;
            }

            try {
                setLoadingCompletionSignature(true);
                const signature =
                    await getCompletionSignature(
                        connection,
                        escrow.publicKey
                    );
                if (!cancelled) {
                    setCompletionSignature(signature);
                }
            } finally {
                if (!cancelled) {
                    setLoadingCompletionSignature(false);
                }
            }
        };

        loadSignature();
        return () => {
            cancelled = true;
        };
    }, [
        connection,
        escrow?.publicKey,
        escrow?.status,
    ]);

    const runAction = async (
        action,
        successMessage
    ) => {
        try {
            setProcessing(true);
            const signature = await action();
            alert(
                `${successMessage}\n\nTransaction: ${signature}`
            );
            await loadOrder();
            return true;
        } catch (actionError) {
            console.error(
                "Order action error:",
                actionError
            );
            alert(
                actionError?.message ||
                "Transaction failed."
            );
            return false;
        } finally {
            setProcessing(false);
        }
    };

    const acceptOrder = () =>
        runAction(
            () => sellerAcceptEscrow({
                connection,
                wallet,
                escrow,
            }),
            "Order accepted and seller deposit submitted."
        );

    const proposeCompletion = (
        donationPercent = 0
    ) =>
        runAction(
            () => sellerSuggestCompletion({
                connection,
                wallet,
                escrow,
                donationPercent,
            }),
            "Order marked ready for buyer confirmation."
        );

    const retrieveDeposit = async () => {
        const buyerRefund = lamportsToSol(
            escrow.proposedPayoutA
        );
        const sellerPayout = lamportsToSol(
            escrow.proposedPayoutB
        );

        const confirmed = window.confirm(
            `Confirm that you received the product?\n\n` +
            `${buyerRefund} SOL will be returned to you.\n` +
            `${sellerPayout} SOL will be released to the seller.\n\n` +
            `This action requires one wallet signature.`
        );

        if (!confirmed) return;

        await runAction(
            () => releaseBuyerAndRecordSale({
                connection,
                wallet,
                escrow,
            }),
            "Your deposit was returned and the seller was paid."
        );
    };

    const submitReview = async (
        rating,
        comment
    ) => {
        const productPublicKey =
            escrow.product?.publicKey ||
            escrow.order?.product;
        const merchantAuthority =
            escrow.sellerMerchant?.authority ||
            getSellerAddress(escrow);

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

        return runAction(
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

    const closeOrder = async () => {
        const confirmed = window.confirm(
            "Close this completed order and recover the escrow account rent? The order will disappear from the current escrow list."
        );
        if (!confirmed) return;

        const success = await runAction(
            () => closeCompletedEscrow({
                connection,
                wallet,
                escrow,
            }),
            "Order closed and escrow rent recovered."
        );

        if (success) {
            navigate("/orders");
        }
    };

    if (!wallet.publicKey) {
        return (
            <main style={{ padding: 24 }}>
                <Link to="/orders">
                    ← Back to Orders
                </Link>
                <h1>Order Details</h1>
                <p>
                    Connect your wallet to view this order.
                </p>
            </main>
        );
    }

    if (loading) {
        return (
            <main style={{ padding: 24 }}>
                <p>Loading order details...</p>
            </main>
        );
    }

    if (error || !escrow) {
        return (
            <main
                style={{
                    maxWidth: 1100,
                    margin: "0 auto",
                    padding: 24,
                }}
            >
                <Link to="/orders">
                    ← Back to Orders
                </Link>
                <h1>Order Details</h1>
                <p style={{ color: "#dc2626" }}>
                    {error || "Order not found."}
                </p>
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
            <Link to="/orders">
                ← Back to Orders
            </Link>

            <div
                style={{
                    marginTop: 24,
                    marginBottom: 20,
                }}
            >
                <h1 style={{ marginBottom: 4 }}>
                    Order Details
                </h1>
                <p
                    style={{
                        marginTop: 0,
                        color: "#666",
                    }}
                >
                    Review the product, payment,
                    timeline, chat, and available
                    actions.
                </p>
            </div>

            <OrderCard
                connection={connection}
                escrow={escrow}
                role={role}
                completionSignature={
                    completionSignature
                }
                loadingCompletionSignature={
                    loadingCompletionSignature
                }
                processing={processing}
                onAccept={acceptOrder}
                onProposeCompletion={
                    proposeCompletion
                }
                onRetrieveDeposit={
                    retrieveDeposit
                }
                onCloseOrder={closeOrder}
                onSubmitReview={submitReview}
            />
        </main>
    );
}

function OrderCard({
    connection,
    escrow,
    role,
    completionSignature,
    loadingCompletionSignature,
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
            getSellerAddress(escrow)
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
                        <span title={getBuyerAddress(escrow)}>
                            {shortenAddress(
                                getBuyerAddress(escrow)
                            )}
                        </span>
                    </p>

                    {getBuyerAddress(escrow) && (
                        <p
                            style={{
                                marginTop: -8,
                                fontSize: 12,
                                color: "#666",
                                overflowWrap: "anywhere",
                            }}
                        >
                            {getBuyerAddress(escrow)}
                        </p>
                    )}

                    <p>
                        <strong>
                            Seller:
                        </strong>{" "}
                        {sellerDisplayName}
                    </p>

                    {escrow.status ===
                        ESCROW_STATUS.COMPLETED && (
                        <div
                            style={{
                                marginTop: 16,
                                padding: 14,
                                border:
                                    "1px solid #bbf7d0",
                                borderRadius: 10,
                                background: "#f0fdf4",
                            }}
                        >
                            <strong>
                                Payment Release Transaction
                            </strong>

                            {loadingCompletionSignature ? (
                                <p>
                                    Loading transaction...
                                </p>
                            ) : completionSignature ? (
                                <>
                                    <p
                                        style={{
                                            overflowWrap:
                                                "anywhere",
                                            fontSize: 13,
                                        }}
                                    >
                                        {completionSignature}
                                    </p>

                                    <a
                                        href={
                                            `https://explorer.solana.com/tx/` +
                                            `${completionSignature}?cluster=devnet`
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        View transaction on Solana Explorer
                                    </a>
                                </>
                            ) : (
                                <p>
                                    Completion transaction
                                    not found yet.
                                </p>
                            )}
                        </div>
                    )}

                    {getSellerAddress(escrow) && (
                        <p
                            style={{
                                marginTop: -8,
                                fontSize: 12,
                                color: "#666",
                                overflowWrap: "anywhere",
                            }}
                        >
                            {getSellerAddress(escrow)}
                        </p>
                    )}

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