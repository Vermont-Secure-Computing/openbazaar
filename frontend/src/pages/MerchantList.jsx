import { useEffect, useState } from "react";
import { program } from "../lib/anchor";
import { Link } from "react-router-dom";        

export default function MerchantList() {
    const [merchants, setMerchants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = async () => {
        try {
            setLoading(true);
            setError("");

            const accounts = await program.account.merchantProfile.all([
                {
                    dataSize: 799,
                },
            ]);

            setMerchants(
                accounts.map((item) => ({
                    publicKey: item.publicKey.toBase58(),
                    authority: item.account.authority.toBase58(),
                    storeName: item.account.storeName,
                    descriptionUri: item.account.descriptionUri,
                    logoUri: item.account.logoUri,
                    bannerUri: item.account.bannerUri,
                    location: item.account.location,
                    active: item.account.active,
                    verified: item.account.verified,
                }))
            );
        } catch (err) {
            console.error("Merchant list error:", err);
            setError("Failed to load merchants. Please refresh or try again.");
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
                    <h2>{merchant.storeName}</h2>
                    <p>{merchant.descriptionUri}</p>
                    <p>{merchant.location}</p>
                    <small>{merchant.authority}</small>
                    <Link to={`/merchant/${merchant.authority}`}>
                        Visit Store
                    </Link>
                </div>
            ))}
        </div>
    );
}