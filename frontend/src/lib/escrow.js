import { BN, AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

import escrowIdl from "../idl/sol_shop_escrow.json";

function getEscrowProgram(connection, wallet) {
    const provider = new AnchorProvider(
        connection,
        wallet,
        {
            commitment: "confirmed",
        }
    );

    return new Program(
        escrowIdl,
        provider
    );
}

export async function createBuyerEscrow({
    connection,
    wallet,
    product,
    merchant,
    quantity = 1,
}) {
    if (!wallet.publicKey) {
        throw new Error("Connect wallet first.");
    }

    if (!product || !merchant) {
        throw new Error("Product or merchant not found.");
    }

    const quantityNumber = Number(quantity);

    if (
        !Number.isInteger(quantityNumber) ||
        quantityNumber <= 0
    ) {
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

    const buyer = wallet.publicKey;
    const seller = new PublicKey(
        merchant.authority
    );

    const unitPriceLamports = new BN(
        product.price.toString()
    );

    const totalPriceLamports =
        unitPriceLamports.mul(
            new BN(quantityNumber)
        );

    const depositBps = new BN(
        String(
            merchant.sellerDepositBps ??
                1000
        )
    );

    if (
        depositBps.isNeg() ||
        depositBps.gt(new BN(10_000))
    ) {
        throw new Error(
            "Invalid merchant security deposit percentage."
        );
    }

    let securityDepositLamports =
        totalPriceLamports
            .mul(depositBps)
            .div(new BN(10_000));

    // Keep this because your contract expects
    // at least 1 lamport when calculation is zero.
    if (securityDepositLamports.isZero()) {
        securityDepositLamports =
            new BN(1);
    }

    /*
     * Buyer locks:
     * product price + refundable security deposit.
     */
    const buyerRequiredDeposit =
        totalPriceLamports.add(
            securityDepositLamports
        );

    /*
     * Seller locks the same security deposit.
     */
    const sellerRequiredDeposit =
        securityDepositLamports;

    const escrowId = new BN(
        Date.now().toString()
    );

    const [escrowPda] =
        PublicKey.findProgramAddressSync(
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

    const [vaultPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("vault"),
                escrowPda.toBuffer(),
            ],
            escrowProgram.programId
        );

    const note = JSON.stringify({
        marketplace: "solbazaar",
        product: product.publicKey,
        seller: merchant.authority,
        quantity: quantityNumber,
    });

    if (
        new TextEncoder().encode(note).length >
        200
    ) {
        throw new Error(
            "Escrow note is too long."
        );
    }

    /*
     * Argument order based on your current
     * working escrow call:
     *
     * referenceAmount
     * requiredDepositA
     * requiredDepositB
     */
    const createSignature =
        await escrowProgram.methods
            .createEscrow(
                escrowId,
                1,
                buyer,
                seller,

                // Actual product total.
                totalPriceLamports,

                // Buyer: price + refundable bond.
                buyerRequiredDeposit,

                // Seller refundable bond.
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
            .rpc();

    /*
     * Buyer deposits the complete required amount:
     * price + buyer security deposit.
     */
    const depositSignature =
        await escrowProgram.methods
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
            .rpc();

    return {
        escrowId: escrowId.toString(),
        escrowPda:
            escrowPda.toBase58(),
        vaultPda:
            vaultPda.toBase58(),

        unitPriceLamports:
            unitPriceLamports.toString(),

        totalPriceLamports:
            totalPriceLamports.toString(),

        securityDepositLamports:
            securityDepositLamports.toString(),

        buyerRequiredDeposit:
            buyerRequiredDeposit.toString(),

        sellerRequiredDeposit:
            sellerRequiredDeposit.toString(),

        createSignature,
        depositSignature,
    };
}

export const ESCROW_STATUS = {
    CREATED: 0,
    DEPOSITS_COMPLETE: 1,
    FINALIZATION_SUGGESTED: 2,
    COMPLETED: 3,
};

export function getEscrowStatusLabel(status) {
    switch (status) {
        case ESCROW_STATUS.CREATED:
            return "Waiting for deposits";

        case ESCROW_STATUS.DEPOSITS_COMPLETE:
            return "Order accepted";

        case ESCROW_STATUS.FINALIZATION_SUGGESTED:
            return "Finalization pending";

        case ESCROW_STATUS.COMPLETED:
            return "Completed";

        default:
            return "Unknown";
    }
}

export async function getEscrows({
    connection,
    wallet,
}) {
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

    const rawAccounts =
        await connection.getProgramAccounts(
            escrowProgram.programId
        );

    const escrows = [];

    for (const item of rawAccounts) {
        try {
            const escrow =
                escrowProgram.coder.accounts.decode(
                    "escrow",
                    item.account.data
                );

            let parsedNote = null;

            try {
                parsedNote = JSON.parse(escrow.note);
            } catch {
                parsedNote = null;
            }

            if (
                parsedNote?.marketplace !== "solbazaar"
            ) {
                continue;
            }

            escrows.push({
                publicKey: item.pubkey.toBase58(),

                creator: escrow.creator.toBase58(),
                partyA: escrow.partyA.toBase58(),
                partyB: escrow.partyB.toBase58(),

                escrowType: escrow.escrowType,
                status: escrow.status,

                requiredDepositA:
                    escrow.requiredDepositA.toString(),

                requiredDepositB:
                    escrow.requiredDepositB.toString(),

                depositedA:
                    escrow.depositedA.toString(),

                depositedB:
                    escrow.depositedB.toString(),

                referenceAmount:
                    escrow.referenceAmount.toString(),

                proposedPayoutA:
                    escrow.proposedPayoutA.toString(),

                proposedPayoutB:
                    escrow.proposedPayoutB.toString(),

                proposedDonation:
                    escrow.proposedDonation.toString(),

                vault: escrow.vault.toBase58(),

                createdAt:
                    escrow.createdAt.toString(),

                depositAt:
                    escrow.depositAt.toString(),

                finalizedAt:
                    escrow.finalizedAt.toString(),

                note: escrow.note,
                order: parsedNote,
            });
        } catch {
            // Ignore non-escrow or incompatible accounts.
        }
    }

    return escrows;
}

export async function getBuyerEscrows({
    connection,
    wallet,
}) {
    if (!wallet.publicKey) {
        return [];
    }

    const walletAddress =
        wallet.publicKey.toBase58();

    const escrows = await getEscrows({
        connection,
        wallet,
    });

    return escrows.filter(
        (escrow) =>
            escrow.partyA === walletAddress
    );
}

export async function getSellerEscrows({
    connection,
    wallet,
}) {
    if (!wallet.publicKey) {
        return [];
    }

    const walletAddress =
        wallet.publicKey.toBase58();

    const escrows = await getEscrows({
        connection,
        wallet,
    });

    return escrows.filter(
        (escrow) =>
            escrow.partyB === walletAddress
    );
}

export async function sellerAcceptEscrow({
    connection,
    wallet,
    escrow,
}) {
    if (!wallet.publicKey) {
        throw new Error("Connect wallet first.");
    }

    if (
        wallet.publicKey.toBase58() !== escrow.partyB
    ) {
        throw new Error(
            "Only the seller can accept this order."
        );
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

    const escrowPda = new PublicKey(
        escrow.publicKey
    );

    const [vaultPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("vault"),
                escrowPda.toBuffer(),
            ],
            escrowProgram.programId
        );

    const sellerDeposit = new BN(
        escrow.requiredDepositB
    );

    const signature =
        await escrowProgram.methods
            .deposit(sellerDeposit)
            .accounts({
                depositor: wallet.publicKey,
                escrow: escrowPda,
                vault: vaultPda,
                systemProgram:
                    SystemProgram.programId,
            })
            .rpc();

    return signature;
}


const DONATION_RECIPIENT =
    new PublicKey("61Gt8siRo84pmGziia5dHuJMkx9ne1d4Cb5aHsyQGP85");


export async function closeCompletedEscrow({
    connection,
    wallet,
    escrow,
}) {
    if (!wallet.publicKey) {
        throw new Error("Connect wallet first.");
    }

    if (wallet.publicKey.toBase58() !== escrow.creator) {
        throw new Error(
            "Only the buyer who created this order can close it."
        );
    }

    if (escrow.status !== ESCROW_STATUS.COMPLETED) {
        throw new Error(
            "Only completed orders can be closed."
        );
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

    const escrowPda = new PublicKey(
        escrow.publicKey
    );

    const [vaultPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("vault"),
                escrowPda.toBuffer(),
            ],
            escrowProgram.programId
        );

    return escrowProgram.methods
        .closeCompletedEscrow()
        .accounts({
            creator: wallet.publicKey,
            escrow: escrowPda,
            vault: vaultPda,
        })
        .rpc();
}

export function getEscrowTimeline(escrow) {
    const events = [];

    const createdAt = Number(escrow.createdAt);
    const depositAt = Number(escrow.depositAt);
    const finalizedAt = Number(escrow.finalizedAt);

    if (createdAt > 0) {
        events.push({
            label: "Order created",
            timestamp: createdAt,
            completed: true,
        });
    }

    if (Number(escrow.depositedA) > 0) {
        events.push({
            label: "Buyer payment deposited",
            timestamp: createdAt,
            completed: true,
        });
    }

    events.push({
        label: "Seller accepted order",
        timestamp:
            Number(escrow.depositedB) > 0
                ? depositAt
                : 0,
        completed: Number(escrow.depositedB) > 0,
    });

    events.push({
        label: "Buyer confirmed receipt",
        timestamp: 0,
        completed: escrow.status >= 2,
    });

    events.push({
        label: "Funds released",
        timestamp:
            escrow.status === 3
                ? finalizedAt
                : 0,
        completed: escrow.status === 3,
    });

    return events;
}

export async function sellerSuggestCompletion({
    connection,
    wallet,
    escrow,
}) {
    if (!wallet.publicKey) {
        throw new Error("Connect wallet first.");
    }

    if (
        wallet.publicKey.toBase58() !==
        escrow.partyB
    ) {
        throw new Error(
            "Only the seller can propose order completion."
        );
    }

    const program = getEscrowProgram(
        connection,
        wallet
    );

    const productPrice = new BN(
        escrow.referenceAmount.toString()
    );

    const buyerDeposit = new BN(
        escrow.requiredDepositA.toString()
    );

    const sellerDeposit = new BN(
        escrow.requiredDepositB.toString()
    );

    const buyerRefund =
        buyerDeposit.sub(productPrice);

    const sellerPayout =
        productPrice.add(sellerDeposit);

    const totalLocked = new BN(
        escrow.depositedA.toString()
    ).add(
        new BN(
            escrow.depositedB.toString()
        )
    );

    if (
        !buyerRefund
            .add(sellerPayout)
            .eq(totalLocked)
    ) {
        throw new Error(
            "Final payouts do not match the escrow balance."
        );
    }

    return program.methods
        .suggestFinalization(
            buyerRefund,
            sellerPayout,
            new BN(0),
            "Seller marked order ready for buyer confirmation"
        )
        .accounts({
            signer: wallet.publicKey,
            escrow: new PublicKey(
                escrow.publicKey
            ),
        })
        .rpc();
}

export async function retrieveBuyerDeposit({
    connection,
    wallet,
    escrow,
}) {
    if (!wallet.publicKey) {
        throw new Error("Connect wallet first.");
    }

    if (
        wallet.publicKey.toBase58() !==
        escrow.partyA
    ) {
        throw new Error(
            "Only the buyer can complete this order."
        );
    }

    const program = getEscrowProgram(
        connection,
        wallet
    );

    const escrowPublicKey =
        new PublicKey(escrow.publicKey);

    const [vaultPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("vault"),
                escrowPublicKey.toBuffer(),
            ],
            program.programId
        );

    return program.methods
        .acceptFinalization()
        .accounts({
            signer: wallet.publicKey,
            escrow: escrowPublicKey,
            partyA: new PublicKey(
                escrow.partyA
            ),
            partyB: new PublicKey(
                escrow.partyB
            ),
            vault: vaultPda,
            donationRecipient:
                new PublicKey(
                    "61Gt8siRo84pmGziia5dHuJMkx9ne1d4Cb5aHsyQGP85"
                ),
        })
        .rpc();
}