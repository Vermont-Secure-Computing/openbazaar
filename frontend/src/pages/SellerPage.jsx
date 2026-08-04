import { Link } from "react-router-dom";

import "./SellerPage.css";

export default function SellerPage() {
    return (
        <main className="seller-page">
            <header className="seller-header">
                <h1>Become a Seller on SolBazaar</h1>

                <p>
                    Create your store, list your products, and sell directly through
                    Solana wallet transactions.
                </p>
            </header>

            <div className="seller-steps">
                <section className="seller-step-card">
                    <h3>1. Connect your wallet</h3>
                    <p>Your wallet becomes your merchant identity.</p>
                </section>

                <section className="seller-step-card">
                    <h3>2. Create your store</h3>
                    <p>Add your store name, description, location, logo, and banner.</p>
                </section>

                <section className="seller-step-card">
                    <h3>3. Add your products</h3>
                    <p>Paste image URLs, set prices, and manage available stock.</p>
                </section>
            </div>

            <Link
                to="/dashboard"
                className="seller-start-link"
            >
                Start Selling
            </Link>
        </main>
    );
}