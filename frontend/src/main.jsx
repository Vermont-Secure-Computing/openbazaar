import { Buffer } from "buffer";
window.Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";
import "./components/review.css";

import App from "./App";
import { ThemeProvider } from "./context/themeContext";
import { NetworkProvider } from "./context/NetworkContext";

const wallets = [new PhantomWalletAdapter()];

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <BrowserRouter>
            <ThemeProvider>
                <NetworkProvider>
                    <WalletProvider wallets={wallets} autoConnect>
                        <WalletModalProvider>
                            <App />
                        </WalletModalProvider>
                    </WalletProvider>
                </NetworkProvider>
            </ThemeProvider>
        </BrowserRouter>
    </React.StrictMode>
);