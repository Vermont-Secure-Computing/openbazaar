import { Link } from "react-router-dom";

export default function SellerPage() {
    return (
        <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
            <h1>Become a Seller on SolBazaar</h1>

            <p>
                Create your store, list your products, and sell directly through
                Solana wallet transactions.
            </p>

            <div
                style={{
                    marginTop: 24,
                    display: "grid",
                    gap: 16,
                }}
            >
                <div style={{ border: "1px solid #ddd", padding: 20, borderRadius: 12 }}>
                    <h3>1. Connect your wallet</h3>
                    <p>Your wallet becomes your merchant identity.</p>
                </div>

                <div style={{ border: "1px solid #ddd", padding: 20, borderRadius: 12 }}>
                    <h3>2. Create your store</h3>
                    <p>Add your store name, description, location, logo, and banner.</p>
                </div>

                <div style={{ border: "1px solid #ddd", padding: 20, borderRadius: 12 }}>
                    <h3>3. Add your products</h3>
                    <p>Paste image URLs, set prices, and manage available stock.</p>
                </div>
            </div>

            <Link
                to="/dashboard"
                style={{
                    display: "inline-block",
                    marginTop: 30,
                    padding: "14px 22px",
                    background: "#111",
                    color: "white",
                    borderRadius: 10,
                    textDecoration: "none",
                }}
            >
                Start Selling
            </Link>
        </div>
    );
}