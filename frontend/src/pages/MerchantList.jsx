import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMerchants } from "../lib/merchant";

export default function MerchantList() {
    const [merchants, setMerchants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = async () => {
        try {
            setLoading(true);
            setError("");

            const result = await getMerchants();
            setMerchants(result);
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

    return (
        <div style={{ padding: 24 }}>
            <h1>Merchant List</h1>

            <button onClick={load}>Refresh</button>

            {loading && <p>Loading merchants...</p>}

            {error && <p style={{ color: "red" }}>{error}</p>}

            {!loading && merchants.length === 0 && !error && (
                <p>No merchants yet.</p>
            )}

            {merchants.map((merchant) => (
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

                    <p>{merchant.descriptionUri}</p>

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