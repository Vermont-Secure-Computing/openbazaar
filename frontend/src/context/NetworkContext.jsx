import { createContext, useContext, useMemo, useState } from "react";
import { ConnectionProvider } from "@solana/wallet-adapter-react";

const NetworkContext = createContext(null);

export const DEFAULT_RPC_URL = "https://api.devnet.solana.com"

export const FALLBACK_RPC_URLS = [
    DEFAULT_RPC_URL,
];

function getInitialRpcUrl() {
    return (
        localStorage.getItem("customRpcUrl") ||
        localStorage.getItem("lastWorkingRpc") ||
        DEFAULT_RPC_URL
    );
}

export function NetworkProvider({ children }) {
    const [rpcUrl, setRpcUrlState] = useState(getInitialRpcUrl);

    const setRpcUrl = value => {
        const nextRpcUrl = String(value || "").trim();

        if (!nextRpcUrl) {
            return;
        }

        localStorage.setItem("customRpcUrl", nextRpcUrl);
        localStorage.setItem("lastWorkingRpc", nextRpcUrl);
        setRpcUrlState(nextRpcUrl);
    };

    const resetRpcUrl = () => {
        localStorage.removeItem("customRpcUrl");
        localStorage.removeItem("lastWorkingRpc");
        setRpcUrlState(DEFAULT_RPC_URL);
    };

    const value = useMemo(
        () => ({
            rpcUrl,
            setRpcUrl,
            resetRpcUrl,
            defaultRpcUrl: DEFAULT_RPC_URL,
            fallbackRpcUrls: FALLBACK_RPC_URLS,
        }),
        [rpcUrl]
    );

    return (
        <NetworkContext.Provider value={value}>
            <ConnectionProvider endpoint={rpcUrl}>
                {children}
            </ConnectionProvider>
        </NetworkContext.Provider>
    );
}

export function useNetwork() {
    const context = useContext(NetworkContext);

    if (!context) {
        throw new Error("useNetwork must be used inside NetworkProvider");
    }

    return context;
}