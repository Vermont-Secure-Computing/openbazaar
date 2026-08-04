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

import "./OrdersPage.css";

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

        return value === "[object Object]"
            ? ""
            : value;
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

    const enrichOrders = async (
        escrows,
        merchants
    ) => {
        return Promise.all(
            escrows.map(async escrow => {
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

                const sellerMerchant =
                    merchants.find(
                        merchant =>
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
            <main className="orders-page">
                <header className="orders-header">
                    <h1>Orders</h1>
                </header>

                <div className="orders-state">
                    <p>
                        Connect your wallet to view your
                        purchases and seller orders.
                    </p>
                </div>
            </main>
        );
    }

    if (loading) {
        return (
            <main className="orders-page">
                <header className="orders-header">
                    <h1>Orders</h1>
                </header>

                <div className="orders-state">
                    <p>Loading orders...</p>
                </div>
            </main>
        );
    }

    return (
        <main className="orders-page">
            <header className="orders-header">
                <div>
                    <h1>Orders</h1>

                    <p>
                        Manage your purchases and seller
                        transactions.
                    </p>
                </div>

                <button
                    type="button"
                    className="orders-refresh-button"
                    onClick={loadOrders}
                    disabled={loading}
                >
                    Refresh Orders
                </button>
            </header>

            {error && (
                <div className="orders-error">
                    {error}
                </div>
            )}

            <section className="orders-section">
                <h2>My Purchases</h2>

                <OrderList
                    orders={buyerOrders}
                    role="buyer"
                    emptyMessage="No purchase orders yet."
                    onSelect={escrow =>
                        navigate(
                            `/orders/buyer/${addressToString(
                                escrow.publicKey
                            )}`
                        )
                    }
                />
            </section>

            <section className="orders-section">
                <h2>Seller Orders</h2>

                <OrderList
                    orders={sellerOrders}
                    role="seller"
                    emptyMessage="No seller orders yet."
                    onSelect={escrow =>
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
        return (
            <div className="orders-empty">
                <p>{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="orders-list">
            {orders.map(escrow => {
                const product = escrow.product;
                const merchant =
                    escrow.sellerMerchant;
                const escrowKey =
                    addressToString(
                        escrow.publicKey
                    );

                return (
                    <button
                        key={escrowKey}
                        type="button"
                        className="order-list-card"
                        onClick={() =>
                            onSelect(escrow)
                        }
                    >
                        <div className="order-list-image-wrap">
                            {product?.imageUri ? (
                                <img
                                    src={
                                        product.imageUri
                                    }
                                    alt={
                                        product.title ||
                                        "Product"
                                    }
                                    className="order-list-image"
                                />
                            ) : (
                                <div className="order-list-no-image">
                                    No Image
                                </div>
                            )}
                        </div>

                        <div className="order-list-content">
                            <strong className="order-list-title">
                                {product?.title ||
                                    "Product unavailable"}
                            </strong>

                            <div className="order-list-party">
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

                            <div className="order-list-meta">
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

                        <div className="order-list-action">
                            <StatusBadge
                                status={escrow.status}
                            />

                            <span className="order-list-view">
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
    const label =
        getEscrowStatusLabel(status);

    let statusClass = "default";

    if (
        status ===
        ESCROW_STATUS.CREATED
    ) {
        statusClass = "created";
    } else if (
        status ===
        ESCROW_STATUS.DEPOSITS_COMPLETE
    ) {
        statusClass = "deposits-complete";
    } else if (
        status ===
        ESCROW_STATUS.FINALIZATION_SUGGESTED
    ) {
        statusClass = "finalization";
    } else if (
        status ===
        ESCROW_STATUS.COMPLETED
    ) {
        statusClass = "completed";
    }

    return (
        <span
            className={`order-status-badge ${statusClass}`}
        >
            {label}
        </span>
    );
}