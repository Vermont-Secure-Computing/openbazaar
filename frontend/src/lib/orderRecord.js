import { AnchorProvider, Program } from "@coral-xyz/anchor";

import { PublicKey, SystemProgram,} from "@solana/web3.js";

import { solBazaarIdl as idl } from "../idl/sol_bazaar.json";

function getProgram(connection, wallet) {
    const provider = new AnchorProvider(
        connection,
        wallet,
        {
            commitment: "confirmed",
        }
    );

    return new Program(idl, provider);
}

export function deriveOrderRecordPda({
    escrowAddress,
    programId,
}) {
    const escrowPublicKey = new PublicKey(escrowAddress);

    return PublicKey.findProgramAddressSync(
        [
            Buffer.from("order"),
            escrowPublicKey.toBuffer(),
        ],
        programId
    );
}

export async function createOrderRecord({
    connection,
    wallet,
    escrowAddress,
    productAddress,
    merchantAuthority,
    quantity,
}) {
    if (!wallet.publicKey) {
        throw new Error("Connect wallet first.");
    }

    const quantityNumber = Number(quantity);

    if (
        !Number.isInteger(quantityNumber) ||
        quantityNumber <= 0
    ) {
        throw new Error("Invalid order quantity.");
    }

    const program = getProgram(
        connection,
        wallet
    );

    const escrowPublicKey = new PublicKey(escrowAddress);
    const productPublicKey = new PublicKey(productAddress);
    const merchantPublicKey = new PublicKey(merchantAuthority);

    const [merchantProfilePda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("merchant"),
                merchantPublicKey.toBuffer(),
            ],
            program.programId
        );

    const [orderRecordPda] =
        deriveOrderRecordPda({
            escrowAddress,
            programId: program.programId,
        });

    const signature = await program.methods
        .createOrderRecord(quantityNumber)
        .accounts({
            buyer: wallet.publicKey,
            escrow: escrowPublicKey,
            product: productPublicKey,
            merchantProfile: merchantProfilePda,
            orderRecord: orderRecordPda,
            systemProgram:
                SystemProgram.programId,
        })
        .rpc();

    return {
        signature,
        orderRecord:
            orderRecordPda.toBase58(),
    };
}

export async function getOrderRecord({
    connection,
    wallet,
    escrowAddress,
}) {
    const program = getProgram(
        connection,
        wallet
    );

    const [orderRecordPda] =
        deriveOrderRecordPda({
            escrowAddress,
            programId: program.programId,
        });

    try {
        const account =
            await program.account.orderRecord.fetch(
                orderRecordPda
            );

        return {
            publicKey: orderRecordPda.toBase58(),
            escrow: account.escrow.toBase58(),
            product: account.product.toBase58(),
            buyer: account.buyer.toBase58(),
            seller: account.seller.toBase58(),
            quantity: Number(account.quantity),
            price: account.price.toString(),
            createdAt: Number(account.createdAt.toString()),
        };
    } catch {
        return null;
    }
}