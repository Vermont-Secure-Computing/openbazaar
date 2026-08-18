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
                <h2>
                    My Purchases
                    <span className="orders-section-count">
                        {buyerOrders.length}
                    </span>
                </h2>

                <OrderList
                    orders={buyerOrders}
                    role="buyer"
                    emptyMessage="No purchase orders yet."
                    emptyMessageSub="Orders will appear here after you buy a product."
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
                <h2>
                    Seller Orders
                    <span className="orders-section-count">
                        {sellerOrders.length}
                    </span>
                </h2>

                <OrderList
                    orders={sellerOrders}
                    role="seller"
                    emptyMessage="No seller orders yet."
                    emptyMessageSub="New customer orders will appear here."
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
    emptyMessageSub,
    onSelect,
}) {
    const [filter, setFilter] = useState("all");
    const [sort, setSort] = useState("highest-price");


    if (orders.length === 0) {
        return (
            <div className="orders-empty">
                <p>{emptyMessage}</p>
                <p>{emptyMessageSub}</p>
            </div>
        );
    }

    const requiresAction = escrow => {
        return (
            (
                role === "seller" &&
                escrow.status === ESCROW_STATUS.CREATED &&
                Number(escrow.depositedA) > 0 &&
                Number(escrow.depositedB) === 0
            ) ||
            (
                role === "buyer" &&
                escrow.status === ESCROW_STATUS.FINALIZATION_SUGGESTED
            )
        );
    };

    const actionCount = orders.filter(
        requiresAction
    ).length;

    const filteredOrders = orders.filter(escrow => {
        if (filter === "needs-action") {
            return requiresAction(escrow);
        }

        if (filter === "active") {
            return escrow.status !== ESCROW_STATUS.COMPLETED;
        }

        if (filter === "completed") {
            return escrow.status === ESCROW_STATUS.COMPLETED;
        }

        return true;
    });

    const getOrderValue = escrow => {
        const value = escrow.referenceAmount;

        if (value == null) {
            return 0n;
        }

        try {
            return BigInt(value.toString());
        } catch {
            return 0n;
        }
    };

    const getActionPriority = escrow => {
        if (requiresAction(escrow)) return 3;

        if (escrow.status === ESCROW_STATUS.COMPLETED) return 1;

        return 2;
    };

    const sortedOrders = [...filteredOrders].sort((a, b) => {
        if (sort === "action") {
            return ( getActionPriority(b) - getActionPriority(a));
        }

        if (sort === "highest-price") {
            const aPrice = getOrderValue(a);
            const bPrice = getOrderValue(b);

            if (aPrice === bPrice) return 0;

            return aPrice > bPrice ? -1 : 1;
        }

        if (sort === "lowest-price") {
            const aPrice = getOrderValue(a);
            const bPrice = getOrderValue(b);

            if (aPrice === bPrice) return 0;

            return aPrice < bPrice ? -1 : 1;
        }

        return 0;
    });

    return (
        <>
        <div className="orders-controls">
            <div className="orders-control">
                <label htmlFor={`order-filter-${role}`}>Filter</label>

                <select
                    id={`order-filter-${role}`}
                    value={filter}
                    onChange={event =>
                        setFilter(event.target.value)
                    }
                >
                    <option value="all">All Orders</option>
                    <option value="needs-action">Needs Action {actionCount > 0 ? ` (${actionCount})` : ""}</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                </select>
            </div>

            <div className="orders-control">
                <label htmlFor={`order-sort-${role}`}>Sort</label>

                <select
                    id={`order-sort-${role}`}
                    value={sort}
                    onChange={event =>
                        setSort(event.target.value)
                    }
                >
                    <option value="highest-price">Highest Price</option>
                    <option value="lowest-price">Lowest Price</option>
                    <option value="action">Action Needed</option>
                </select>
            </div>
        </div>

        {sortedOrders.length === 0 ? (
            <div className="orders-filter-empty">
                <strong>No matching orders</strong>
                <p>Try selecting a different filter.</p>

                <button
                    type="button"
                    onClick={() => {
                        setFilter("all");
                        setSort("highest-price");
                    }}
                >
                    Clear Filters
                </button>
            </div>
        ) : (
            <div className="orders-list">
                {sortedOrders.map(escrow => {
                    const product = escrow.product;
                    const merchant = escrow.sellerMerchant;
                    const escrowKey = addressToString(escrow.publicKey);

                    const actionRequired = requiresAction(escrow);

                    const productImage = Array.isArray(product?.imageUris) &&
                        product.imageUris.length > 0 ? product.imageUris[0] : product?.imageUri || "";
                    

                    return (
                        <button
                            key={escrowKey}
                            type="button"
                            className={`order-list-card${actionRequired ? " requires-action" : ""}`}
                            onClick={() =>
                                onSelect(escrow)
                            }
                        >
                            <div className="order-list-image-wrap">
                                {productImage ? (
                                    <img
                                        src={productImage}
                                        alt={product.title || "Product"}
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
                                {actionRequired && (
                                    <div className="order-list-attention">
                                        {role === "seller"
                                            ? "Accept order and provide your deposit"
                                            : "Review and confirm the seller's completion"}
                                    </div>
                                )}

                                <div className="order-list-meta">
                                    <span>
                                        {escrow.order?.quantity || 1}{" "}
                                        {(escrow.order?.quantity || 1) === 1 ? "item" : "items"}
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
                                    role={role}
                                    escrow={escrow}
                                />

                                <span className="order-list-view" aria-hidden="true">
                                    →
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        )}
        
        </>
    );
}

function StatusBadge({ status, role, escrow }) {
    let label = getEscrowStatusLabel(status);
    let statusClass = "default";

    if (
        role === "seller" &&
        status === ESCROW_STATUS.CREATED &&
        Number(escrow.depositedA) > 0 &&
        Number(escrow.depositedB) === 0
    ) {
        label = "New Order";
        statusClass = "action-required";
    } else if (
        role === "buyer" &&
        status === ESCROW_STATUS.FINALIZATION_SUGGESTED
    ) {
        label = "Action Required";
        statusClass = "action-required";
    } else if (status === ESCROW_STATUS.CREATED) {
        statusClass = "created";
    } else if (status === ESCROW_STATUS.DEPOSITS_COMPLETE) {
        statusClass = "deposits-complete";
    } else if (status === ESCROW_STATUS.FINALIZATION_SUGGESTED) {
        statusClass = "finalization";
    } else if (status === ESCROW_STATUS.COMPLETED) {
        statusClass = "completed";
    }

    return (
        <span className={`order-status-badge ${statusClass}`}>
            {label}
        </span>
    );
}