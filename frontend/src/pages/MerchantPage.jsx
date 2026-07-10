import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getMerchants } from "../lib/merchant";
import { getProductsByMerchant } from "../lib/product";

export default function MerchantPage() {
    const { merchant } = useParams();

    const [store, setStore] = useState(null);
    const [products, setProducts] = useState([]);

    useEffect(() => {
        async function load() {

            const merchants = await getMerchants();

            const currentMerchant = merchants.find(
                (m) => m.authority === merchant
            );

            setStore(currentMerchant);

            const merchantProducts =
                await getProductsByMerchant(merchant);

            setProducts(merchantProducts);
        }

        load();
    }, [merchant]);

    if (!store) {
        return (
            <div style={{ padding: 24 }}>
                <h2>Loading merchant...</h2>
            </div>
        );
    }

    return (
        <div style={{ padding: 24 }}>

            {store.bannerUri && (
                <img
                    src={store.bannerUri}
                    alt={store.storeName}
                    style={{
                        width: "100%",
                        maxHeight: 260,
                        objectFit: "cover",
                        borderRadius: 12,
                    }}
                />
            )}

            <div style={{ marginTop: 20 }}>

                {store.logoUri && (
                    <img
                        src={store.logoUri}
                        alt={store.storeName}
                        style={{
                            width: 120,
                            height: 120,
                            borderRadius: "50%",
                            objectFit: "cover",
                        }}
                    />
                )}

                <h1>{store.storeName}</h1>

                <p>{store.descriptionUri}</p>

                <p>{store.location}</p>

                <hr />

                <h2>Products</h2>

                {products.length === 0 && (
                    <p>No products yet.</p>
                )}

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fill,minmax(250px,1fr))",
                        gap: 20,
                    }}
                >
                    {products.map((product) => (
                        <Link
                            key={product.publicKey}
                            to={`/product/${product.publicKey}`}
                            style={{
                                textDecoration: "none",
                                color: "inherit",
                            }}
                        >
                            <div
                                style={{
                                    border: "1px solid #ddd",
                                    borderRadius: 12,
                                    overflow: "hidden",
                                }}
                            >
                                {product.imageUri && (
                                    <img
                                        src={product.imageUri}
                                        alt={product.title}
                                        style={{
                                            width: "100%",
                                            height: 180,
                                            objectFit: "cover",
                                        }}
                                    />
                                )}

                                <div style={{ padding: 16 }}>
                                    <h3>{product.title}</h3>

                                    <p>{product.category}</p>

                                    <strong>
                                        {(
                                            Number(product.price) / LAMPORTS_PER_SOL
                                        ).toFixed(3)} SOL
                                    </strong>

                                    <br />

                                    <small>
                                        Available:
                                        {" "}
                                        {product.stock}
                                    </small>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

            </div>

        </div>
    );
}