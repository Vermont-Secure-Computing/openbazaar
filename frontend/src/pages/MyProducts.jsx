import { useEffect, useState } from "react";
import { getProductsByMerchant } from "../lib/product";
import EditProduct from "./EditProduct";

export default function MyProducts({ merchant }) {
    const [products, setProducts] = useState([]);

    const load = async () => {
        const myProducts = await getProductsByMerchant(merchant);
        setProducts(myProducts);
    };

    useEffect(() => {
        load();
    }, [merchant]);

    return (
        <div>
            <h2>My Products</h2>

            {products.length === 0 && <p>No products yet.</p>}

            {products.map((product) => (
                <EditProduct
                    key={product.publicKey}
                    product={product}
                    onUpdated={load}
                />
            ))}
        </div>
    );
}