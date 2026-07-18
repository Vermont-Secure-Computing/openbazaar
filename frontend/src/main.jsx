import { Buffer } from "buffer";
window.Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";

import {
    ConnectionProvider,
    WalletProvider,
} from "@solana/wallet-adapter-react";

import {
    WalletModalProvider,
} from "@solana/wallet-adapter-react-ui";

import {
    PhantomWalletAdapter,
} from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";
import "./components/review.css";

import App from "./App";

const endpoint = "https://devnet.helius-rpc.com/?api-key=7656b607-68f1-48f5-9636-ba3e9118125d";

const wallets = [new PhantomWalletAdapter()];

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <BrowserRouter>
            <ConnectionProvider endpoint={endpoint}>
                <WalletProvider wallets={wallets} autoConnect>
                    <WalletModalProvider>
                        <App />
                    </WalletModalProvider>
                </WalletProvider>
            </ConnectionProvider>
        </BrowserRouter>
    </React.StrictMode>
);