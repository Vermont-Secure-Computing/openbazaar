import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { escrowIdl, solBazaarIdl } from "../idl";

export async function createBuyOrder({
    connection,
    wallet,
    product,
    merchant,
    quantity = 1,
}) {
    if (!wallet.publicKey) { throw new Error("Connect wallet first."); }

    if (!product || !merchant) {
        throw new Error("Product or merchant information is unavailable.");
    }

    const quantityNumber = Number(quantity);

    if ( !Number.isInteger(quantityNumber) || quantityNumber <= 0) {
        throw new Error("Invalid quantity.");
    }

    const provider = new AnchorProvider(
        connection,
        wallet,
        {
            commitment: "confirmed",
        }
    );

    const escrowProgram = new Program(
        escrowIdl,
        provider
    );

    const solBazaarProgram = new Program(
        solBazaarIdl,
        provider
    );

    const buyer = wallet.publicKey;
    const seller = new PublicKey( merchant.authority );

    const productPda = new PublicKey( product.publicKey );
    const unitPriceLamports = new BN(product.price.toString());
    const totalPriceLamports = unitPriceLamports.mul(new BN(quantityNumber));

    const depositBps = new BN(String(merchant.sellerDepositBps ?? 1000 ));

    if (depositBps.isNeg() || depositBps.gt(new BN(10_000))) {
        throw new Error("Invalid merchant deposit rate.");
    }

    let securityDepositLamports = totalPriceLamports.mul(depositBps).div(new BN(10_000));

    if (securityDepositLamports.isZero()) { securityDepositLamports = new BN(1); }

    const buyerRequiredDeposit = totalPriceLamports.add(securityDepositLamports);
    const sellerRequiredDeposit = securityDepositLamports;

    // Timestamp plus a small random suffix reduces
    // the chance of duplicate escrow IDs.
    const timestamp = BigInt(Date.now());
    const randomPart = BigInt(Math.floor(Math.random() * 1000));

    const escrowId = new BN(
        (
            timestamp * 1000n +
            randomPart
        ).toString()
    );

    const [escrowPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("escrow"),
            buyer.toBuffer(),
            escrowId.toArrayLike(
                Buffer,
                "le",
                8
            ),
        ],
        escrowProgram.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("vault"),
            escrowPda.toBuffer(),
        ],
        escrowProgram.programId
    );

    const [merchantProfilePda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("merchant"),
            seller.toBuffer(),
        ],
        solBazaarProgram.programId
    );

    const [orderRecordPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("order"),
            escrowPda.toBuffer(),
        ],
        solBazaarProgram.programId
    );

    const note = JSON.stringify({
        marketplace: "solbazaar",
        product: productPda.toBase58(),
        seller: seller.toBase58(),
        quantity: quantityNumber,
    });

    if (new TextEncoder().encode(note).length > 200) {
        throw new Error("Escrow note is too long.");
    }

    const createEscrowInstruction = await escrowProgram.methods
        .createEscrow(
            escrowId,
            1,
            buyer,
            seller,
            totalPriceLamports,
            buyerRequiredDeposit,
            sellerRequiredDeposit,
            note
        )
        .accounts({
            creator: buyer,
            escrow: escrowPda,
            vault: vaultPda,
            systemProgram:
                SystemProgram.programId,
        })
        .instruction();

    const depositInstruction = await escrowProgram.methods
        .deposit(
            buyerRequiredDeposit
        )
        .accounts({
            depositor: buyer,
            escrow: escrowPda,
            vault: vaultPda,
            systemProgram:
                SystemProgram.programId,
        })
        .instruction();

    const createOrderRecordInstruction = await solBazaarProgram.methods
        .createOrderRecord(quantityNumber)
        .accounts({
            buyer,
            escrow: escrowPda,
            product: productPda,
            merchantProfile:
                merchantProfilePda,
            orderRecord:
                orderRecordPda,
            systemProgram:
                SystemProgram.programId,
        })
        .instruction();

    const transaction = new Transaction().add(
        createEscrowInstruction,
        depositInstruction,
        createOrderRecordInstruction
    );

    transaction.feePayer = buyer;

    const latestBlockhash = await connection.getLatestBlockhash("confirmed");

    transaction.recentBlockhash = latestBlockhash.blockhash;

    if (!wallet.signTransaction) {
        throw new Error("Connected wallet does not support signTransaction.");
    }

    let signedTransaction;

    try {
        signedTransaction = await wallet.signTransaction(transaction);

        console.log("Transaction signed successfully.");
    } catch (error) {
        console.error("Transaction signing failed:", error);
        throw error;
    }

    let signature;

    try {
        signature = await connection.sendRawTransaction(
            signedTransaction.serialize(),
            {
                skipPreflight: false,
                preflightCommitment:
                    "confirmed",
                maxRetries: 3,
            }
        );

        console.log("Transaction submitted:", signature);
    } catch (error) {
        console.error("RPC submission failed:", error);
        console.error("RPC error message:", error?.message);
        console.error("RPC logs:",  error?.logs);

        throw error;
    }

    const confirmation =
        await connection.confirmTransaction(
            {
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash .lastValidBlockHeight,
            },
            "confirmed"
        );

    if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return {
        signature,
        escrowId: escrowId.toString(),
        escrowPda: escrowPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        orderRecord: orderRecordPda.toBase58(),
        totalPriceLamports: totalPriceLamports.toString(),
        securityDepositLamports: securityDepositLamports.toString(),
        buyerRequiredDeposit: buyerRequiredDeposit.toString(),
        sellerRequiredDeposit: sellerRequiredDeposit.toString(),
    };
}