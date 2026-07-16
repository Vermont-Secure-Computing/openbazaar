import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getProduct } from "../lib/product";
import { getMerchants } from "../lib/merchant";
import { createBuyerEscrow } from "../lib/escrow";
import { createOrderRecord } from "../lib/orderRecord";
import { getMerchantReputation } from "../lib/reputation";


export default function ProductPage() {

    const { product } = useParams();
    const { connection } = useConnection();
    const wallet = useWallet();

    const [item, setItem] = useState(null);
    const [merchant, setMerchant] = useState(null);
    const [buying, setBuying] = useState(false);
    const [reputation, setReputation] = useState(null);

    useEffect(() => {

        async function load() {

            const p = await getProduct(product);

            setItem(p);

            if (!p) return;

            const merchants =
                await getMerchants();

            const m = merchants.find(
                merchant =>
                    merchant.authority === p.merchant
            );

            setMerchant(m);

            if (m) {
                const rep =
                    await getMerchantReputation({
                        connection,
                        wallet,
                        merchantAuthority: m.authority,
                    });
            
                setReputation(rep);
            }

        }

        load();

    }, [product]);

    if (!item) {
        return (
            <div style={{ padding: 24 }}>
                Loading product...
            </div>
        );
    }

    const productPriceLamports = Number(item.price);

    const depositBps = Number(
        merchant?.sellerDepositBps ?? 1000
    );

    const calculatedDepositLamports = Math.floor(
        (productPriceLamports * depositBps) / 10_000
    );

    const securityDepositLamports =
        calculatedDepositLamports === 0
            ? 1
            : calculatedDepositLamports;

    const buyerTotalLamports =
        productPriceLamports +
        securityDepositLamports;

    const buyNow = async () => {
        if (!wallet.publicKey) {
            alert("Connect your wallet first.");
            return;
        }
    
        if (!item || !merchant) {
            alert(
                "Product or merchant information is unavailable."
            );
            return;
        }
    
        if (item.stock === 0) {
            alert("This product is out of stock.");
            return;
        }
    
        if (
            wallet.publicKey.toBase58() ===
            merchant.authority
        ) {
            alert(
                "You cannot buy your own product."
            );
            return;
        }
    
        const quantity = 1;
    
        try {
            setBuying(true);
    
            /*
             * createBuyerEscrow must:
             * 1. create the external escrow;
             * 2. deposit product price + buyer bond;
             * 3. return the escrow PDA.
             */
            const escrowResult =
                await createBuyerEscrow({
                    connection,
                    wallet,
                    product: item,
                    merchant,
                    quantity,
                });
    
            console.log(
                "Escrow created:",
                escrowResult
            );
    
            const escrowAddress =
                typeof escrowResult.escrowPda === "string"
                    ? escrowResult.escrowPda
                    : escrowResult.escrowPda?.toBase58();

            if (!escrowAddress) {
                throw new Error(
                    "Escrow address was not returned."
                );
            }
    
            /*
             * Register this escrow as a valid
             * SolBazaar marketplace order.
             */
            const orderRecordResult =
                await createOrderRecord({
                    connection,
                    wallet,
                    escrowAddress,
                    productAddress:
                        item.publicKey,
                    merchantAuthority:
                        merchant.authority,
                    quantity,
                });
    
            console.log(
                "Order record created:",
                orderRecordResult
            );
    
            alert(
                `Order created successfully.\n\n` +
                `Escrow: ${escrowAddress}\n` +
                `Order Record: ${orderRecordResult.orderRecord}`
            );
        } catch (error) {
            console.error(
                "Buy now error:",
                error
            );
    
            alert(
                error?.message ||
                    "Failed to create escrow order."
            );
        } finally {
            setBuying(false);
        }
    };

    return (
        <div
            style={{
                maxWidth: 900,
                margin: "40px auto",
                padding: 24,
            }}
        >

            <Link to="/">
                ← Back
            </Link>

            <div
                style={{
                    display: "flex",
                    gap: 40,
                    marginTop: 30,
                    flexWrap: "wrap",
                }}
            >

                <div style={{ flex: 1 }}>

                    {item.imageUri ? (
                        <img
                            src={item.imageUri}
                            alt={item.title}
                            style={{
                                width: "100%",
                                borderRadius: 16,
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                height: 350,
                                border: "1px solid #ddd",
                                borderRadius: 16,
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                            }}
                        >
                            No Image
                        </div>
                    )}

                </div>

                <div style={{ flex: 1 }}>

                    <h1>{item.title}</h1>

                    <h2>
                        {(Number(item.price) / LAMPORTS_PER_SOL).toFixed(3)} SOL
                    </h2>

                    <p>
                        {item.description}
                    </p>

                    <hr />

                    <p>

                        <strong>Category</strong>

                        <br />

                        {item.category}

                    </p>

                    {item.stock === 0 ? (
                        <p style={{ color: "#dc2626", fontWeight: "bold" }}>
                            🔴 Out of Stock
                        </p>
                    ) : item.stock <= 5 ? (
                        <p style={{ color: "#d97706", fontWeight: "bold" }}>
                            🟡 Only {item.stock} left
                        </p>
                    ) : (
                        <p style={{ color: "#16a34a", fontWeight: "bold" }}>
                            🟢 {item.stock} available
                        </p>
                    )}

                    <p>

                        <strong>Sold</strong>

                        <br />

                        {item.sold}

                    </p>

                    {merchant && (

                        <>

                            <hr />

                            <p>

                                <strong>Merchant</strong>

                                {reputation ? (
                                    <>

                                        <p
                                            style={{
                                                marginTop: 8,
                                                fontSize: 22,
                                                fontWeight: "bold",
                                            }}
                                        >
                                            ⭐ {reputation.average.toFixed(1)}
                                        </p>

                                        <p>
                                            {reputation.totalReviews} Reviews
                                        </p>

                                    </>
                                ) : (
                                    <p>
                                        ⭐ No reviews yet
                                    </p>
                                )}

                                <br />

                                {merchant.storeName}

                            </p>

                            <p>

                            <strong>Ships From</strong>
                            <br />
                            {merchant.shipsFrom}

                            </p>

                        </>

                    )}

                        {merchant && (
                            <div
                                style={{
                                    marginTop: 20,
                                    padding: 14,
                                    border: "1px solid #ddd",
                                    borderRadius: 10,
                                }}
                            >
                                <p>
                                    <strong>Product Price:</strong>{" "}
                                    {(
                                        Number(item.price) /
                                        LAMPORTS_PER_SOL
                                    ).toFixed(4)}{" "}
                                    SOL
                                </p>

                                <p>
                                    <strong>
                                        Refundable Security Deposit:
                                    </strong>{" "}
                                    {(
                                        securityDepositLamports /
                                        LAMPORTS_PER_SOL
                                    ).toFixed(9)}{" "}
                                    SOL
                                </p>

                                <p>
                                    <strong>Total Buyer Deposit:</strong>{" "}
                                    {(
                                        buyerTotalLamports /
                                        LAMPORTS_PER_SOL
                                    ).toFixed(9)}{" "}
                                    SOL
                                </p>

                                <p>
                                    <strong>Security Deposit Rate:</strong>{" "}
                                    {(depositBps / 100).toFixed(1)}%
                                </p>

                                <small>
                                    Your refundable security deposit will be returned
                                    when you confirm receipt and approve the escrow release.
                                </small>
                            </div>
                        )}

                        <button
                            onClick={buyNow}
                            disabled={
                                item.stock === 0 ||
                                buying ||
                                !merchant
                            }
                            style={{
                                marginTop: 20,
                                padding: "12px 30px",
                                fontSize: 18,
                                cursor:
                                    item.stock === 0 || buying
                                        ? "not-allowed"
                                        : "pointer",
                                opacity:
                                    item.stock === 0 || buying
                                        ? 0.5
                                        : 1,
                            }}
                        >
                            {item.stock === 0
                                ? "Out of Stock"
                                : buying
                                    ? "Creating Order..."
                                    : "Buy Now"}
                        </button>

                </div>

            </div>

        </div>
    );
}