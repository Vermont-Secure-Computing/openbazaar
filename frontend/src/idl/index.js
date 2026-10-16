import localnetSolBazaarIdl from "./localnet/sol_bazaar.json";
import localnetEscrowIdl from "./localnet/sol_shop_escrow.json";

import devnetSolBazaarIdl from "./devnet/sol_bazaar.json";
import devnetEscrowIdl from "./devnet/sol_shop_escrow.json";

import mainnetSolBazaarIdl from "./mainnet/sol_bazaar.json";
import mainnetEscrowIdl from "./mainnet/sol_shop_escrow.json";

import { NETWORK_CONFIG } from "../config/network";

const idls = {
    localnet: {
        solBazaar: localnetSolBazaarIdl,
        escrow: localnetEscrowIdl,
    },
    devnet: {
        solBazaar: devnetSolBazaarIdl,
        escrow: devnetEscrowIdl,
    },
    mainnet: {
        solBazaar: mainnetSolBazaarIdl,
        escrow: mainnetEscrowIdl,
    },
};

const selectedIdls = idls[NETWORK_CONFIG.network];

if (!selectedIdls) {
    throw new Error(
        `Unsupported Solana network: ${NETWORK_CONFIG.network}`
    );
}

export const solBazaarIdl = selectedIdls.solBazaar;
export const escrowIdl = selectedIdls.escrow;