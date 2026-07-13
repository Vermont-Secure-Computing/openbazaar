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
                position: "absolute",
                top: -8,
                right: -10,
                minWidth: 20,
                height: 20,
                padding: "0 5px",
                borderRadius: 999,
                background: "#dc2626",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1,
                border: "2px solid white",
            }}
        >
            {newOrderCount > 99 ? "99+" : newOrderCount}
        </span>
    );
}