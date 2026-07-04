import { useEffect, useState } from "react";
import { program } from "../lib/anchor";

export default function ProductList() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadProducts = async () => {
        try {
            setLoading(true);

            const rawAccounts =
                await program.provider.connection.getProgramAccounts(
                    program.programId
                );

            const decodedProducts = [];

            for (const item of rawAccounts) {
                try {
        const product = program.coder.accounts.decode(
            "product",
            item.account.data
        );

        console.log("Decoded product:", product);

        decodedProducts.push({
            publicKey: item.pubkey.toBase58(),
            merchant: product.merchant.toBase58(),
            productId: product.productId.toString(),
            title: product.title,
            description: product.descriptionUri,
            imageUri: product.imageUri,
            category: product.category,
            price: product.price.toString(),
            stock: product.stock,
            sold: product.sold,
            active: product.active,
            deleted: product.deleted,
            updatedAt: product.updatedAt.toString(),
        });
    } catch {
                    // ignore MerchantProfile and old incompatible accounts
                }
            }

            setProducts(decodedProducts);
        } catch (err) {
            console.error("Product list error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProducts();
    }, []);

    const visibleProducts = products.filter((p) => !p.deleted);

    return (
        <div style={{ padding: 24 }}>
            <h1>Product List</h1>

            <button onClick={loadProducts}>Refresh Products</button>

            {loading && <p>Loading products...</p>}

            {!loading && visibleProducts.length === 0 && (
                <p>No products yet.</p>
            )}

            <div style={{ display: "grid", gap: 16 }}>
                {visibleProducts.map((product) => (
                    <div
                        key={product.publicKey}
                        style={{
                            border: "1px solid #ddd",
                            padding: 16,
                            borderRadius: 12,
                            maxWidth: 420,
                        }}
                    >
                        {product.imageUri && (
                            <img
                                src={product.imageUri}
                                alt={product.title}
                                style={{
                                    width: "100%",
                                    maxHeight: 220,
                                    objectFit: "cover",
                                    borderRadius: 8,
                                }}
                            />
                        )}

                        <h2>{product.title}</h2>
                        <p>{product.description}</p>
                        <p>Category: {product.category}</p>
                        <p>Price: {product.price}</p>
                        <p>Available: {product.stock}</p>
                        <p>Sold: {product.sold}</p>
                        <small>Merchant: {product.merchant}</small>
                    </div>
                ))}
            </div>
        </div>
    );
}