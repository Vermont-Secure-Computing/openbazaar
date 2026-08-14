import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMerchants } from "../lib/merchant";

import "./MerchantList.css";

function truncate(text, max = 120) {
    if (!text) return "";

    return text.length > max
        ? text.slice(0, max) + "..."
        : text;
}

function getMerchantAddress(merchant) {
    return (
        merchant.authority?.toBase58?.() ??
        merchant.authority?.toString?.() ??
        String(merchant.authority ?? "")
    );
}

export default function MerchantList({
    search = "",
    page = 1,
    itemsPerPage = 12,
    onPageChange,
}) {
    const [merchants, setMerchants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [failedLogos, setFailedLogos] = useState({});

    const query = search.trim().toLowerCase();

    const filteredMerchants = merchants.filter(merchant => {
        if (!query) return true;

        const storeName = merchant.storeName?.toLowerCase() || "";
        const description = merchant.descriptionUri?.toLowerCase() || "";
        const location = merchant.shipsFrom?.toLowerCase() || "";

        return (
            storeName.includes(query) ||
            description.includes(query) ||
            location.includes(query)
        );
    });

    const totalPages = Math.max(
        1,
        Math.ceil(filteredMerchants.length / itemsPerPage)
    );

    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;

    const paginatedMerchants = filteredMerchants.slice(
        startIndex,
        startIndex + itemsPerPage
    );

    const load = async () => {
        try {
            setLoading(true);
            setError("");

            const result = await getMerchants();
            console.log("getMerchants result:", result);
            console.log("Is array:", Array.isArray(result));
            console.log("Merchant count:", result?.length);
            setMerchants(Array.isArray(result) ? result : []);
        } catch (err) {
            console.error("Merchant list error:", err);
            setError("Failed to load merchants.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    console.log("MerchantList state:", merchants);
    console.log("MerchantList state count:", merchants.length);

    return (
        <section className="merchant-list-section">
            <div className="merchant-list-header">
                <div>
                    <h2>Merchants</h2>
                </div>

                <button
                    type="button"
                    className="merchant-refresh-button"
                    onClick={load}
                    disabled={loading}
                >
                    {loading ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {loading && <div className="merchant-message">Loading merchants... </div>}

            {error && (
                <div className="merchant-message merchant-error">
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={load}
                    >
                        Try again
                    </button>
                </div>
            )}

            {!loading && !error && filteredMerchants.length === 0 && (
                <div className="merchant-empty">
                <strong>
                    {search ? "No merchants found" : "No merchants yet"}
                </strong>

                <p>
                    {search ? "Try a different search." : "Stores will appear here after merchants register."}
                </p>
            </div>
            )}


            {!loading && !error && filteredMerchants.length > 0 && (
                <>
                    <div className="merchant-grid">
                        {paginatedMerchants.map((merchant) => {
                            const merchantAddress = getMerchantAddress(merchant);
                            const logoUri =  merchant.logoUri || "";

                            const logoFailed = failedLogos[merchantAddress];
                            
                            const merchantInitial =
                                ( merchant.storeName || "S" )
                                .slice(0, 1)
                                .toUpperCase();

                            return (
                                <article
                                    key={
                                        merchant.publicKey?.toString?.() ??
                                        merchantAddress
                                    }
                                    className="merchant-card"
                                >
                                    <div className="merchant-card-header">
                                        <div className="merchant-avatar">
                                            {logoUri && !logoFailed ? (
                                                <img
                                                    src={logoUri}
                                                    alt={`${merchant.storeName || "Merchant"} logo`}
                                                    className="merchant-avatar-image"
                                                    onError={() => {
                                                        setFailedLogos((current) => ({
                                                            ...current,
                                                            [merchantAddress]: true,
                                                        }));
                                                    }}
                                                />
                                            ) : (
                                                <span className="merchant-avatar-fallback">
                                                    {merchantInitial}
                                                </span>
                                            )}
                                        </div>

                                        <div className="merchant-card-title">
                                            <div className="merchant-name-row">
                                                <h3>{merchant.storeName || "Unnamed Store"}</h3>

                                                {merchant.verified && (
                                                    <span className="merchant-verified">
                                                        Verified
                                                    </span>
                                                )}
                                            </div>

                                            <span className="merchant-location">
                                                Ships from{" "}
                                                {merchant.shipsFrom || "Not specified"}
                                            </span>
                                        </div>
                                    </div>

                                    <p className="merchant-description">
                                        {truncate(merchant.descriptionUri || "No store description provided.", 140)}
                                    </p>

                                    <div className="merchant-footer">
                                        <span className="merchant-sold">
                                            {Number(merchant.totalSold ?? 0)}{" "}
                                            {Number(merchant.totalSold ?? 0) === 1 ? "item sold" : "items sold"}
                                        </span>
                                    </div>

                                    <Link
                                        to={`/merchant/${merchantAddress}`}
                                        className="merchant-visit-link"
                                    >
                                        Visit Store
                                    </Link>
                                </article>
                            );
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div className="marketplace-pagination">
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => onPageChange(currentPage - 1)}
                            >
                                Previous
                            </button>

                            <span>
                                Page {currentPage} of {totalPages}
                            </span>

                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => onPageChange(currentPage + 1)}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}