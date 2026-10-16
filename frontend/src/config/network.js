const network = import.meta.env.VITE_NETWORK || "devnet";

const isMainnet = network === "mainnet";
const isDevnet = network === "devnet";
const isLocalnet = network === "localnet";

const defaultRpcUrls = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://solzaar.com/rpc",
};

const networkNames = {
  localnet: "Solana Localnet",
  devnet: "Solana Devnet",
  mainnet: "Solana Mainnet",
};

const explorerClusters = {
  localnet: "custom",
  devnet: "devnet",
  mainnet: "mainnet",
};

if (!defaultRpcUrls[network]) {
  throw new Error(`Unsupported Solana network: ${network}`);
}

export const NETWORK_CONFIG = {
  network,

  networkName: import.meta.env.VITE_NETWORK_NAME || networkNames[network],

  defaultRpcUrl:
    import.meta.env.VITE_DEFAULT_RPC_URL || defaultRpcUrls[network],

  explorerCluster:
    import.meta.env.VITE_EXPLORER_CLUSTER || explorerClusters[network],

  isMainnet,
  isDevnet,
  isLocalnet,
};

export function getRpcStorageKey() {
  return `solzaar:${NETWORK_CONFIG.network}:customRpcUrl`;
}

export function getLastWorkingRpcStorageKey() {
  return `solzaar:${NETWORK_CONFIG.network}:lastWorkingRpc`;
}
