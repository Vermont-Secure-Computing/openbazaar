import { createContext, useContext, useMemo, useState } from "react";
import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { NETWORK_CONFIG, getRpcStorageKey, getLastWorkingRpcStorageKey,} from "../config/network";

const NetworkContext = createContext(null);
export const NETWORK = NETWORK_CONFIG.network;
export const NETWORK_NAME = NETWORK_CONFIG.networkName;
export const DEFAULT_RPC_URL = NETWORK_CONFIG.defaultRpcUrl;
export const FALLBACK_RPC_URLS = NETWORK_CONFIG.isMainnet ? 
    [
        "https://api.mainnet-beta.solana.com",
    ]
    : 
    [
        "https://api.devnet.solana.com",
    ];

function getInitialRpcUrl() {
    return ( localStorage.getItem( getRpcStorageKey() ) ||
        localStorage.getItem(getLastWorkingRpcStorageKey()) ||
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

        localStorage.setItem(getRpcStorageKey(), nextRpcUrl);
        localStorage.setItem(getLastWorkingRpcStorageKey(), nextRpcUrl);
        setRpcUrlState(nextRpcUrl);
    };

    const resetRpcUrl = () => {
        localStorage.removeItem(getRpcStorageKey());
        localStorage.removeItem(getLastWorkingRpcStorageKey());
        setRpcUrlState(DEFAULT_RPC_URL);
    };

    const value = useMemo(
        () => ({
            rpcUrl,
            setRpcUrl,
            resetRpcUrl,
            network: NETWORK,
            networkName: NETWORK_NAME,
            defaultRpcUrl: DEFAULT_RPC_URL,
            fallbackRpcUrls: FALLBACK_RPC_URLS,
            isMainnet: NETWORK_CONFIG.isMainnet,
            isDevnet: NETWORK_CONFIG.isDevnet,
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