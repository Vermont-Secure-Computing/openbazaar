import { useEffect, useState } from "react";
import {
    useParams,
    Link,
} from "react-router-dom";
import {
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
    getMerchants,
} from "../lib/merchant";
import {
    getProductsByMerchant,
} from "../lib/product";
import SellerReputation from "../components/SellerReputation";

function addressToString(address) {
    if (!address) {
        return "";
    }

    if (typeof address === "string") {
        return address;
    }

    if (
        typeof address.toBase58 ===
        "function"
    ) {
        return address.toBase58();
    }

    return address.toString?.() || "";
}

export default function MerchantPage() {
    const { merchant } = useParams();

    const [store, setStore] =
        useState(null);

    const [products, setProducts] =
        useState([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState("");

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setError("");

                const merchants =
                    await getMerchants();

                const currentMerchant =
                    merchants.find(
                        (item) =>
                            addressToString(
                                item.authority
                            ) === merchant
                    );

                if (!currentMerchant) {
                    throw new Error(
                        "Merchant not found."
                    );
                }

                const merchantProducts =
                    await getProductsByMerchant(
                        merchant
                    );

                if (!cancelled) {
                    setStore(
                        currentMerchant
                    );

                    setProducts(
                        merchantProducts
                    );
                }
            } catch (loadError) {
                console.error(
                    "Merchant page load error:",
                    loadError
                );

                if (!cancelled) {
                    setError(
                        loadError?.message ||
                            "Failed to load merchant."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [merchant]);

    if (loading) {
        return (
            <div style={{ padding: 24 }}>
                <h2>
                    Loading merchant...
                </h2>
            </div>
        );
    }

    if (error || !store) {
        return (
            <div style={{ padding: 24 }}>
                <Link to="/">
                    ← Back
                </Link>

                <h2>
                    Merchant unavailable
                </h2>

                <p
                    style={{
                        color: "#dc2626",
                    }}
                >
                    {error ||
                        "Merchant not found."}
                </p>
            </div>
        );
    }

    return (
        <div
            style={{
                maxWidth: 1200,
                margin: "0 auto",
                padding: 24,
            }}
        >
            {store.bannerUri && (
                <img
                    src={store.bannerUri}
                    alt={`${store.storeName} banner`}
                    style={{
                        width: "100%",
                        maxHeight: 260,
                        objectFit: "cover",
                        borderRadius: 12,
                    }}
                />
            )}

            <div
                style={{
                    marginTop: 20,
                }}
            >
                {store.logoUri && (
                    <img
                        src={store.logoUri}
                        alt={store.storeName}
                        style={{
                            width: 120,
                            height: 120,
                            borderRadius:
                                "50%",
                            objectFit:
                                "cover",
                            border:
                                "1px solid #ddd",
                        }}
                    />
                )}

                <h1>
                    {store.storeName}
                </h1>

                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 16,
                        marginTop: 8,
                        marginBottom: 16,
                        color: "#555",
                        fontSize: 15,
                    }}
                >
                    <span>
                        📦{" "}
                        <strong>{store.totalSold ?? 0}</strong>{" "}
                        sold
                    </span>
                </div>

                <SellerReputation
                    merchantAuthority={store.authority}
                />

                {store.descriptionUri && (
                    <p
                        style={{
                            whiteSpace:
                                "pre-wrap",
                            lineHeight: 1.6,
                            maxWidth: 760,
                        }}
                    >
                        {
                            store.descriptionUri
                        }
                    </p>
                )}

                {store.shipsFrom && (
                    <p>
                        <strong>
                            Ships from:
                        </strong>{" "}
                        {store.shipsFrom}
                    </p>
                )}

                {store.preferredContact && (
                    <div
                        style={{
                            marginTop: 18,
                            padding: 16,
                            maxWidth: 600,
                            border:
                                "1px solid #ddd",
                            borderRadius: 12,
                            background:
                                "#f9fafb",
                        }}
                    >
                        <h3
                            style={{
                                marginTop: 0,
                                marginBottom: 8,
                            }}
                        >
                            Preferred Contact
                        </h3>

                        <p
                            style={{
                                margin: 0,
                                whiteSpace:
                                    "pre-wrap",
                                overflowWrap:
                                    "anywhere",
                                lineHeight: 1.6,
                            }}
                        >
                            {
                                store.preferredContact
                            }
                        </p>
                    </div>
                )}

                <hr
                    style={{
                        marginTop: 28,
                        marginBottom: 28,
                    }}
                />

                <h2>Products</h2>

                {products.length === 0 && (
                    <p>
                        No products yet.
                    </p>
                )}

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fill, minmax(250px, 1fr))",
                        gap: 20,
                    }}
                >
                    {products.map(
                        (product) => (
                            <Link
                                key={addressToString(
                                    product.publicKey
                                )}
                                to={`/product/${addressToString(
                                    product.publicKey
                                )}`}
                                style={{
                                    textDecoration:
                                        "none",
                                    color:
                                        "inherit",
                                }}
                            >
                                <div
                                    style={{
                                        height:
                                            "100%",
                                        border:
                                            "1px solid #ddd",
                                        borderRadius:
                                            12,
                                        overflow:
                                            "hidden",
                                        background:
                                            "#fff",
                                    }}
                                >
                                    {product.imageUri && (
                                        <img
                                            src={
                                                product.imageUri
                                            }
                                            alt={
                                                product.title
                                            }
                                            style={{
                                                width:
                                                    "100%",
                                                height:
                                                    180,
                                                objectFit:
                                                    "cover",
                                            }}
                                        />
                                    )}

                                    <div
                                        style={{
                                            padding:
                                                16,
                                        }}
                                    >
                                        <h3
                                            style={{
                                                marginTop:
                                                    0,
                                            }}
                                        >
                                            {
                                                product.title
                                            }
                                        </h3>

                                        <p>
                                            {
                                                product.category
                                            }
                                        </p>

                                        <strong>
                                            {(
                                                Number(
                                                    product.price
                                                ) /
                                                LAMPORTS_PER_SOL
                                            ).toFixed(
                                                3
                                            )}{" "}
                                            SOL
                                        </strong>

                                        <br />

                                        <div
                                            style={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: 12,
                                                marginTop: 10,
                                                marginBottom: 8,
                                                fontSize: 13,
                                                color: "#555",
                                            }}
                                        >
                                            <span>
                                                ⭐{" "}
                                                <strong>
                                                    {Number(
                                                        product.averageRating || 0
                                                    ).toFixed(1)}
                                                </strong>
                                            </span>

                                            <span>
                                                <strong>
                                                    {product.totalReviews || 0}
                                                </strong>{" "}
                                                Review
                                                {product.totalReviews === 1
                                                    ? ""
                                                    : "s"}
                                            </span>

                                            <span>
                                                <strong>
                                                    {product.sold || 0}
                                                </strong>{" "}
                                                Sold
                                            </span>
                                        </div>

                                        <small>
                                            Available:{" "}
                                            {
                                                product.stock
                                            }
                                        </small>
                                    </div>
                                </div>
                            </Link>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

