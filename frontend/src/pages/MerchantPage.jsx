import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getMerchants } from "../lib/merchant";
import { getProductsByMerchant } from "../lib/product";
import SellerReputation from "../components/SellerReputation";
import "./MerchantPage.css";

function addressToString(address) {
    if (!address) return "";
    if (typeof address === "string") return address;
    if (typeof address.toBase58 === "function") return address.toBase58();
    return address.toString?.() || "";
}

export default function MerchantPage() {
    const { merchant } = useParams();
    const [store, setStore] = useState(null);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setError("");

                const merchants = await getMerchants();
                const currentMerchant = merchants.find(
                    item => addressToString(item.authority) === merchant
                );

                if (!currentMerchant) throw new Error("Merchant not found.");

                const merchantProducts = await getProductsByMerchant(merchant);

                if (!cancelled) {
                    setStore(currentMerchant);
                    setProducts(merchantProducts);
                }
            } catch (loadError) {
                console.error("Merchant page load error:", loadError);

                if (!cancelled) {
                    setError(loadError?.message || "Failed to load merchant.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [merchant]);

    if (loading) {
        return (
            <main className="merchant-page">
                <div className="merchant-page-state">
                    <h2>Loading merchant...</h2>
                </div>
            </main>
        );
    }

    if (error || !store) {
        return (
            <main className="merchant-page">
                <Link to="/" className="merchant-page-back">← Back</Link>

                <div className="merchant-page-state merchant-page-error">
                    <h2>Merchant unavailable</h2>
                    <p>{error || "Merchant not found."}</p>
                </div>
            </main>
        );
    }

    return (
        <main className="merchant-page">
            {store.bannerUri && (
                <div className="merchant-banner">
                    <img
                        src={store.bannerUri}
                        alt={`${store.storeName} banner`}
                    />
                </div>
            )}

            <section className="merchant-profile">
                <div className="merchant-profile-top">
                    {store.logoUri && (
                        <img
                            src={store.logoUri}
                            alt={store.storeName}
                            className="merchant-profile-logo"
                        />
                    )}

                    <div className="merchant-profile-main">
                        <h1>{store.storeName}</h1>

                        <div className="merchant-profile-stats">
                            <span>
                                <strong>{store.totalSold ?? 0}</strong> sold
                            </span>
                        </div>
                    </div>
                </div>

                <div className="merchant-profile-grid">
                    <div className="merchant-profile-details">
                        <SellerReputation
                            merchantAuthority={store.authority}
                        />

                        {store.descriptionUri && (
                            <p className="merchant-profile-description">
                                {store.descriptionUri}
                            </p>
                        )}

                        {store.shipsFrom && (
                            <p className="merchant-ships-from">
                                <strong>Ships from:</strong>{" "}
                                {store.shipsFrom}
                            </p>
                        )}
                    </div>

                    {store.preferredContact && (
                        <aside className="merchant-contact">
                            <h3>Preferred Contact</h3>
                            <p>{store.preferredContact}</p>
                        </aside>
                    )}
                </div>
            </section>

            <section className="merchant-products">
                <div className="merchant-products-header">
                    <h2>Products</h2>
                </div>

                {products.length === 0 && (
                    <div className="merchant-products-empty">
                        <p>No products yet.</p>
                    </div>
                )}

                {products.length > 0 && (
                    <div className="merchant-products-grid">
                        {products.map(product => {
                            const firstImage = Array.isArray(product.imageUris)
                                ? product.imageUris.find(
                                    imageUri =>
                                        typeof imageUri === "string" &&
                                        imageUri.trim()
                                )
                                : product.imageUri || null;

                            return (
                                <Link
                                    key={addressToString(product.publicKey)}
                                    to={`/product/${addressToString(product.publicKey)}`}
                                    className="merchant-product-link"
                                >
                                    <article className="merchant-product-card">
                                        {firstImage ? (
                                            <img
                                                src={firstImage}
                                                alt={product.title}
                                                className="merchant-product-image"
                                            />
                                        ) : (
                                            <div className="merchant-product-no-image">
                                                No Image
                                            </div>
                                        )}

                                        <div className="merchant-product-body">
                                            <h3>{product.title}</h3>
                                            <p className="merchant-product-category">
                                                {product.category}
                                            </p>

                                            <strong className="merchant-product-price">
                                                {(
                                                    Number(product.price) /
                                                    LAMPORTS_PER_SOL
                                                ).toFixed(3)}{" "}
                                                SOL
                                            </strong>

                                            <div className="merchant-product-stats">
                                                <span>
                                                    <strong>
                                                        {Number(
                                                            product.averageRating || 0
                                                        ).toFixed(1)}
                                                    </strong>{" "}
                                                    ★
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
                                                Available: {product.stock}
                                            </small>
                                        </div>
                                    </article>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}