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
    suggestReleaseToSeller,
    acceptEscrowRelease,
    closeCompletedEscrow,
} from "../lib/escrow";

import { getProduct } from "../lib/product";
import { getMerchants } from "../lib/merchant";

function lamportsToSol(value) {
    const lamports = Number(value);

    if (!Number.isFinite(lamports)) {
        return "0";
    }

    return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

function shortenAddress(address) {
    if (!address) {
        return "";
    }

    return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function formatTimestamp(timestamp) {
    if (!timestamp || Number(timestamp) <= 0) {
        return "";
    }

    return new Date(
        Number(timestamp) * 1000
    ).toLocaleString();
}

export default function OrdersPage() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [buyerOrders, setBuyerOrders] = useState([]);
    const [sellerOrders, setSellerOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingEscrow, setProcessingEscrow] =
        useState("");
    const [error, setError] = useState("");

    const enrichOrders = async (escrows, merchants) => {
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

                const sellerMerchant = merchants.find(
                    (merchant) =>
                        merchant.authority === escrow.partyB
                );

                return {
                    ...escrow,
                    product,
                    sellerMerchant: sellerMerchant || null,
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

            const [buyerEscrows, sellerEscrows, merchants] =
                await Promise.all([
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

            const [enrichedBuyer, enrichedSeller] =
                await Promise.all([
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
    }, [wallet.publicKey]);

    const runEscrowAction = async (
        escrow,
        action,
        successMessage
    ) => {
        try {
            setProcessingEscrow(escrow.publicKey);

            const signature = await action();

            alert(
                `${successMessage}\nTransaction: ${signature}`
            );

            await loadOrders();
        } catch (actionError) {
            console.error(
                "Escrow action error:",
                actionError
            );

            alert(
                actionError?.message ||
                    "Transaction failed."
            );
        } finally {
            setProcessingEscrow("");
        }
    };

    const acceptOrder = async (escrow) => {
        await runEscrowAction(
            escrow,
            () =>
                sellerAcceptEscrow({
                    connection,
                    wallet,
                    escrow,
                }),
            "Order accepted"
        );
    };

    const confirmReceived = async (escrow) => {
        await runEscrowAction(
            escrow,
            () =>
                suggestReleaseToSeller({
                    connection,
                    wallet,
                    escrow,
                }),
            "Product receipt confirmed"
        );
    };

    const acceptRelease = async (escrow) => {
        await runEscrowAction(
            escrow,
            () =>
                acceptEscrowRelease({
                    connection,
                    wallet,
                    escrow,
                }),
            "Funds released"
        );
    };

    const closeOrder = async (escrow) => {
        const confirmed = window.confirm(
            "Close this completed order and recover the escrow rent? The order will disappear from the current on-chain order list."
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
            "Order closed and rent recovered"
        );
    };

    if (!wallet.publicKey) {
        return (
            <main style={{ padding: 24 }}>
                <h1>Orders</h1>
                <p>
                    Connect your wallet to view your
                    purchases and seller orders.
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
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <h1>Orders</h1>
                    <p>
                        Manage your purchases and seller
                        transactions.
                    </p>
                </div>

                <button onClick={loadOrders}>
                    Refresh Orders
                </button>
            </div>

            {error && (
                <p style={{ color: "#dc2626" }}>
                    {error}
                </p>
            )}

            <section style={{ marginTop: 32 }}>
                <h2>My Purchases</h2>

                {buyerOrders.length === 0 ? (
                    <p>No purchase orders yet.</p>
                ) : (
                    buyerOrders.map((escrow) => (
                        <OrderCard
                            key={escrow.publicKey}
                            escrow={escrow}
                            role="buyer"
                            processing={
                                processingEscrow ===
                                escrow.publicKey
                            }
                            onConfirmReceived={() =>
                                confirmReceived(escrow)
                            }
                            onCloseOrder={() =>
                                closeOrder(escrow)
                            }
                        />
                    ))
                )}
            </section>

            <section style={{ marginTop: 48 }}>
                <h2>Seller Orders</h2>

                {sellerOrders.length === 0 ? (
                    <p>No seller orders yet.</p>
                ) : (
                    sellerOrders.map((escrow) => (
                        <OrderCard
                            key={escrow.publicKey}
                            escrow={escrow}
                            role="seller"
                            processing={
                                processingEscrow ===
                                escrow.publicKey
                            }
                            onAccept={() =>
                                acceptOrder(escrow)
                            }
                            onAcceptRelease={() =>
                                acceptRelease(escrow)
                            }
                        />
                    ))
                )}
            </section>
        </main>
    );
}

function OrderCard({
    escrow,
    role,
    processing,
    onAccept,
    onConfirmReceived,
    onAcceptRelease,
    onCloseOrder,
}) {
    const product = escrow.product;
    const merchant = escrow.sellerMerchant;
    const timeline = getEscrowTimeline(escrow);

    const sellerNeedsDeposit =
        escrow.status === ESCROW_STATUS.CREATED &&
        Number(escrow.depositedB) === 0;

    const sellerDisplayName = merchant
        ? merchant.storeName
        : shortenAddress(escrow.partyB);

    return (
        <article
            style={{
                border: "1px solid #ddd",
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
                            src={product.imageUri}
                            alt={product.title}
                            style={{
                                width: "100%",
                                height: 150,
                                objectFit: "cover",
                                borderRadius: 12,
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: "100%",
                                height: 150,
                                borderRadius: 12,
                                border:
                                    "1px solid #ddd",
                                display: "flex",
                                alignItems: "center",
                                justifyContent:
                                    "center",
                            }}
                        >
                            No Image
                        </div>
                    )}
                </div>

                <div style={{ flex: 1, minWidth: 260 }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent:
                                "space-between",
                            gap: 16,
                            flexWrap: "wrap",
                        }}
                    >
                        <div>
                            <h3 style={{ marginTop: 0 }}>
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
                            status={escrow.status}
                        />
                    </div>

                    <p>
                        <strong>Quantity:</strong>{" "}
                        {escrow.order?.quantity || 1}
                    </p>

                    <p>
                        <strong>Total:</strong>{" "}
                        {lamportsToSol(
                            escrow.requiredDepositA
                        )}{" "}
                        SOL
                    </p>

                    <p>
                        <strong>
                            Seller escrow deposit:
                        </strong>{" "}
                        {lamportsToSol(
                            escrow.requiredDepositB
                        )}{" "}
                        SOL
                    </p>

                    <p>
                        <strong>Buyer:</strong>{" "}
                        {shortenAddress(escrow.partyA)}
                    </p>

                    <p>
                        <strong>Seller:</strong>{" "}
                        {sellerDisplayName}
                    </p>

                    {merchant?.shipsFrom && (
                        <p>
                            <strong>Ships from:</strong>{" "}
                            {merchant.shipsFrom}
                        </p>
                    )}

                    <div style={{ marginTop: 20 }}>
                        {role === "seller" &&
                            sellerNeedsDeposit && (
                                <button
                                    onClick={onAccept}
                                    disabled={processing}
                                >
                                    {processing
                                        ? "Accepting..."
                                        : `Accept Order and Deposit ${lamportsToSol(
                                              escrow.requiredDepositB
                                          )} SOL`}
                                </button>
                            )}

                        {role === "buyer" &&
                            escrow.status ===
                                ESCROW_STATUS.DEPOSITS_COMPLETE && (
                                <button
                                    onClick={
                                        onConfirmReceived
                                    }
                                    disabled={processing}
                                >
                                    {processing
                                        ? "Confirming..."
                                        : "Confirm Product Received"}
                                </button>
                            )}

                        {role === "seller" &&
                            escrow.status ===
                                ESCROW_STATUS.FINALIZATION_SUGGESTED && (
                                <button
                                    onClick={
                                        onAcceptRelease
                                    }
                                    disabled={processing}
                                >
                                    {processing
                                        ? "Releasing..."
                                        : "Accept Release"}
                                </button>
                            )}

                        {role === "buyer" &&
                            escrow.status ===
                                ESCROW_STATUS.COMPLETED && (
                                <button
                                    onClick={onCloseOrder}
                                    disabled={processing}
                                >
                                    {processing
                                        ? "Closing..."
                                        : "Close Order and Recover Rent"}
                                </button>
                            )}
                    </div>
                </div>
            </div>

            <div
                style={{
                    marginTop: 24,
                    borderTop: "1px solid #eee",
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
                    {timeline.map((event, index) => (
                        <div
                            key={`${event.label}-${index}`}
                            style={{
                                display: "flex",
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
                                    {event.label}
                                </strong>

                                {event.timestamp > 0 && (
                                    <div
                                        style={{
                                            fontSize: 13,
                                            color: "#666",
                                            marginTop: 2,
                                        }}
                                    >
                                        {formatTimestamp(
                                            event.timestamp
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </article>
    );
}

function StatusBadge({ status }) {
    const label = getEscrowStatusLabel(status);

    let background = "#e5e7eb";
    let color = "#111827";

    if (status === ESCROW_STATUS.CREATED) {
        background = "#fef3c7";
        color = "#92400e";
    }

    if (
        status === ESCROW_STATUS.DEPOSITS_COMPLETE
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

    if (status === ESCROW_STATUS.COMPLETED) {
        background = "#dcfce7";
        color = "#166534";
    }

    return (
        <span
            style={{
                display: "inline-block",
                padding: "6px 10px",
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
