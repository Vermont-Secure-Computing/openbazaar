import MerchantList from "./MerchantList";
import "./Home.css";

export default function Home() {
    return (
        <main className="home-app">
            <section className="home-hero">
                <div className="home-hero-content">
                    <h1>Shop from Solana merchants</h1>
                    <p>
                        Discover stores, view products, and buy directly from sellers.
                    </p>
                </div>
            </section>

            <MerchantList />
        </main>
    );
}