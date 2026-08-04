import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import CreateMerchant from "./CreateMerchant";
import CreateProduct from "./CreateProduct";
import EditMerchant from "./EditMerchant";
import MyProducts from "./MyProducts";
import SellerReputation from "../components/SellerReputation";
import "../components/review.css";
import "./Dashboard.css";

import { getMerchantByAuthority } from "../lib/merchant";

export default function Dashboard() {
    const wallet = useWallet();
    const [merchant, setMerchant] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        if (!wallet.publicKey) {
            setLoading(false);
            return;
        }

        setLoading(true);

        const m = await getMerchantByAuthority(
            wallet.publicKey.toBase58()
        );

        setMerchant(m || null);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [wallet.publicKey]);

    if (!wallet.publicKey) {
        return (
            <main className="dashboard-page">
                <section className="dashboard-header">
                    <h1>Seller Dashboard</h1>
                </section>

                <section className="dashboard-state">
                    <p>Please connect your wallet.</p>
                </section>
            </main>
        );
    }

    if (loading) {
        return (
            <main className="dashboard-page">
                <section className="dashboard-state">
                    <p>Loading dashboard...</p>
                </section>
            </main>
        );
    }

    return (
        <main className="dashboard-page">
            <section className="dashboard-header">
                <h1>Seller Dashboard</h1>
            </section>

            {!merchant ? (
                <div className="dashboard-content">
                    <section className="dashboard-panel">
                        <p className="dashboard-empty-text">
                            You do not have a merchant profile yet.
                        </p>

                        <CreateMerchant onCreated={load} />
                    </section>
                </div>
            ) : (
                <div className="dashboard-content">
                    <div className="dashboard-top-grid">
                        <section className="dashboard-panel">
                            <EditMerchant
                                merchant={merchant}
                                onUpdated={load}
                            />
                        </section>

                        <section className="dashboard-panel">
                            <SellerReputation
                                merchantAuthority={
                                    merchant.authority
                                }
                                allowInitialize
                            />
                        </section>
                    </div>

                    <section className="dashboard-panel">
                        <CreateProduct />
                    </section>

                    <section className="dashboard-panel">
                        <MyProducts
                            merchant={merchant.authority}
                        />
                    </section>
                </div>
            )}
        </main>
    );
}