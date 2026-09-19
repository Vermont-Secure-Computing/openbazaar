import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const RPC_URL = "http://127.0.0.1:8899";

export async function fundWallet(address, sol = 100) {
    const connection = new Connection(
        RPC_URL,
        "confirmed"
    );

    const publicKey = new PublicKey(address);

    const before = await connection.getBalance(publicKey);

    console.log(
        `Balance before: ${before / LAMPORTS_PER_SOL} SOL`
    );

    if (before >= 10 * LAMPORTS_PER_SOL) {
        console.log("✓ Wallet already funded");
        return;
    }

    console.log(
        `Airdropping ${sol} SOL to ${address}...`
    );

    const signature = await connection.requestAirdrop(
        publicKey,
        sol * LAMPORTS_PER_SOL
    );

    const latest = await connection.getLatestBlockhash();

    await connection.confirmTransaction(
        {
            signature,
            blockhash: latest.blockhash,
            lastValidBlockHeight:
                latest.lastValidBlockHeight,
        },
        "confirmed"
    );

    const after = await connection.getBalance(publicKey);

    console.log(
        `Balance after: ${after / LAMPORTS_PER_SOL} SOL`
    );

    if (after < 10 * LAMPORTS_PER_SOL) {
        throw new Error(
            `Burner Wallet funding failed: ${after / LAMPORTS_PER_SOL} SOL`
        );
    }

    console.log("✓ Burner Wallet funded");
}
