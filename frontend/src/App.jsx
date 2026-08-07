import { useState } from "react";
import { Routes, Route } from "react-router-dom";

import AppHeader from "./components/AppHeader";
import NetworkSettingsModal from "./components/NetworkSettingsModal";

import Home from "./pages/Home";
import SellerPage from "./pages/SellerPage";
import Dashboard from "./pages/Dashboard";
import MerchantPage from "./pages/MerchantPage";
import ProductPage from "./pages/ProductPage";
import OrdersPage from "./pages/OrdersPage";
import OrderDetailsPage from "./pages/OrderDetailsPage";
import InstructionsPage from "./pages/InstructionsPage";
import Footer from "./pages/Footer";

import "./App.css";
import DisclaimerModal from "./components/DisclaimerModal";

function App() {
    const [networkSettingsOpen, setNetworkSettingsOpen] = useState(false);

    return (
        <div className="app">
            <AppHeader
                onOpenNetworkSettings={() => setNetworkSettingsOpen(true)}
            />

            <main className="app-shell">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/seller" element={<SellerPage />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route
                        path="/merchant/:merchant"
                        element={<MerchantPage />}
                    />
                    <Route
                        path="/product/:product"
                        element={<ProductPage />}
                    />
                    <Route path="/orders" element={<OrdersPage />} />
                    <Route
                        path="/orders/:role/:escrowAddress"
                        element={<OrderDetailsPage />}
                    />
                    <Route
                        path="/instructions"
                        element={<InstructionsPage />}
                    />
                </Routes>
            </main>

            <Footer />

            <DisclaimerModal />

            <NetworkSettingsModal
                open={networkSettingsOpen}
                onClose={() => setNetworkSettingsOpen(false)}
            />
        </div>
    );
}

export default App;