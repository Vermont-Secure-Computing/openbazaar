import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getProduct } from "../lib/product";
import { getMerchants } from "../lib/merchant";
// import { createBuyerEscrow } from "../lib/escrow";
// import { createOrderRecord } from "../lib/orderRecord";
import { createBuyOrder } from "../lib/buyOrder";
import { getMerchantReputation } from "../lib/reputation";
import ProductReviews from "../components/ProductReviews";
import SellerReputation from "../components/SellerReputation";
import "../components/review.css";


export default function ProductPage() {

    const { product } = useParams();
    const { connection } = useConnection();
    const wallet = useWallet();

    const [item, setItem] = useState(null);
    const [merchant, setMerchant] = useState(null);
    const [buying, setBuying] = useState(false);
    const [reputation, setReputation] = useState(null);
    const [quantity, setQuantity] = useState(1);

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

    }, [product, connection, wallet]);

    if (!item) {
        return (
            <div style={{ padding: 24 }}>
                Loading product...
            </div>
        );
    }

    const unitPriceLamports =
        Number(item.price ?? 0);

    const availableStock =
        Number(item.stock ?? 0);

    const safeQuantity =
        Number.isInteger(quantity) &&
        quantity >= 1
            ? Math.min(
                quantity,
                Math.max(availableStock, 1)
            )
            : 1;

    const productPriceLamports =
        unitPriceLamports * safeQuantity;

    const depositBps = Number(
        merchant?.sellerDepositBps ?? 1000
    );

    const calculatedDepositLamports =
        Math.floor(
            (
                productPriceLamports *
                depositBps
            ) / 10_000
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
    
        const stock = Number(item.stock ?? 0);
    
        if (stock <= 0) {
            alert("This product is out of stock.");
            return;
        }

        if (
            !Number.isInteger(quantity) ||
            quantity < 1
        ) {
            alert("Enter a valid quantity.");
            return;
        }
        
        if (quantity > stock) {
            alert(
                `Only ${stock} item${
                    stock === 1 ? "" : "s"
                } available.`
            );
            return;
        }
    
        const buyerAddress =
            wallet.publicKey.toBase58();
    
        const sellerAddress =
            merchant.authority?.toBase58?.() ??
            merchant.authority?.toString?.() ??
            merchant.authority;
    
        if (!sellerAddress) {
            alert(
                "Merchant wallet address is unavailable."
            );
            return;
        }
    
        if (buyerAddress === sellerAddress) {
            alert(
                "You cannot buy your own product."
            );
            return;
        }
    
        try {
            setBuying(true);
    
            /*
                * One wallet signing:
                *
                * 1. Create external escrow
                * 2. Deposit product price + buyer bond
                * 3. Create SolBazaar OrderRecord
                */
            const orderResult =
                await createBuyOrder({
                    connection,
                    wallet,
                    product: item,
                    merchant,
                    quantity,
                });
    
            console.log(
                "Order created:",
                orderResult
            );
    
            const escrowAddress =
                orderResult?.escrowPda;
    
            const orderRecordAddress =
                orderResult?.orderRecord;
    
            const signature =
                orderResult?.signature;
    
            if (!escrowAddress) {
                throw new Error(
                    "Escrow address was not returned."
                );
            }
    
            if (!orderRecordAddress) {
                throw new Error(
                    "Order record address was not returned."
                );
            }
    
            alert(
                `Order created successfully.\n\n` +
                `Escrow: ${escrowAddress}\n` +
                `Order Record: ${orderRecordAddress}\n` +
                `Transaction: ${signature}`
            );
    
            /*
                * Optional:
                * refresh product/order data after purchase.
                */
            if (typeof loadProduct === "function") {
                try {
                    await loadProduct();
                } catch (refreshError) {
                    console.error(
                        "Product refresh error:",
                        refreshError
                    );
                }
            }
        } catch (error) {
            console.error(
                "Buy now error:",
                error
            );
    
            const message =
                error?.error?.errorMessage ||
                error?.message ||
                "Failed to create escrow order.";
    
            alert(message);
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

                    {availableStock > 0 && (
                        <div
                            style={{
                                marginTop: 18,
                                marginBottom: 18,
                            }}
                        >
                            <strong>Quantity</strong>

                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginTop: 10,
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        setQuantity((current) =>
                                            Math.max(
                                                1,
                                                current - 1
                                            )
                                        )
                                    }
                                    disabled={
                                        buying ||
                                        quantity <= 1
                                    }
                                    style={{
                                        width: 42,
                                        height: 42,
                                        fontSize: 22,
                                        cursor:
                                            buying ||
                                            quantity <= 1
                                                ? "not-allowed"
                                                : "pointer",
                                    }}
                                >
                                    −
                                </button>

                                <input
                                    type="number"
                                    min="1"
                                    max={availableStock}
                                    step="1"
                                    value={quantity}
                                    disabled={buying}
                                    onChange={(event) => {
                                        const value =
                                            event.target.value;

                                        if (value === "") {
                                            setQuantity("");
                                            return;
                                        }

                                        const nextQuantity =
                                            Number(value);

                                        if (
                                            Number.isInteger(
                                                nextQuantity
                                            )
                                        ) {
                                            setQuantity(
                                                Math.min(
                                                    Math.max(
                                                        nextQuantity,
                                                        1
                                                    ),
                                                    availableStock
                                                )
                                            );
                                        }
                                    }}
                                    onBlur={() => {
                                        const parsed =
                                            Number(quantity);

                                        if (
                                            !Number.isInteger(parsed) ||
                                            parsed < 1
                                        ) {
                                            setQuantity(1);
                                        } else if (
                                            parsed >
                                            availableStock
                                        ) {
                                            setQuantity(
                                                availableStock
                                            );
                                        }
                                    }}
                                    style={{
                                        width: 80,
                                        height: 42,
                                        boxSizing:
                                            "border-box",
                                        textAlign: "center",
                                        fontSize: 18,
                                    }}
                                />

                                <button
                                    type="button"
                                    onClick={() =>
                                        setQuantity((current) =>
                                            Math.min(
                                                Number(current) + 1,
                                                availableStock
                                            )
                                        )
                                    }
                                    disabled={
                                        buying ||
                                        Number(quantity) >=
                                            availableStock
                                    }
                                    style={{
                                        width: 42,
                                        height: 42,
                                        fontSize: 22,
                                        cursor:
                                            buying ||
                                            Number(quantity) >=
                                                availableStock
                                                ? "not-allowed"
                                                : "pointer",
                                    }}
                                >
                                    +
                                </button>

                                <span
                                    style={{
                                        marginLeft: 6,
                                        color: "#666",
                                        fontSize: 14,
                                    }}
                                >
                                    {availableStock} available
                                </span>
                            </div>
                        </div>
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

                            <SellerReputation
                                merchantAuthority={
                                    merchant.authority
                                }
                            />

                        </>

                    )}

                        {merchant && (
                            <div
                                style={{
                                    marginTop: 20,
                                    padding: 14,
                                    border:
                                        "1px solid #ddd",
                                    borderRadius: 10,
                                }}
                            >
                                <p>
                                    <strong>
                                        Price per item:
                                    </strong>{" "}
                                    {(
                                        unitPriceLamports /
                                        LAMPORTS_PER_SOL
                                    ).toFixed(4)}{" "}
                                    SOL
                                </p>

                                <p>
                                    <strong>
                                        Quantity:
                                    </strong>{" "}
                                    {safeQuantity}
                                </p>

                                <p>
                                    <strong>
                                        Product total:
                                    </strong>{" "}
                                    {(
                                        productPriceLamports /
                                        LAMPORTS_PER_SOL
                                    ).toFixed(4)}{" "}
                                    SOL
                                </p>

                                <p>
                                    <strong>
                                        Refundable Security
                                        Deposit:
                                    </strong>{" "}
                                    {(
                                        securityDepositLamports /
                                        LAMPORTS_PER_SOL
                                    ).toFixed(9)}{" "}
                                    SOL
                                </p>

                                <p
                                    style={{
                                        fontSize: 18,
                                        marginBottom: 10,
                                    }}
                                >
                                    <strong>
                                        Total Buyer Deposit:
                                    </strong>{" "}
                                    {(
                                        buyerTotalLamports /
                                        LAMPORTS_PER_SOL
                                    ).toFixed(9)}{" "}
                                    SOL
                                </p>

                                <p>
                                    <strong>
                                        Security Deposit Rate:
                                    </strong>{" "}
                                    {(depositBps / 100).toFixed(1)}
                                    %
                                </p>

                                <small>
                                    Your refundable security
                                    deposit will be returned when
                                    you confirm receipt and approve
                                    the escrow release.
                                </small>
                            </div>
                        )}

                <button
                    onClick={buyNow}
                    disabled={
                        availableStock <= 0 ||
                        buying ||
                        !merchant ||
                        !Number.isInteger(
                            Number(quantity)
                        ) ||
                        Number(quantity) < 1 ||
                        Number(quantity) >
                            availableStock
                    }
                    style={{
                        marginTop: 20,
                        padding: "12px 30px",
                        fontSize: 18,
                        cursor:
                            availableStock <= 0 ||
                            buying ||
                            !merchant
                                ? "not-allowed"
                                : "pointer",
                        opacity:
                            availableStock <= 0 ||
                            buying ||
                            !merchant
                                ? 0.5
                                : 1,
                    }}
                >
                    {availableStock <= 0
                        ? "Out of Stock"
                        : buying
                        ? "Creating Order..."
                        : `Buy ${safeQuantity} ${
                                safeQuantity === 1
                                    ? "Item"
                                    : "Items"
                            }`}
                </button>

                </div>

            </div>

            <ProductReviews
                product={
                    item.publicKey ||
                    product
                }
            />

        </div>
    );
}