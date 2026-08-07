import { useState } from "react";
import MerchantList from "./MerchantList";
import { SOLZAAR_PROGRAM_ID, shortenProgramId } from "../config/program";
import "./Home.css";

export default function Home() {
    const [copied, setCopied] = useState(false);

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

            <MerchantList />
        </main>
    );
}