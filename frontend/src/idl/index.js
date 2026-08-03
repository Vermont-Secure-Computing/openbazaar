import devnetSolBazaarIdl from "./devnet/sol_bazaar.json";
import devnetEscrowIdl from "./devnet/sol_shop_escrow.json";

import mainnetSolBazaarIdl from "./mainnet/sol_bazaar.json";
import mainnetEscrowIdl from "./mainnet/sol_shop_escrow.json";

import { NETWORK_CONFIG } from "../config/network";

export const solBazaarIdl = NETWORK_CONFIG.isMainnet ? mainnetSolBazaarIdl : devnetSolBazaarIdl;
export const escrowIdl = NETWORK_CONFIG.isMainnet ? mainnetEscrowIdl : devnetEscrowIdl;