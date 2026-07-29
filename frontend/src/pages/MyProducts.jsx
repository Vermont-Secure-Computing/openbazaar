import { useCallback, useEffect, useState } from "react";
import { getProductsByMerchant } from "../lib/product";
import EditProduct from "./EditProduct";

export default function MyProducts({ merchant }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!merchant) {
            setProducts([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError("");

            const myProducts =
                await getProductsByMerchant(merchant);

            setProducts(myProducts || []);
        } catch (loadError) {
            console.error(
                "Failed to load products:",
                loadError
            );

            setError(
                loadError?.message ||
                    "Failed to load products."
            );

            setProducts([]);
        } finally {
            setLoading(false);
        }
    }, [merchant]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div>
            <h2>My Products</h2>

            {loading && <p>Loading products...</p>}

            {!loading && error && (
                <p style={{ color: "#dc2626" }}>
                    {error}
                </p>
            )}

            {!loading &&
                !error &&
                products.length === 0 && (
                    <p>No products yet.</p>
                )}

            {!loading &&
                !error &&
                products.map((product) => (
                    <EditProduct
                        key={product.publicKey.toString()}
                        product={product}
                        onUpdated={load}
                    />
                ))}
        </div>
    );
}