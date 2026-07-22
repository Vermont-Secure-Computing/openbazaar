import {
    BN,
    AnchorProvider,
    Program,
} from "@coral-xyz/anchor";

import {
    PublicKey,
    SystemProgram,
} from "@solana/web3.js";

import escrowIdl from "../idl/sol_shop_escrow.json";
import marketplaceIdl from "../idl/sol_bazaar.json";

/*
 * Website donation wallet.
 *
 * Palitan ito kapag gusto mong gumamit
 * ng ibang SolBazaar donation address.
 */
const DONATION_RECIPIENT = new PublicKey(
    "61Gt8siRo84pmGziia5dHuJMkx9ne1d4Cb5aHsyQGP85"
);

function getEscrowProgram(
    connection,
    wallet
) {
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

function getMarketplaceProgram(
    connection,
    wallet
) {
    const provider = new AnchorProvider(
        connection,
        wallet,
        {
            commitment: "confirmed",
        }
    );

    return new Program(
        marketplaceIdl,
        provider
    );
}

function toBN(value) {
    return new BN(
        value?.toString?.() ??
            value ??
            0
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
        throw new Error(
            "Connect wallet first."
        );
    }

    if (!product || !merchant) {
        throw new Error(
            "Product or merchant not found."
        );
    }

    const quantityNumber =
        Number(quantity);

    if (
        !Number.isInteger(quantityNumber) ||
        quantityNumber <= 0
    ) {
        throw new Error(
            "Invalid quantity."
        );
    }

    const escrowProgram =
        getEscrowProgram(
            connection,
            wallet
        );

    const buyer =
        wallet.publicKey;

    const seller =
        new PublicKey(
            merchant.authority
        );

    const unitPriceLamports =
        toBN(product.price);

    const totalPriceLamports =
        unitPriceLamports.mul(
            new BN(quantityNumber)
        );

    const depositBps =
        new BN(
            String(
                merchant.sellerDepositBps ??
                    1000
            )
        );

    if (
        depositBps.isNeg() ||
        depositBps.gt(
            new BN(10_000)
        )
    ) {
        throw new Error(
            "Invalid merchant security deposit percentage."
        );
    }

    let securityDepositLamports =
        totalPriceLamports
            .mul(depositBps)
            .div(
                new BN(10_000)
            );

    if (
        securityDepositLamports.isZero()
    ) {
        securityDepositLamports =
            new BN(1);
    }

    /*
     * Buyer deposits:
     * product price + refundable deposit.
     */
    const buyerRequiredDeposit =
        totalPriceLamports.add(
            securityDepositLamports
        );

    /*
     * Seller deposits only the
     * refundable security deposit.
     */
    const sellerRequiredDeposit =
        securityDepositLamports;

    const escrowId =
        new BN(
            Date.now().toString()
        );

    const [escrowPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from(
                    "escrow"
                ),

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
                Buffer.from(
                    "vault"
                ),

                escrowPda.toBuffer(),
            ],
            escrowProgram.programId
        );

    const note =
        JSON.stringify({
            marketplace:
                "solbazaar",

            product:
                product.publicKey,

            seller:
                merchant.authority,

            quantity:
                quantityNumber,
        });

    if (
        new TextEncoder()
            .encode(note)
            .length > 200
    ) {
        throw new Error(
            "Escrow note is too long."
        );
    }

    const createSignature =
        await escrowProgram.methods
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
                creator:
                    buyer,

                escrow:
                    escrowPda,

                vault:
                    vaultPda,

                systemProgram:
                    SystemProgram.programId,
            })
            .rpc();

    const depositSignature =
        await escrowProgram.methods
            .deposit(
                buyerRequiredDeposit
            )
            .accounts({
                depositor:
                    buyer,

                escrow:
                    escrowPda,

                vault:
                    vaultPda,

                systemProgram:
                    SystemProgram.programId,
            })
            .rpc();

    return {
        escrowId:
            escrowId.toString(),

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

export function getEscrowStatusLabel(
    status
) {
    switch (status) {
        case ESCROW_STATUS.CREATED:
            return "Waiting for deposits";

        case ESCROW_STATUS
            .DEPOSITS_COMPLETE:
            return "Order accepted";

        case ESCROW_STATUS
            .FINALIZATION_SUGGESTED:
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
    const escrowProgram =
        getEscrowProgram(
            connection,
            wallet
        );

    const rawAccounts =
        await connection
            .getProgramAccounts(
                escrowProgram.programId
            );

    const escrows = [];

    for (
        const item of rawAccounts
    ) {
        try {
            const escrow =
                escrowProgram
                    .coder
                    .accounts
                    .decode(
                        "escrow",
                        item.account.data
                    );

            let parsedNote = null;

            try {
                parsedNote =
                    JSON.parse(
                        escrow.note
                    );
            } catch {
                parsedNote = null;
            }

            if (
                parsedNote
                    ?.marketplace !==
                "solbazaar"
            ) {
                continue;
            }

            escrows.push({
                publicKey:
                    item.pubkey
                        .toBase58(),

                creator:
                    escrow.creator
                        .toBase58(),

                partyA:
                    escrow.partyA
                        .toBase58(),

                partyB:
                    escrow.partyB
                        .toBase58(),

                escrowType:
                    escrow.escrowType,

                status:
                    escrow.status,

                requiredDepositA:
                    escrow
                        .requiredDepositA
                        .toString(),

                requiredDepositB:
                    escrow
                        .requiredDepositB
                        .toString(),

                depositedA:
                    escrow
                        .depositedA
                        .toString(),

                depositedB:
                    escrow
                        .depositedB
                        .toString(),

                referenceAmount:
                    escrow
                        .referenceAmount
                        .toString(),

                proposedPayoutA:
                    escrow
                        .proposedPayoutA
                        .toString(),

                proposedPayoutB:
                    escrow
                        .proposedPayoutB
                        .toString(),

                proposedDonation:
                    escrow
                        .proposedDonation
                        .toString(),

                vault:
                    escrow.vault
                        .toBase58(),

                createdAt:
                    escrow.createdAt
                        .toString(),

                depositAt:
                    escrow.depositAt
                        .toString(),

                finalizedAt:
                    escrow.finalizedAt
                        .toString(),

                note:
                    escrow.note,

                order:
                    parsedNote,
            });
        } catch {
            /*
             * Ignore accounts belonging
             * to other account types.
             */
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

    const escrows =
        await getEscrows({
            connection,
            wallet,
        });

    return escrows.filter(
        (escrow) =>
            escrow.partyA ===
            walletAddress
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

    const escrows =
        await getEscrows({
            connection,
            wallet,
        });

    return escrows.filter(
        (escrow) =>
            escrow.partyB ===
            walletAddress
    );
}

/**
 * 
 * Function to cancel the escrow
 * Available only if other party has not deposited yet
 * 
 */
export async function withdrawBeforeComplete({
  wallet,
  connection,
  escrowPda,
  vaultPda,
  creator,
}) {
  const program = getEscrowProgram(connection, wallet);

  const sig = await program.methods
    .withdrawBeforeComplete()
    .accounts({
      withdrawer: wallet.publicKey,
      escrow: new PublicKey(escrowPda),
      vault: new PublicKey(vaultPda),
      creator: new PublicKey(creator),
    })
    .rpc();

  return sig;
}


/*
 * Seller accepts the order and
 * deposits the refundable seller bond.
 *
 * Donation does NOT happen here.
 */
export async function sellerAcceptEscrow({
    connection,
    wallet,
    escrow,
}) {
    if (!wallet.publicKey) {
        throw new Error(
            "Connect wallet first."
        );
    }

    if (
        wallet.publicKey
            .toBase58() !==
        escrow.partyB
    ) {
        throw new Error(
            "Only the seller can accept this order."
        );
    }

    const escrowProgram =
        getEscrowProgram(
            connection,
            wallet
        );

    const escrowPda =
        new PublicKey(
            escrow.publicKey
        );

    const [vaultPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from(
                    "vault"
                ),

                escrowPda.toBuffer(),
            ],
            escrowProgram.programId
        );

    const sellerDeposit =
        toBN(
            escrow.requiredDepositB
        );

    return escrowProgram.methods
        .deposit(
            sellerDeposit
        )
        .accounts({
            depositor:
                wallet.publicKey,

            escrow:
                escrowPda,

            vault:
                vaultPda,

            systemProgram:
                SystemProgram.programId,
        })
        .rpc();
}

/*
 * Seller marks the item ready for
 * buyer confirmation.
 *
 * This is where optional donation
 * is selected.
 */
export async function sellerSuggestCompletion({
    connection,
    wallet,
    escrow,
    donationPercent = 0,
}) {
    if (!wallet.publicKey) {
        throw new Error(
            "Connect wallet first."
        );
    }

    if (
        wallet.publicKey
            .toBase58() !==
        escrow.partyB
    ) {
        throw new Error(
            "Only the seller can propose order completion."
        );
    }

    if (
        escrow.status !==
        ESCROW_STATUS
            .DEPOSITS_COMPLETE
    ) {
        throw new Error(
            "Both deposits must be complete first."
        );
    }

    const percent =
        Number(
            donationPercent
        );

    if (
        !Number.isFinite(
            percent
        ) ||
        percent < 0 ||
        percent > 100
    ) {
        throw new Error(
            "Donation must be between 0% and 100%."
        );
    }

    const program =
        getEscrowProgram(
            connection,
            wallet
        );

    const productPrice =
        toBN(
            escrow.referenceAmount
        );

    const buyerRequiredDeposit =
        toBN(
            escrow.requiredDepositA
        );

    const sellerRequiredDeposit =
        toBN(
            escrow.requiredDepositB
        );

    /*
     * Buyer refund:
     * buyer's refundable deposit only.
     */
    const buyerRefund =
        buyerRequiredDeposit.sub(
            productPrice
        );

    /*
     * Use basis points so decimals
     * such as 2.5% can also work.
     */
    const donationBasisPoints =
        Math.round(
            percent * 100
        );

    const donation =
        productPrice
            .mul(
                new BN(
                    donationBasisPoints
                )
            )
            .div(
                new BN(10_000)
            );

    /*
     * Seller receives:
     * product price
     * + refundable seller deposit
     * - donation.
     */
    const sellerPayout =
        productPrice
            .add(
                sellerRequiredDeposit
            )
            .sub(
                donation
            );

    if (
        sellerPayout.isNeg()
    ) {
        throw new Error(
            "Donation exceeds seller proceeds."
        );
    }

    const totalLocked =
        toBN(
            escrow.depositedA
        ).add(
            toBN(
                escrow.depositedB
            )
        );

    const allocatedTotal =
        buyerRefund
            .add(
                sellerPayout
            )
            .add(
                donation
            );

    if (
        !allocatedTotal.eq(
            totalLocked
        )
    ) {
        throw new Error(
            "Final payouts do not match the escrow balance."
        );
    }

    return program.methods
        .suggestFinalization(
            buyerRefund,

            sellerPayout,

            donation,

            `Seller marked order ready. Website donation: ${percent}%`
        )
        .accounts({
            signer:
                wallet.publicKey,

            escrow:
                new PublicKey(
                    escrow.publicKey
                ),
        })
        .rpc();
}

/*
 * Buyer accepts finalization.
 *
 * This releases:
 * - buyer refund
 * - seller proceeds
 * - optional website donation
 */
export async function retrieveBuyerDeposit({
    connection,
    wallet,
    escrow,
}) {
    if (!wallet.publicKey) {
        throw new Error(
            "Connect wallet first."
        );
    }

    if (
        wallet.publicKey
            .toBase58() !==
        escrow.partyA
    ) {
        throw new Error(
            "Only the buyer can complete this order."
        );
    }

    if (
        escrow.status !==
        ESCROW_STATUS
            .FINALIZATION_SUGGESTED
    ) {
        throw new Error(
            "No finalization proposal is pending."
        );
    }

    const program =
        getEscrowProgram(
            connection,
            wallet
        );

    const escrowPublicKey =
        new PublicKey(
            escrow.publicKey
        );

    const [vaultPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from(
                    "vault"
                ),

                escrowPublicKey
                    .toBuffer(),
            ],
            program.programId
        );

    return program.methods
        .acceptFinalization()
        .accounts({
            signer:
                wallet.publicKey,

            escrow:
                escrowPublicKey,

            partyA:
                new PublicKey(
                    escrow.partyA
                ),

            partyB:
                new PublicKey(
                    escrow.partyB
                ),

            vault:
                vaultPda,

            donationRecipient:
                DONATION_RECIPIENT,
        })
        .rpc();
}

export async function closeCompletedEscrow({
    connection,
    wallet,
    escrow,
}) {
    if (!wallet.publicKey) {
        throw new Error(
            "Connect wallet first."
        );
    }

    if (
        wallet.publicKey
            .toBase58() !==
        escrow.creator
    ) {
        throw new Error(
            "Only the buyer who created this order can close it."
        );
    }

    if (
        escrow.status !==
        ESCROW_STATUS.COMPLETED
    ) {
        throw new Error(
            "Only completed orders can be closed."
        );
    }

    const escrowProgram =
        getEscrowProgram(
            connection,
            wallet
        );

    const escrowPda =
        new PublicKey(
            escrow.publicKey
        );

    const [vaultPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from(
                    "vault"
                ),

                escrowPda.toBuffer(),
            ],
            escrowProgram.programId
        );

    return escrowProgram.methods
        .closeCompletedEscrow()
        .accounts({
            creator:
                wallet.publicKey,

            escrow:
                escrowPda,

            vault:
                vaultPda,
        })
        .rpc();
}

export function getEscrowTimeline(
    escrow
) {
    const events = [];

    const createdAt =
        Number(
            escrow.createdAt
        );

    const depositAt =
        Number(
            escrow.depositAt
        );

    const finalizedAt =
        Number(
            escrow.finalizedAt
        );

    if (
        createdAt > 0
    ) {
        events.push({
            label:
                "Order created",

            timestamp:
                createdAt,

            completed:
                true,
        });
    }

    if (
        Number(
            escrow.depositedA
        ) > 0
    ) {
        events.push({
            label:
                "Buyer payment deposited",

            timestamp:
                createdAt,

            completed:
                true,
        });
    }

    events.push({
        label:
            "Seller accepted order",

        timestamp:
            Number(
                escrow.depositedB
            ) > 0
                ? depositAt
                : 0,

        completed:
            Number(
                escrow.depositedB
            ) > 0,
    });

    events.push({
        label:
            "Seller marked item ready",

        timestamp:
            0,

        completed:
            escrow.status >=
            ESCROW_STATUS
                .FINALIZATION_SUGGESTED,
    });

    events.push({
        label:
            "Buyer confirmed receipt",

        timestamp:
            escrow.status ===
            ESCROW_STATUS.COMPLETED
                ? finalizedAt
                : 0,

        completed:
            escrow.status ===
            ESCROW_STATUS.COMPLETED,
    });

    events.push({
        label:
            "Funds released",

        timestamp:
            escrow.status ===
            ESCROW_STATUS.COMPLETED
                ? finalizedAt
                : 0,

        completed:
            escrow.status ===
            ESCROW_STATUS.COMPLETED,
    });

    return events;
}

/*
 * Increase product sold count only
 * after escrow completion.
 *
 * The completedSale PDA prevents
 * counting the same order twice.
 */
export async function recordCompletedSale({
    connection,
    wallet,
    escrow,
}) {
    if (!wallet.publicKey) {
        throw new Error(
            "Connect wallet first."
        );
    }

    if (
        !escrow?.order?.product
    ) {
        throw new Error(
            "Order product is unavailable."
        );
    }

    const program =
        getMarketplaceProgram(
            connection,
            wallet
        );

    const escrowKey =
        new PublicKey(
            escrow.publicKey
        );

    const product =
        new PublicKey(
            escrow.order.product
        );

    const [orderRecord] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from(
                    "order"
                ),

                escrowKey.toBuffer(),
            ],
            program.programId
        );

    const [completedSale] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from(
                    "completed-sale"
                ),

                orderRecord.toBuffer(),
            ],
            program.programId
        );

    const existingCompletedSale =
        await connection
            .getAccountInfo(
                completedSale
            );

    if (
        existingCompletedSale
    ) {
        return null;
    }

    return program.methods
        .recordCompletedSale()
        .accounts({
            buyer:
                wallet.publicKey,

            escrow:
                escrowKey,

            orderRecord,

            product,

            completedSale,

            systemProgram:
                SystemProgram.programId,
        })
        .rpc();
}