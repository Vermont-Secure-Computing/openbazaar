import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMerchants } from "../lib/merchant";

function truncate(text, max = 120) {
    if (!text) return "";

    return text.length > max
        ? text.slice(0, max) + "..."
        : text;
}

export default function MerchantList() {
    const [merchants, setMerchants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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
        <div style={{ padding: 24 }}>
            <h1>Merchant List</h1>

            <button onClick={load}>Refresh</button>

            {loading && <p>Loading merchants...</p>}

            {error && <p style={{ color: "red" }}>{error}</p>}

            {!loading && merchants.length === 0 && !error && (
                <p>No merchants yet.</p>
            )}

            {Array.isArray(merchants) &&
                merchants.map((merchant) => (
                <div
                    key={merchant.publicKey}
                    style={{
                        border: "1px solid #ddd",
                        padding: 16,
                        borderRadius: 12,
                        marginBottom: 16,
                    }}
                >
                    <h2>
                        {merchant.storeName}
                        {merchant.verified && " ✔"}
                    </h2>

                    <p
                        style={{
                            color: "#555",
                            lineHeight: 1.5,
                            marginBottom: 12,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                        }}
                    >
                        {truncate(merchant.descriptionUri, 120)}
                    </p>

                    <p>📦 Ships from: {merchant.shipsFrom}</p>

                    <small>{merchant.authority}</small>

                    <br />

                    <Link to={`/merchant/${merchant.authority}`}>
                        Visit Store
                    </Link>
                </div>
            ))}
        </div>
    );
}