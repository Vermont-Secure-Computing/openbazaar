import MerchantList from "./MerchantList";

export default function Home() {
    return (
        <main>
            <section
                style={{
                    padding: "50px 24px",
                    textAlign: "center",
                    borderBottom: "1px solid #eee",
                }}
            >
                <h1>Shop from Solana merchants</h1>
                <p>
                    Discover stores, view products, and buy directly from sellers.
                </p>
            </section>

            <MerchantList />
        </main>
    );
}