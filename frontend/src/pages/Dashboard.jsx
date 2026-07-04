import CreateMerchant from "./CreateMerchant";
import CreateProduct from "./CreateProduct";
import ProductList from "./ProductList";

export default function Dashboard() {
    return (
        <div>
            <h1 style={{ padding: 20 }}>Merchant Dashboard</h1>

            <CreateMerchant />
            <CreateProduct />
            <ProductList />
        </div>
    );
}