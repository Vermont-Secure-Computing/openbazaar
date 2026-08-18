import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
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
    withdrawBuyerOrder,
    requestMutualCancellation,
    approveMutualCancellation,
    declineMutualCancellation,
    rejectPendingFinalization,
    isMutualCancellationProposal,
    getMutualCancellationReason,
    MUTUAL_CANCELLATION_PREFIX,
} from "../lib/escrow";
import { useNetwork } from "../context/NetworkContext";

import { getProduct } from "../lib/product";
import { getMerchants } from "../lib/merchant";
import OrderChat from "../components/OrderChat";
import { sendOrderMessage } from "../lib/chat";
import {
    initializeMerchantReputation,
    submitProductReview,
    hasOrderReview,
} from "../lib/review";
import "./OrderDetailsPage.css";

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
            
            const acceptedFinalization = logs.some((log) =>
                log.includes(
                    "Instruction: AcceptFinalization"
                )
            );
            
            if (
                recordedSale ||
                acceptedFinalization
            ) {
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
    const [processing, setProcessing] = useState(false);
    const [completionSignature, setCompletionSignature] = useState("");
    const [loadingCompletionSignature, setLoadingCompletionSignature] = useState(false);
    const { isMainnet } = useNetwork();

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

    const requestCancellation = async (
        reason
    ) => {
        const confirmed =
            window.confirm(
                `Request mutual cancellation?\n\n` +
                `Reason: ${reason}\n\n` +
                `The other party must approve before funds are returned.`
            );

        if (!confirmed) {
            return false;
        }

        return runAction(
            () =>
                requestMutualCancellation({
                    connection,
                    wallet,
                    escrow,
                    reason,
                }),
            "Mutual cancellation request submitted."
        );
    };

    const approveCancellation = async () => {
        const buyerPayout =
            lamportsToSol(
                escrow.proposedPayoutA
            );

        const sellerPayout =
            lamportsToSol(
                escrow.proposedPayoutB
            );

        const confirmed =
            window.confirm(
                `Approve mutual cancellation?\n\n` +
                `Buyer refund: ${buyerPayout} SOL\n` +
                `Seller refund: ${sellerPayout} SOL\n\n` +
                `Each party will receive its own deposited funds.`
            );

        if (!confirmed) {
            return false;
        }

        const success =
            await runAction(
                () =>
                    approveMutualCancellation({
                        connection,
                        wallet,
                        escrow,
                    }),
                "Cancellation approved and both parties were refunded."
            );

        if (success) {
            navigate("/orders", {
                replace: true,
            });
        }

        return success;
    };

    const declineCancellation = async () => {
        const confirmed =
            window.confirm(
                "Decline this mutual cancellation request? The order will return to the accepted state."
            );

        if (!confirmed) {
            return false;
        }

        return runAction(
            () =>
                declineMutualCancellation({
                    connection,
                    wallet,
                    escrow,
                }),
            "Cancellation request declined."
        );
    };

    const rejectFinalization = async () => {
        const confirmed = window.confirm(
            "Reject the seller's ready status?\n\n" +
            "The order will return to the accepted state. " +
            "You may then request mutual cancellation."
        );
    
        if (!confirmed) {
            return false;
        }
    
        return runAction(
            () =>
                rejectPendingFinalization({
                    connection,
                    wallet,
                    escrow,
                }),
            "Ready status rejected. You may now request mutual cancellation."
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

    const withdrawOrder = async () => {
        const sellerDeposit =
            Number(
                escrow.depositedB
                    ?.toString?.() ??
                    escrow.depositedB ??
                    0
            );

        if (
            escrow.status !==
                ESCROW_STATUS.CREATED ||
            sellerDeposit > 0
        ) {
            alert(
                "This order can no longer be withdrawn because the seller has already accepted or deposited."
            );
            await loadOrder();
            return;
        }

        const refundAmount =
            lamportsToSol(
                escrow.depositedA
            );
    
        const confirmed =
            window.confirm(
                `Withdraw this order?\n\n` +
                `${refundAmount} SOL will be returned to your wallet.\n\n` +
                `This is only available before the seller deposits.`
            );
    
        if (!confirmed) {
            return;
        }
    
        const success =
            await runAction(
                () =>
                    withdrawBuyerOrder({
                        connection,
                        wallet,
                        escrow,
                    }),
                "Order withdrawn and your deposit was refunded."
            );
    
        if (success) {
            navigate("/orders", {
                replace: true,
            });
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
        <main className="order-details-page">
            <Link to="/orders">
                ← Back to Orders
            </Link>

            <div className="order-details-header">
                <h1 style={{ marginBottom: 4 }}>
                    Order Details
                </h1>
                <p>
                    Review the product, payment,
                    timeline, chat, and available
                    actions.
                </p>
            </div>

            <OrderCard
                connection={connection}
                escrow={escrow}
                role={role}
                wallet={wallet}
                isMainnet={isMainnet}
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
                onRejectFinalization={
                    rejectFinalization
                }
                onWithdrawOrder={
                    withdrawOrder
                }
                onRequestCancellation={
                    requestCancellation
                }
                onApproveCancellation={
                    approveCancellation
                }
                onDeclineCancellation={
                    declineCancellation
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
    wallet,
    isMainnet,
    completionSignature,
    loadingCompletionSignature,
    processing,
    onAccept,
    onProposeCompletion,
    onRetrieveDeposit,
    onRejectFinalization,
    onWithdrawOrder,
    onRequestCancellation,
    onApproveCancellation,
    onDeclineCancellation,
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
    const [showCancellationForm, setShowCancellationForm] = useState(false);
    const [cancellationReason, setCancellationReason] = useState("Out of stock");
    const [customCancellationReason, setCustomCancellationReason] = useState("");
    const [showMutualCancellationForm, setShowMutualCancellationForm] = useState(false);
    const [mutualCancellationReason, setMutualCancellationReason] =
        useState(
            role === "buyer"
                ? "Changed my mind"
                : "Unable to fulfill the order"
        );
    const [customMutualCancellationReason, setCustomMutualCancellationReason] = useState("");



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

    const timeline = getEscrowTimeline(escrow);

    const sellerDepositedLamports =
        Number(
            escrow.depositedB
                ?.toString?.() ??
                escrow.depositedB ??
                0
        );

    const sellerHasDeposited =
        Number.isFinite(
            sellerDepositedLamports
        ) &&
        sellerDepositedLamports > 0;

    const sellerNeedsDeposit =
        escrow.status ===
            ESCROW_STATUS.CREATED &&
        !sellerHasDeposited;

    const canBuyerWithdraw =
        role === "buyer" &&
        escrow.status ===
            ESCROW_STATUS.CREATED &&
        !sellerHasDeposited;

    const canSellerRequestCancellation =
        role === "seller" &&
        escrow.status ===
            ESCROW_STATUS.CREATED &&
        !sellerHasDeposited;

    const sendSellerCancellationRequest = async () => {
        if (!canSellerRequestCancellation) {
            alert(
                "Cancellation cannot be requested after the seller has deposited."
            );
            return;
        }

        const selectedReason =
            cancellationReason === "Other"
                ? customCancellationReason.trim()
                : cancellationReason;

        if (!selectedReason) {
            alert("Enter a cancellation reason.");
            return;
        }

        const message =
            `Seller requested order cancellation.\n` +
            `Reason: ${selectedReason}\n\n` +
            `Buyer may withdraw the order to receive a full refund.`;

        try {
            const result = await sendOrderMessage({
                connection,
                wallet,
                escrowAddress: escrow.publicKey,
                message,
            });

            alert(
                `Cancellation request sent.\n\nTransaction: ${result.signature}`
            );

            setShowCancellationForm(false);
            setCustomCancellationReason("");
        } catch (error) {
            console.error(
                "Cancellation request failed:",
                error
            );

            alert(
                error?.message ||
                "Failed to send cancellation request."
            );
        }
    };

    const mutualCancellationPending =
        isMutualCancellationProposal(
            escrow
        );

    const currentWalletAddress =
        wallet.publicKey?.toBase58?.() ??
        "";

    const cancellationRequester =
        addressToString(
            escrow.finalizationProposer
        );

    const currentUserRequestedCancellation =
        mutualCancellationPending &&
        currentWalletAddress ===
            cancellationRequester;

    const canRequestMutualCancellation =
        (role === "buyer" ||
            role === "seller") &&
        !mutualCancellationPending &&
        sellerHasDeposited &&
        escrow.status ===
            ESCROW_STATUS.DEPOSITS_COMPLETE;

    const canRespondToMutualCancellation =
        mutualCancellationPending &&
        !currentUserRequestedCancellation &&
        (
            currentWalletAddress ===
                getBuyerAddress(escrow) ||
            currentWalletAddress ===
                getSellerAddress(escrow)
        );

    const pendingCancellationReason =
        getMutualCancellationReason(
            escrow
        );

    const submitMutualCancellationRequest =
        async () => {
            const selectedReason =
                mutualCancellationReason ===
                    "Other"
                    ? customMutualCancellationReason
                        .trim()
                    : mutualCancellationReason;

            if (!selectedReason) {
                alert(
                    "Enter a cancellation reason."
                );
                return;
            }

            const success =
                await onRequestCancellation(
                    selectedReason
                );

            if (success) {
                setShowMutualCancellationForm(
                    false
                );
                setCustomMutualCancellationReason(
                    ""
                );
            }
        };

    const isCancellationCompleted =
        escrow.status ===
            ESCROW_STATUS.COMPLETED &&
        String(
            escrow.finalizationNote ?? ""
        ).startsWith(
            MUTUAL_CANCELLATION_PREFIX
        );
    
    const sellerDisplayName =
        merchant?.storeName ||
        shortenAddress(getSellerAddress(escrow));


    const buyerRefundLamports = calculateBuyerRefund(escrow);

    /**
     * Escrow status / next action
     */
    const getActionStatus = () => {
        if (isCancellationCompleted) {
            return {
                type: "success",
                eyebrow: "Order finished",
                title: "Order cancelled",
                message: "The cancellation was completed and both parties were refunded.",
            };
        }

        if (mutualCancellationPending) {
            if (currentUserRequestedCancellation) {
                return {
                    type: "warning",
                    eyebrow: "Waiting for the other party",
                    title: "Cancellation request pending",
                    message: "Your cancellation request is awaiting a response.",
                };
            }

            if (canRespondToMutualCancellation) {
                return {
                    type: "attention",
                    eyebrow: "Action required",
                    title: "Cancellation approval required",
                    message: "Review the cancellation request below.",
                };
            }
        }

        if (escrow.status === ESCROW_STATUS.CREATED) {
            if (role === "seller") {
                return {
                    type: "attention",
                    eyebrow: "Action required",
                    title: "Accept this order",
                    message: "Accept the order before fulfilling it.",
                };
            }

            return {
                type: "waiting",
                eyebrow: "Waiting for seller",
                title: "Order submitted",
                message: "Your funds are secured in escrow while the seller reviews the order.",
            };
        }

        if (escrow.status === ESCROW_STATUS.DEPOSITS_COMPLETE) {
            if (role === "seller") {
                return {
                    type: "attention",
                    eyebrow: "Action required",
                    title: "Fulfill the order",
                    message: "Both deposits are secured. Fulfill the order and mark it ready when complete.",
                };
            }

            return {
                type: "waiting",
                eyebrow: "Waiting for seller",
                title: "Seller accepted the order",
                message: "Both deposits are secured while the seller fulfills the order.",
            };
        }

        if (escrow.status === ESCROW_STATUS.FINALIZATION_SUGGESTED) {
            if (role === "buyer") {
                return {
                    type: "attention",
                    eyebrow: "Action required",
                    title: "Confirm your order",
                    message: "The seller marked the order ready for your confirmation.",
                };
            }

            return {
                type: "waiting",
                eyebrow: "Waiting for buyer",
                title: "Order marked ready",
                message: "The buyer must confirm receipt before escrow is released.",
            };
        }

        if (escrow.status === ESCROW_STATUS.COMPLETED) {
            return {
                type: "success",
                eyebrow: "Order finished",
                title: "Order completed",
                message:
                    role === "buyer"
                        ? "Your deposit was returned and payment was released to the seller."
                        : "The buyer confirmed receipt and payment was released.",
            };
        }

        return {
            type: "waiting",
            eyebrow: "Order status",
            title: getEscrowStatusLabel(escrow.status),
            message: "",
        };
    };

    const actionStatus = getActionStatus();

    const hasActiveEscrowAction = sellerNeedsDeposit ||
        canSellerRequestCancellation ||
        (
            role === "seller" &&
            escrow.status === ESCROW_STATUS.DEPOSITS_COMPLETE
        ) ||
        (
            role === "buyer" &&
            escrow.status === ESCROW_STATUS.FINALIZATION_SUGGESTED
        ) ||
        canRequestMutualCancellation ||
        mutualCancellationPending ||
        canBuyerWithdraw;

    return (
        <article className="order-detail-card">

            <div className="order-detail-main">
                <div className="order-detail-media">
                    {Array.isArray(product?.imageUris) && product.imageUris.length > 0 ? (
                        <>
                            <img
                                src={product.imageUris[0]}
                                alt={product.title}
                                className="order-detail-image"
                            />

                            {product.imageUris.length > 1 && (
                                <div className="order-detail-thumbnails">
                                    {product.imageUris.map((imageUri, index) => (
                                        <img
                                            key={`${imageUri}-${index}`}
                                            src={imageUri}
                                            alt={`${product.title} ${index + 1}`}
                                            className="order-detail-thumbnail"
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="order-detail-no-image">
                            No Image
                        </div>
                    )}
                </div>

                <div className="order-detail-content">
                    <div className="order-detail-title-row">
                        <div>
                            <h3>{product?.title || "Product unavailable"}</h3>
                            <div className="order-detail-number">
                                <span>Order {shortenAddress(escrow.publicKey)}</span>
                                <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(escrow.publicKey)}
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                        <StatusBadge status={escrow.status} />
                    </div>

                    <div className={`order-next-action ${actionStatus.type}`}>
                        <div className="order-next-action-icon">
                            {actionStatus.type === "success"
                                ? "✓"
                                : actionStatus.type === "attention"
                                ? "!"
                                : actionStatus.type === "warning"
                                ? "!"
                                : "…"}
                        </div>

                        <div className="order-next-action-content">
                            <span className="order-next-action-eyebrow">
                                {actionStatus.eyebrow}
                            </span>

                            <h4>{actionStatus.title}</h4>

                            {actionStatus.message && (
                                <p>{actionStatus.message}</p>
                            )}
                        </div>
                    </div>
                    
                    <div className="order-section-heading">
                        <h4>Escrow Details</h4>
                    </div>
                    <div className="order-detail-stats">
                        <div className="order-detail-stat">
                            <span>Quantity:</span>
                            <strong>{escrow.order?.quantity || 1}</strong>
                        </div>
                        <div className="order-detail-stat">
                            <span>Product price:</span>
                            <strong>{lamportsToSol(escrow.referenceAmount)} SOL</strong>
                        </div>
                        <div className="order-detail-stat">
                            <span>Buyer total locked:</span>
                            <strong>{lamportsToSol(escrow.requiredDepositA)} SOL</strong>
                        </div>
                        <div className="order-detail-stat">
                            <span>Refundable buyer deposit:</span>
                            <strong>{lamportsToSol(buyerRefundLamports)} SOL</strong>
                        </div>
                        <div className="order-detail-stat">
                            <span>Seller refundable deposit:</span>
                            <strong>{lamportsToSol(escrow.requiredDepositB)} SOL</strong>
                        </div>
                    </div>
                    
                    <div className="order-section-heading">
                        <h4>Order Parties</h4>
                    </div>
                    <div className="order-detail-parties">
                        <div className="order-detail-party">
                            <span>Buyer:</span>
                            <strong title={getBuyerAddress(escrow)}>
                                {shortenAddress(getBuyerAddress(escrow))}
                            </strong>
                            {getBuyerAddress(escrow) && (
                                <code>{getBuyerAddress(escrow)}</code>
                            )}
                        </div>

                        <div className="order-detail-party">
                            <span>Seller:</span>
                            <strong>{sellerDisplayName}</strong>
                            {getSellerAddress(escrow) && (
                                <code>{getSellerAddress(escrow)}</code>
                            )}
                        </div>

                        {merchant?.shipsFrom && (
                            <div className="order-detail-party">
                                <span>Ships from:</span>
                                <strong>{merchant.shipsFrom}</strong>
                            </div>
                        )}
                    </div>

                    {(escrow.status === ESCROW_STATUS.COMPLETED || completionSignature) && (
                        <div className="transaction-section">
                            <h3>
                                {isCancellationCompleted
                                    ? "Cancellation Refund Transaction"
                                    : "Payment Release Transaction"}
                            </h3>

                            {completionSignature ? (
                                <>
                                    <p className="transaction-signature">
                                        <strong>Transaction ID:</strong> {completionSignature}
                                    </p>
                                    <a
                                        href={isMainnet ? `https://explorer.solana.com/tx/${completionSignature}` : `https://explorer.solana.com/tx/${completionSignature}?cluster=devnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View on Solana Explorer
                                    </a>
                                </>
                            ) : loadingCompletionSignature ? (
                                <p>Loading transaction...</p>
                            ) : (
                                <p>Transaction signature not found.</p>
                            )}
                        </div>
                    )}

                    <div className="order-escrow-actions">
                        {hasActiveEscrowAction && (
                            <div className="order-section-heading">
                                <h4>Escrow Action</h4>
                            </div>
                        )}
                        <div className="order-actions">
                            {role === "seller" && sellerNeedsDeposit && (
                                <button
                                    type="button"
                                    className="order-primary-button"
                                    onClick={onAccept}
                                    disabled={processing}
                                >
                                    {processing
                                        ? "Accepting..."
                                        : `Accept Order and Deposit ${lamportsToSol(escrow.requiredDepositB)} SOL`}
                                </button>
                            )}

                            {canSellerRequestCancellation && (
                                <div className="order-action-panel warning">
                                    <strong>Cannot fulfill this order?</strong>

                                    {!showCancellationForm ? (
                                        <>
                                            <p>
                                                Send a cancellation request directly to the buyer through the order chat.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => setShowCancellationForm(true)}
                                                disabled={processing}
                                            >
                                                Request Cancellation
                                            </button>
                                        </>
                                    ) : (
                                        <div className="order-action-form">
                                            <label>Cancellation reason</label>

                                            <select
                                                value={cancellationReason}
                                                onChange={event => setCancellationReason(event.target.value)}
                                                disabled={processing}
                                            >
                                                <option value="Out of stock">Out of stock</option>
                                                <option value="Unable to fulfill the order">
                                                    Unable to fulfill the order
                                                </option>
                                                <option value="Incorrect product information">
                                                    Incorrect product information
                                                </option>
                                                <option value="Shipping is unavailable">
                                                    Shipping is unavailable
                                                </option>
                                                <option value="Other">Other</option>
                                            </select>

                                            {cancellationReason === "Other" && (
                                                <textarea
                                                    value={customCancellationReason}
                                                    onChange={event => setCustomCancellationReason(event.target.value)}
                                                    maxLength={160}
                                                    rows={3}
                                                    placeholder="Enter the reason..."
                                                    disabled={processing}
                                                />
                                            )}

                                            <div className="order-action-buttons">
                                                <button
                                                    type="button"
                                                    onClick={sendSellerCancellationRequest}
                                                    disabled={processing}
                                                >
                                                    {processing ? "Sending..." : "Send Cancellation Request"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowCancellationForm(false);
                                                        setCustomCancellationReason("");
                                                    }}
                                                    disabled={processing}
                                                >
                                                    Back
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {role === "seller" &&
                                escrow.status === ESCROW_STATUS.DEPOSITS_COMPLETE && (
                                <>
                                    {!showCompletionOptions ? (
                                        <button
                                            type="button"
                                            className="order-primary-button"
                                            onClick={() => setShowCompletionOptions(true)}
                                            disabled={processing}
                                        >
                                            Mark Ready for Buyer Confirmation
                                        </button>
                                    ) : (
                                        <div className="order-action-panel">
                                            <strong>Optional website donation: {donationPercent}%</strong>

                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                step="1"
                                                value={donationPercent}
                                                onChange={event => setDonationPercent(Number(event.target.value))}
                                                disabled={processing}
                                            />

                                            <p>
                                                Donation amount:{" "}
                                                <strong>
                                                    {lamportsToSol(
                                                        Math.floor(
                                                            Number(escrow.referenceAmount) *
                                                            donationPercent /
                                                            100
                                                        )
                                                    )} SOL
                                                </strong>
                                            </p>

                                            <small>
                                                Deducted only from seller proceeds. Buyer refund is unchanged.
                                            </small>

                                            <div className="order-action-buttons">
                                                <button
                                                    type="button"
                                                    onClick={() => onProposeCompletion(donationPercent)}
                                                    disabled={processing}
                                                >
                                                    {processing
                                                        ? "Proposing..."
                                                        : donationPercent > 0
                                                        ? `Confirm Ready + Donate ${donationPercent}%`
                                                        : "Confirm Ready Without Donation"}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDonationPercent(0);
                                                        setShowCompletionOptions(false);
                                                    }}
                                                    disabled={processing}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {role === "buyer" &&
                                escrow.status === ESCROW_STATUS.FINALIZATION_SUGGESTED && (
                                <div className="order-action-group">
                                    <div className="order-action-panel info">
                                        <p>
                                            <strong>Deposit returned to you:</strong>{" "}
                                            {lamportsToSol(escrow.proposedPayoutA)} SOL
                                        </p>
                                        <p>
                                            <strong>Released to seller:</strong>{" "}
                                            {lamportsToSol(escrow.proposedPayoutB)} SOL
                                        </p>
                                        <small>
                                            Confirm only after receiving and checking the product.
                                        </small>
                                    </div>

                                    <div className="order-action-buttons">
                                        <button
                                            type="button"
                                            className="order-primary-button"
                                            onClick={onRetrieveDeposit}
                                            disabled={processing}
                                        >
                                            {processing
                                                ? "Processing..."
                                                : "Retrieve Deposit & Release Payment"}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={onRejectFinalization}
                                            disabled={processing}
                                        >
                                            {processing ? "Processing..." : "Reject Ready Status"}
                                        </button>
                                    </div>

                                    <p className="order-action-note">
                                        Reject the ready status first if you need to request mutual cancellation.
                                    </p>
                                </div>
                            )}

                            {canRequestMutualCancellation && (
                                <div className="order-action-panel warning">
                                    <strong>Need to cancel after acceptance?</strong>

                                    {!showMutualCancellationForm ? (
                                        <>
                                            <p>
                                                Either buyer or seller may request cancellation. The
                                                other party must approve, and each party receives its
                                                own deposited funds.
                                            </p>

                                            <button
                                                type="button"
                                                onClick={() => setShowMutualCancellationForm(true)}
                                                disabled={processing}
                                            >
                                                Request Mutual Cancellation
                                            </button>
                                        </>
                                    ) : (
                                        <div className="order-action-form">
                                            <label>Cancellation reason</label>

                                            <select
                                                value={mutualCancellationReason}
                                                onChange={event =>
                                                    setMutualCancellationReason(event.target.value)
                                                }
                                                disabled={processing}
                                            >
                                                {role === "buyer" && (
                                                    <>
                                                        <option value="Changed my mind">
                                                            Changed my mind
                                                        </option>
                                                        <option value="Ordered by mistake">
                                                            Ordered by mistake
                                                        </option>
                                                        <option value="Unable to complete the transaction">
                                                            Unable to complete the transaction
                                                        </option>
                                                    </>
                                                )}

                                                {role === "seller" && (
                                                    <>
                                                        <option value="Unable to fulfill the order">
                                                            Unable to fulfill the order
                                                        </option>
                                                        <option value="Out of stock">
                                                            Out of stock
                                                        </option>
                                                        <option value="Shipping is unavailable">
                                                            Shipping is unavailable
                                                        </option>
                                                    </>
                                                )}

                                                <option value="Other">Other</option>
                                            </select>

                                            {mutualCancellationReason === "Other" && (
                                                <textarea
                                                    value={customMutualCancellationReason}
                                                    onChange={event =>
                                                        setCustomMutualCancellationReason(
                                                            event.target.value
                                                        )
                                                    }
                                                    maxLength={120}
                                                    rows={3}
                                                    placeholder="Enter the reason..."
                                                    disabled={processing}
                                                />
                                            )}

                                            <div className="order-action-buttons">
                                                <button
                                                    type="button"
                                                    onClick={submitMutualCancellationRequest}
                                                    disabled={processing}
                                                >
                                                    {processing
                                                        ? "Submitting..."
                                                        : "Submit Cancellation Request"}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowMutualCancellationForm(false);
                                                        setCustomMutualCancellationReason("");
                                                    }}
                                                    disabled={processing}
                                                >
                                                    Back
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {mutualCancellationPending && (
                                <div className="order-action-panel cancellation">
                                    <strong>Mutual cancellation requested</strong>

                                    <p>
                                        Requested by{" "}
                                        {cancellationRequester === getBuyerAddress(escrow)
                                            ? "buyer"
                                            : "seller"}
                                        .
                                    </p>

                                    {pendingCancellationReason && (
                                        <p>
                                            <strong>Reason:</strong>{" "}
                                            {pendingCancellationReason}
                                        </p>
                                    )}

                                    <p>
                                        Buyer refund:{" "}
                                        <strong>
                                            {lamportsToSol(escrow.proposedPayoutA)} SOL
                                        </strong>
                                        <br />
                                        Seller refund:{" "}
                                        <strong>
                                            {lamportsToSol(escrow.proposedPayoutB)} SOL
                                        </strong>
                                    </p>

                                    {currentUserRequestedCancellation ? (
                                        <p className="order-action-note">
                                            Waiting for the other party to approve or decline.
                                        </p>
                                    ) : canRespondToMutualCancellation ? (
                                        <div className="order-action-buttons">
                                            <button
                                                type="button"
                                                className="order-primary-button"
                                                onClick={onApproveCancellation}
                                                disabled={processing}
                                            >
                                                {processing ? "Processing..." : "Approve Cancellation"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={onDeclineCancellation}
                                                disabled={processing}
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {canBuyerWithdraw && (
                                <div className="order-action-panel danger">
                                    <p>
                                        The seller has not accepted this order yet. You may withdraw
                                        and receive a full refund.
                                    </p>

                                    <button
                                        type="button"
                                        onClick={onWithdrawOrder}
                                        disabled={processing}
                                    >
                                        {processing
                                            ? "Withdrawing..."
                                            : `Withdraw Order & Refund ${lamportsToSol(
                                                escrow.depositedA
                                            )} SOL`}
                                    </button>
                                </div>
                            )}
                        </div>
                        {role === "buyer" && escrow.status === ESCROW_STATUS.COMPLETED && (
                            <div className="order-action-group">
                                {checkingReview ? (
                                    <p className="order-action-note">Checking review status...</p>
                                ) : reviewExists ? (
                                    <div className="order-action-panel success">
                                        Review already submitted.
                                    </div>
                                ) : (
                                    <div className="order-action-panel">
                                        <h4>Review this product</h4>
                                        <p>
                                            Optional: You may leave a review before closing the order.
                                        </p>

                                        <div className="order-action-form">
                                            <label>Rating</label>
                                            <select
                                                value={rating}
                                                onChange={event => setRating(Number(event.target.value))}
                                                disabled={processing}
                                            >
                                                <option value={5}>5 - Excellent</option>
                                                <option value={4}>4 - Very Good</option>
                                                <option value={3}>3 - Good</option>
                                                <option value={2}>2 - Fair</option>
                                                <option value={1}>1 - Poor</option>
                                            </select>

                                            <label>Comment</label>
                                            <textarea
                                                value={reviewComment}
                                                onChange={event => setReviewComment(event.target.value)}
                                                maxLength={280}
                                                rows={4}
                                                placeholder="Share your experience with this product..."
                                                disabled={processing}
                                            />

                                            <small>{reviewComment.length}/280</small>

                                            <button
                                                type="button"
                                                disabled={processing}
                                                onClick={async () => {
                                                    const success = await onSubmitReview(
                                                        rating,
                                                        reviewComment
                                                    );

                                                    if (success) {
                                                        setReviewExists(true);
                                                    }
                                                }}
                                            >
                                                {processing ? "Submitting Review..." : "Submit Review"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="order-close-button"
                                    onClick={onCloseOrder}
                                    disabled={processing}
                                >
                                    {processing
                                        ? "Processing..."
                                        : "Close Order and Recover Rent"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="order-timeline">
                <h4>Order Timeline</h4>

                <div className="order-timeline-list">
                    {timeline.map((event, index) => (
                        <div
                            key={`${event.label}-${index}`}
                            className={`order-timeline-item${event.completed ? " completed" : ""}`}
                        >
                            <span className="order-timeline-marker">
                                {event.completed ? "✓" : ""}
                            </span>

                            <div>
                                <strong>{event.label}</strong>

                                {event.timestamp > 0 && (
                                    <span className="order-timeline-date">
                                        {formatTimestamp(event.timestamp)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div id="order-chat-section">
                <OrderChat escrow={escrow} />
            </div>
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