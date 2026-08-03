import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { solBazaarIdl as idl } from "../idl";
import { DEFAULT_RPC_URL } from "../context/NetworkContext";
import { getRpcStorageKey, getLastWorkingRpcStorageKey } from "../config/network";

export function getRpcUrl() {
    return (localStorage.getItem(getRpcStorageKey()) ||
        localStorage.getItem(getLastWorkingRpcStorageKey()) ||
        DEFAULT_RPC_URL
    );
}

export function getConnection(rpcUrl = getRpcUrl()) {
    return new Connection(rpcUrl, "confirmed");
}

function getReadOnlyWallet() {
    return {
        publicKey: null,
        signTransaction: async transaction => transaction,
        signAllTransactions: async transactions => transactions,
    };
}

export function getReadOnlyProgram(rpcUrl = getRpcUrl()) {
    const connection = getConnection(rpcUrl);

    const provider = new AnchorProvider(connection, getReadOnlyWallet(),
        {
            commitment: "confirmed",
        }
    );

    return new Program(idl, provider);
}

export function getProgram( wallet, connection, rpcUrl) {
    const programConnection = connection || getConnection(rpcUrl || getRpcUrl());

    const provider = new AnchorProvider(programConnection, wallet,
        {
            commitment: "confirmed",
        }
    );

    return new Program(idl, provider);
}