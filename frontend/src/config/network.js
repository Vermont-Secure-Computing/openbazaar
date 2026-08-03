const network = import.meta.env.VITE_NETWORK || "devnet";

const isMainnet = network === "mainnet";

export const NETWORK_CONFIG = {
    network,
    networkName:
        import.meta.env.VITE_NETWORK_NAME ||
        (isMainnet
            ? "Solana Mainnet"
            : "Solana Devnet"),

    defaultRpcUrl:
        import.meta.env.VITE_DEFAULT_RPC_URL ||
        (isMainnet
            ? "https://api.mainnet-beta.solana.com"
            : "https://api.devnet.solana.com"),

    explorerCluster:
        import.meta.env.VITE_EXPLORER_CLUSTER ||
        (isMainnet ? "mainnet" : "devnet"),

    isMainnet,
    isDevnet: !isMainnet,
};

export function getRpcStorageKey() {
    return `solzaar:${NETWORK_CONFIG.network}:customRpcUrl`;
}

export function getLastWorkingRpcStorageKey() {
    return `solzaar:${NETWORK_CONFIG.network}:lastWorkingRpc`;
}