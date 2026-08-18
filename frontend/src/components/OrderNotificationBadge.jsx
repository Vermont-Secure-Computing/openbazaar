import { useEffect, useState } from "react";
import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";

import {
    ESCROW_STATUS,
    getSellerEscrows,
} from "../lib/escrow";

export default function OrderNotificationBadge() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [newOrderCount, setNewOrderCount] = useState(0);

    const loadNewOrders = async () => {
        if (!wallet.publicKey) {
            setNewOrderCount(0);
            return;
        }

        try {
            const sellerOrders = await getSellerEscrows({
                connection,
                wallet,
            });

            const newOrders = sellerOrders.filter(
                (escrow) =>
                    escrow.status === ESCROW_STATUS.CREATED &&
                    Number(escrow.depositedA) > 0 &&
                    Number(escrow.depositedB) === 0
            );

            setNewOrderCount(newOrders.length);
        } catch (error) {
            console.error(
                "Order notification error:",
                error
            );
        }
    };

    useEffect(() => {
        loadNewOrders();

        const intervalId = window.setInterval(
            loadNewOrders,
            30_000
        );

        return () => {
            window.clearInterval(intervalId);
        };
    }, [wallet.publicKey, connection]);

    if (newOrderCount === 0) {
        return null;
    }

    return (
        <span
            style={{
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 999,
                background: "#dc2626",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1,
                flex: "0 0 auto",
            }}
        >
            {newOrderCount > 99 ? "99+" : newOrderCount}
        </span>
    );
}