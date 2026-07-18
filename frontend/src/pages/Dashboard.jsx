import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import CreateMerchant from "./CreateMerchant";
import CreateProduct from "./CreateProduct";
import EditMerchant from "./EditMerchant";
import MyProducts from "./MyProducts";
import SellerReputation from "../components/SellerReputation";
import "../components/review.css";

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

        const m = await getMerchantByAuthority(wallet.publicKey.toBase58());
        setMerchant(m || null);

        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [wallet.publicKey]);

    if (!wallet.publicKey) {
        return (
            <div style={{ padding: 24 }}>
                <h1>Seller Dashboard</h1>
                <p>Please connect your wallet.</p>
            </div>
        );
    }

    if (loading) {
        return <p style={{ padding: 24 }}>Loading dashboard...</p>;
    }

    return (
        <div style={{ padding: 24 }}>
            <h1>Seller Dashboard</h1>
    
            {!merchant ? (
                <>
                    <p>You do not have a merchant profile yet.</p>
                    <CreateMerchant onCreated={load} />
                </>
            ) : (
                <>
                    <EditMerchant
                        merchant={merchant}
                        onUpdated={load}
                    />
    
                    <SellerReputation
                        merchantAuthority={
                            merchant.authority
                        }
                        allowInitialize
                    />
    
                    <hr />
    
                    <CreateProduct />
    
                    <hr />
    
                    <MyProducts
                        merchant={merchant.authority}
                    />
                </>
            )}
        </div>
    );
}