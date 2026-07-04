import { Routes, Route, Link } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import MerchantPage from "./pages/MerchantPage";
import ProductPage from "./pages/ProductPage";

function App() {
    return (
        <div>
            <nav style={{ padding: 20, display: "flex", gap: 16, alignItems: "center" }}>
                <Link to="/">SolBazaar</Link>
                <Link to="/dashboard">Dashboard</Link>
                <div style={{ marginLeft: "auto" }}>
                    <WalletMultiButton />
                </div>
            </nav>

            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/merchant/:merchant" element={<MerchantPage />} />
                <Route path="/product/:product" element={<ProductPage />} />
            </Routes>
        </div>
    );
}

export default App;