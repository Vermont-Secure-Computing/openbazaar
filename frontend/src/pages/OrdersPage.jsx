import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import {
    ESCROW_STATUS,
    getBuyerEscrows,
    getSellerEscrows,
    getEscrowStatusLabel,
} from "../lib/escrow";

import { getProduct } from "../lib/product";
import { getMerchants } from "../lib/merchant";

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

export default function OrdersPage() {
    const { connection } = useConnection();
    const wallet = useWallet();
    const navigate = useNavigate();

    const [buyerOrders, setBuyerOrders] = useState([]);
    const [sellerOrders, setSellerOrders] = useState([]);
    const [loading, setLoading] = useState(true);
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

                const sellerAddress =
                    getSellerAddress(escrow);

                const sellerMerchant = merchants.find(
                    (merchant) =>
                        addressToString(
                            merchant.authority
                        ) === sellerAddress
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
    }, [wallet.publicKey, connection]);

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

                <button
                    type="button"
                    onClick={loadOrders}
                    disabled={loading}
                >
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
                <OrderList
                    orders={buyerOrders}
                    role="buyer"
                    emptyMessage="No purchase orders yet."
                    onSelect={(escrow) =>
                        navigate(
                            `/orders/buyer/${addressToString(
                                escrow.publicKey
                            )}`
                        )
                    }
                />
            </section>

            <section style={{ marginTop: 48 }}>
                <h2>Seller Orders</h2>
                <OrderList
                    orders={sellerOrders}
                    role="seller"
                    emptyMessage="No seller orders yet."
                    onSelect={(escrow) =>
                        navigate(
                            `/orders/seller/${addressToString(
                                escrow.publicKey
                            )}`
                        )
                    }
                />
            </section>
        </main>
    );
}

function OrderList({
    orders,
    role,
    emptyMessage,
    onSelect,
}) {
    if (orders.length === 0) {
        return <p>{emptyMessage}</p>;
    }

    return (
        <div
            style={{
                display: "grid",
                gap: 12,
                marginTop: 16,
            }}
        >
            {orders.map((escrow) => {
                const product = escrow.product;
                const merchant = escrow.sellerMerchant;
                const escrowKey =
                    addressToString(escrow.publicKey);

                return (
                    <button
                        key={escrowKey}
                        type="button"
                        onClick={() => onSelect(escrow)}
                        style={{
                            width: "100%",
                            display: "grid",
                            gridTemplateColumns:
                                "72px minmax(0, 1fr) auto",
                            gap: 14,
                            alignItems: "center",
                            textAlign: "left",
                            padding: 14,
                            border: "1px solid #ddd",
                            borderRadius: 14,
                            background: "#fff",
                            cursor: "pointer",
                        }}
                    >
                        {product?.imageUri ? (
                            <img
                                src={product.imageUri}
                                alt={
                                    product.title ||
                                    "Product"
                                }
                                style={{
                                    width: 72,
                                    height: 72,
                                    objectFit: "cover",
                                    borderRadius: 10,
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    width: 72,
                                    height: 72,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border:
                                        "1px solid #ddd",
                                    borderRadius: 10,
                                    fontSize: 12,
                                    color: "#666",
                                }}
                            >
                                No Image
                            </div>
                        )}

                        <div style={{ minWidth: 0 }}>
                            <strong
                                style={{
                                    display: "block",
                                    fontSize: 16,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow:
                                        "ellipsis",
                                }}
                            >
                                {product?.title ||
                                    "Product unavailable"}
                            </strong>

                            <div
                                style={{
                                    marginTop: 5,
                                    color: "#555",
                                    fontSize: 14,
                                }}
                            >
                                {role === "buyer"
                                    ? merchant?.storeName ||
                                      `Seller ${shortenAddress(
                                          getSellerAddress(
                                              escrow
                                          )
                                      )}`
                                    : `Buyer ${shortenAddress(
                                          getBuyerAddress(
                                              escrow
                                          )
                                      )}`}
                            </div>

                            <div
                                style={{
                                    marginTop: 5,
                                    display: "flex",
                                    gap: 12,
                                    flexWrap: "wrap",
                                    color: "#666",
                                    fontSize: 13,
                                }}
                            >
                                <span>
                                    Qty:{" "}
                                    {escrow.order
                                        ?.quantity || 1}
                                </span>
                                <span>
                                    {lamportsToSol(
                                        escrow.referenceAmount
                                    )}{" "}
                                    SOL
                                </span>
                                <span>
                                    Order{" "}
                                    {shortenAddress(
                                        escrow.publicKey
                                    )}
                                </span>
                            </div>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                justifyItems: "end",
                                gap: 8,
                            }}
                        >
                            <StatusBadge
                                status={escrow.status}
                            />
                            <span
                                style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: "#2563eb",
                                }}
                            >
                                View Details →
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function StatusBadge({ status }) {
    const label = getEscrowStatusLabel(status);
    let background = "#e5e7eb";
    let color = "#111827";

    if (status === ESCROW_STATUS.CREATED) {
        background = "#fef3c7";
        color = "#92400e";
    } else if (
        status === ESCROW_STATUS.DEPOSITS_COMPLETE
    ) {
        background = "#dbeafe";
        color = "#1e40af";
    } else if (
        status ===
        ESCROW_STATUS.FINALIZATION_SUGGESTED
    ) {
        background = "#ede9fe";
        color = "#5b21b6";
    } else if (
        status === ESCROW_STATUS.COMPLETED
    ) {
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