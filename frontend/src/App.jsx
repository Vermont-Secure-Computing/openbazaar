import { NavLink, Routes, Route, Link } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import Home from "./pages/Home";
import SellerPage from "./pages/SellerPage";
import Dashboard from "./pages/Dashboard";
import MerchantPage from "./pages/MerchantPage";
import ProductPage from "./pages/ProductPage";
import OrdersPage from "./pages/OrdersPage";
import OrderDetailsPage from "./pages/OrderDetailsPage";
import OrderNotificationBadge from "./components/OrderNotificationBadge";

import "./App.css";

function App() {
    return (
        <div className="app">
           <header className="app-header">
                <div className="app-header-inner">
                    <NavLink to="/" className="app-logo">SolBazaar</NavLink>

                    <nav className="app-nav">
                        <NavLink
                            to="/"
                            end
                            className={({ isActive }) =>
                                `app-nav-link${isActive ? " active" : ""}`
                            }
                        >
                            Marketplace
                        </NavLink>

                        <NavLink
                            to="/dashboard"
                            className={({ isActive }) =>
                                `app-nav-link${isActive ? " active" : ""}`
                            }
                        >
                            Dashboard
                        </NavLink>

                        <NavLink
                            to="/orders"
                            className={({ isActive }) =>
                                `app-nav-link app-orders-link${isActive ? " active" : ""}`
                            }
                        >
                            Orders
                            <OrderNotificationBadge />
                        </NavLink>
                    </nav>

                    <div className="app-actions">
                        <NavLink to="/seller" className="app-seller-link">
                            Become a Seller
                        </NavLink>
                        <WalletMultiButton />
                    </div>
                </div>
            </header>

            <div className="app-shell">
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
        </div>
    );
}

export default App;