import { Routes, Route, Link } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import Home from "./pages/Home";
import SellerPage from "./pages/SellerPage";
import Dashboard from "./pages/Dashboard";
import MerchantPage from "./pages/MerchantPage";
import ProductPage from "./pages/ProductPage";
import OrdersPage from "./pages/OrdersPage";
import OrderDetailsPage from "./pages/OrderDetailsPage";
import OrderNotificationBadge from "./components/OrderNotificationBadge";

function App() {
    return (
        <div>
            <header
                style={{
                    padding: "16px 24px",
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    borderBottom: "1px solid #eee",
                }}
            >
                <Link to="/" style={{ fontWeight: "bold", fontSize: 22 }}>
                    SolBazaar
                </Link>

                <Link to="/">Marketplace</Link>

                <Link
                    to="/seller"
                    style={{
                        marginLeft: "auto",
                        padding: "10px 16px",
                        border: "1px solid #ddd",
                        borderRadius: 8,
                        textDecoration: "none",
                    }}
                >
                    Become a Seller
                </Link>

                <Link to="/dashboard">Dashboard</Link>

                <Link
                    to="/orders"
                    style={{
                        position: "relative",
                        display: "inline-block",
                        textDecoration: "none",
                    }}
                >
                    Orders
                    <OrderNotificationBadge />
                </Link>

                <WalletMultiButton />
            </header>

            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/seller" element={<SellerPage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/merchant/:merchant" element={<MerchantPage />} />
                <Route path="/product/:product" element={<ProductPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/orders/:role/:escrowAddress" element={<OrderDetailsPage />} />
            </Routes>
        </div>
    );
}

export default App;