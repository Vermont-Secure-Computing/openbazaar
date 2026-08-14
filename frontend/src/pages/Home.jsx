import { useEffect, useState } from "react";
import MerchantList from "./MerchantList";
import ProductList from "./ProductList";
import { getProducts } from "../lib/product";
import { SOLZAAR_PROGRAM_ID, shortenProgramId } from "../config/program";
import "./Home.css";

const ITEMS_PER_PAGE = 12;

export default function Home() {
    const [copied, setCopied] = useState(false);
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState("merchants");
    const [merchantPage, setMerchantPage] = useState(1);
    const [productPage, setProductPage] = useState(1);
    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(true);

    useEffect(() => {
        const loadProducts = async () => {
            try {
                setProductsLoading(true);
                const result = await getProducts();
                setProducts(Array.isArray(result) ? result : []);
            } catch (error) {
                console.error("Failed to load products: ", error);
                setProducts([]);
            } finally {
                setProductsLoading(false);
            }
        };

        loadProducts();
    }, []);

    useEffect(() => {
        setMerchantPage(1);
        setProductPage(1);
    }, [search]);

    const copyProgramId = async () => {
        if (!SOLZAAR_PROGRAM_ID) return;

        try {
            await navigator.clipboard.writeText(SOLZAAR_PROGRAM_ID);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch (error) {
            console.error("Failed to copy program ID:", error);
        }
    };

    return (
        <main className="home-page">
            <section className="home-hero">
                <div className="home-hero-content">
                    <h1>Shop from Solana merchants</h1>
                    <p>
                        Discover stores, view products, and buy directly from sellers.
                    </p>

                    <div className="home-program-id">
                        <span className="home-program-title">Program ID</span>

                        <div className="home-program-value">
                            <code className="program-full">
                                {SOLZAAR_PROGRAM_ID || "Unavailable"}
                            </code>

                            <code className="program-short">
                                {shortenProgramId(SOLZAAR_PROGRAM_ID)}
                            </code>

                            <button
                                type="button"
                                className="home-program-copy"
                                onClick={copyProgramId}
                                disabled={!SOLZAAR_PROGRAM_ID}
                                title={copied ? "Copied" : "Copy Program ID"}
                                aria-label={copied ? "Program ID copied" : "Copy Program ID"}
                            >
                                {copied ? "✓" : "⧉"}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="marketplace-discovery">
                <div className="marketplace-search">
                    <input
                        type="search"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder={
                            activeTab === "merchants"
                                ? "Search merchants..."
                                : "Search products..."
                        }
                    />
                </div>

                <div className="marketplace-tabs">
                    <button
                        type="button"
                        className={`marketplace-tab${activeTab === "merchants" ? " active" : ""}`}
                        onClick={() => setActiveTab("merchants")}
                    >
                        Merchants
                    </button>

                    <button
                        type="button"
                        className={`marketplace-tab${activeTab === "products" ? " active" : ""}`}
                        onClick={() => setActiveTab("products")}
                    >
                        Products
                    </button>
                </div>

                {activeTab === "merchants" ? (
                    <MerchantList
                        search={search}
                        page={merchantPage}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={setMerchantPage}
                    />
                ) : (
                    <ProductList
                        products={products}
                        search={search}
                        page={productPage}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={setProductPage}
                        loading={productsLoading}
                    />
                )}
            </section>
        </main>
    );
}