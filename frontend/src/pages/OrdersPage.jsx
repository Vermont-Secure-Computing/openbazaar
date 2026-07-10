import { useEffect, useState } from "react";
import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";


import {
    ESCROW_STATUS,
    getBuyerEscrows,
    getSellerEscrows,
    getEscrowStatusLabel,
    sellerAcceptEscrow,
    suggestReleaseToSeller,
    acceptEscrowRelease,
    closeCompletedEscrow,
} from "../lib/escrow";

function lamportsToSol(value) {
    return (
        Number(value) / LAMPORTS_PER_SOL
    ).toFixed(4);
}

export default function OrdersPage() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [buyerOrders, setBuyerOrders] =
        useState([]);

    const [sellerOrders, setSellerOrders] =
        useState([]);

    const [loading, setLoading] =
        useState(true);

    const [processingEscrow, setProcessingEscrow] =
        useState("");

    const loadOrders = async () => {
        if (!wallet.publicKey) {
            setBuyerOrders([]);
            setSellerOrders([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const [buyer, seller] =
                await Promise.all([
                    getBuyerEscrows({
                        connection,
                        wallet,
                    }),

                    getSellerEscrows({
                        connection,
                        wallet,
                    }),
                ]);

            setBuyerOrders(buyer);
            setSellerOrders(seller);
        } catch (error) {
            console.error(
                "Load orders error:",
                error
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
    }, [wallet.publicKey]);

    const acceptOrder = async (escrow) => {
        try {
            setProcessingEscrow(
                escrow.publicKey
            );

            const signature =
                await sellerAcceptEscrow({
                    connection,
                    wallet,
                    escrow,
                });

            alert(
                `Order accepted: ${signature}`
            );

            await loadOrders();
        } catch (error) {
            console.error(
                "Accept order error:",
                error
            );

            alert(
                error?.message ||
                    "Failed to accept order."
            );
        } finally {
            setProcessingEscrow("");
        }
    };

    const confirmReceived = async (escrow) => {
        try {
            setProcessingEscrow(escrow.publicKey);
    
            const signature =
                await suggestReleaseToSeller({
                    connection,
                    wallet,
                    escrow,
                });
    
            alert(`Release proposed: ${signature}`);
            await loadOrders();
        } catch (error) {
            console.error(
                "Confirm received error:",
                error
            );
    
            alert(
                error?.message ||
                    "Failed to confirm receipt."
            );
        } finally {
            setProcessingEscrow("");
        }
    };

    const acceptRelease = async (escrow) => {
        try {
            setProcessingEscrow(escrow.publicKey);
    
            const signature =
                await acceptEscrowRelease({
                    connection,
                    wallet,
                    escrow,
                });
    
            alert(`Funds released: ${signature}`);
            await loadOrders();
        } catch (error) {
            console.error(
                "Accept release error:",
                error
            );
    
            alert(
                error?.message ||
                    "Failed to release funds."
            );
        } finally {
            setProcessingEscrow("");
        }
    };

    const closeOrder = async (escrow) => {
        try {
            setProcessingEscrow(escrow.publicKey);
    
            const signature =
                await closeCompletedEscrow({
                    connection,
                    wallet,
                    escrow,
                });
    
            alert(
                `Order closed and rent returned: ${signature}`
            );
    
            await loadOrders();
        } catch (error) {
            console.error(
                "Close order error:",
                error
            );
    
            alert(
                error?.message ||
                    "Failed to close completed order."
            );
        } finally {
            setProcessingEscrow("");
        }
    };

    if (!wallet.publicKey) {
        return (
            <div style={{ padding: 24 }}>
                <h1>Orders</h1>
                <p>
                    Connect your wallet to view
                    your orders.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{ padding: 24 }}>
                Loading orders...
            </div>
        );
    }

    return (
        <div
            style={{
                maxWidth: 1000,
                margin: "0 auto",
                padding: 24,
            }}
        >
            <h1>Orders</h1>

            <button onClick={loadOrders}>
                Refresh Orders
            </button>

            <section style={{ marginTop: 30 }}>
                <h2>My Purchases</h2>

                {buyerOrders.length === 0 && (
                    <p>No purchase orders yet.</p>
                )}

                {buyerOrders.map((escrow) => (
                    <OrderCard
                        key={escrow.publicKey}
                        escrow={escrow}
                        role="buyer"
                        processing={
                            processingEscrow === escrow.publicKey
                        }
                        onConfirmReceived={() =>
                            confirmReceived(escrow)
                        }
                        onCloseOrder={() =>
                            closeOrder(escrow)
                        }
                    />
                ))}
            </section>

            <section style={{ marginTop: 40 }}>
                <h2>Seller Orders</h2>

                {sellerOrders.length === 0 && (
                    <p>
                        No seller orders yet.
                    </p>
                )}

                {sellerOrders.map((escrow) => (
                    <OrderCard
                        key={escrow.publicKey}
                        escrow={escrow}
                        role="seller"
                        processing={
                            processingEscrow === escrow.publicKey
                        }
                        onAccept={() =>
                            acceptOrder(escrow)
                        }
                        onAcceptRelease={() =>
                            acceptRelease(escrow)
                        }
                    />
                ))}
            </section>
        </div>
    );
}

function OrderCard({
    escrow,
    role,
    processing,
    onAccept,
    onConfirmReceived,
    onAcceptRelease,
    onCloseOrder,
}) {
    const sellerStillNeedsDeposit =
        escrow.status === 0 &&
        Number(escrow.depositedB) === 0;

    return (
        <div
            style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                marginTop: 12,
            }}
        >
            <h3>
                Order{" "}
                {escrow.publicKey.slice(0, 8)}
                ...
            </h3>

            <p>
                <strong>Status:</strong>{" "}
                {getEscrowStatusLabel(
                    escrow.status
                )}
            </p>

            <p>
                <strong>Product PDA:</strong>{" "}
                {escrow.order?.product ||
                    "Unknown"}
            </p>

            <p>
                <strong>Quantity:</strong>{" "}
                {escrow.order?.quantity || 1}
            </p>

            <p>
                <strong>Buyer deposit:</strong>{" "}
                {lamportsToSol(
                    escrow.requiredDepositA
                )}{" "}
                SOL
            </p>

            <p>
                <strong>Seller deposit:</strong>{" "}
                {lamportsToSol(
                    escrow.requiredDepositB
                )}{" "}
                SOL
            </p>

            <p>
                <strong>Buyer:</strong>{" "}
                {escrow.partyA}
            </p>

            <p>
                <strong>Seller:</strong>{" "}
                {escrow.partyB}
            </p>

            {role === "seller" &&
                sellerStillNeedsDeposit && (
                    <button
                        onClick={onAccept}
                        disabled={processing}
                    >
                        {processing
                            ? "Accepting..."
                            : `Accept Order and Deposit ${lamportsToSol(
                                  escrow.requiredDepositB
                              )} SOL`}
                    </button>
                )}

                {role === "buyer" && escrow.status === 1 && (
                    <button
                        onClick={onConfirmReceived}
                        disabled={processing}
                    >
                        {processing
                            ? "Confirming..."
                            : "Confirm Product Received"}
                    </button>
                )}

                {role === "seller" && escrow.status === 2 && (
                    <button
                        onClick={onAcceptRelease}
                        disabled={processing}
                    >
                        {processing
                            ? "Releasing..."
                            : "Accept Release"}
                    </button>
                )}

                {role === "buyer" &&
                    escrow.status === ESCROW_STATUS.COMPLETED && (
                        <button
                            onClick={onCloseOrder}
                            disabled={processing}
                        >
                            {processing
                                ? "Closing..."
                                : "Close Order and Recover Rent"}
                        </button>
                )}
        </div>
    );
}