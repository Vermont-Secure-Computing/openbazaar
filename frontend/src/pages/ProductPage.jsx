import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import { getProduct } from "../lib/product";
import { getMerchants } from "../lib/merchant";

export default function ProductPage() {

    const { product } = useParams();

    const [item, setItem] = useState(null);
    const [merchant, setMerchant] = useState(null);

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
                        ₱ {item.price}
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

                                <br />

                                {merchant.storeName}

                            </p>

                            <p>

                                {merchant.location}

                            </p>

                        </>

                    )}

                    <button
                        style={{
                            marginTop: 20,
                            padding: "12px 30px",
                            fontSize: 18,
                            cursor: "pointer",
                        }}
                    >
                        Buy Now
                    </button>

                </div>

            </div>

        </div>
    );
}