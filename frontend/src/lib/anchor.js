import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import idl from "../idl/sol_bazaar.json";

const connection = new Connection("https://devnet.helius-rpc.com/?api-key=7656b607-68f1-48f5-9636-ba3e9118125d", "confirmed");

// Read-only provider
const provider = new AnchorProvider(
    connection,
    {
        publicKey: null,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
    },
    {
        commitment: "confirmed",
    }
);

export const program = new Program(idl, provider);