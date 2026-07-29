import {
    BN,
    AnchorProvider,
    Program,
} from "@coral-xyz/anchor";

import {
    PublicKey,
    SystemProgram,
    Transaction
} from "@solana/web3.js";

import escrowIdl from "../idl/sol_shop_escrow.json";
import marketplaceIdl from "../idl/sol_bazaar.json";

/*
 * Website donation wallet.
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

                finalizationProposer:
                    escrow
                        .finalizationProposer
                        .toBase58(),

                finalizationNote:
                    escrow
                        .finalizationNote,

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

export async function releaseBuyerAndRecordSale({
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

    if (
        escrow.status !==
        ESCROW_STATUS.FINALIZATION_SUGGESTED
    ) {
        throw new Error(
            "No finalization proposal is pending."
        );
    }

    if (!escrow?.order?.product) {
        throw new Error(
            "Order product is unavailable."
        );
    }

    const escrowProgram =
        getEscrowProgram(
            connection,
            wallet
        );

    const marketplaceProgram =
        getMarketplaceProgram(
            connection,
            wallet
        );

    const escrowPublicKey =
        new PublicKey(
            escrow.publicKey
        );

    const productPublicKey =
        new PublicKey(
            escrow.order.product
        );

    /*
     * Escrow vault PDA
     */
    const [vaultPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("vault"),
                escrowPublicKey.toBuffer(),
            ],
            escrowProgram.programId
        );

    /*
     * Marketplace order record PDA
     */
    const [orderRecordPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("order"),
                escrowPublicKey.toBuffer(),
            ],
            marketplaceProgram.programId
        );

    /*
     * Completed sale PDA.
     * Pinipigilan nitong mabilang nang dalawang beses
     * ang parehong escrow sale.
     */
    const [completedSalePda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("completed-sale"),
                orderRecordPda.toBuffer(),
            ],
            marketplaceProgram.programId
        );

    const existingCompletedSale =
        await connection.getAccountInfo(
            completedSalePda,
            "confirmed"
        );

    if (existingCompletedSale) {
        throw new Error(
            "This completed sale has already been recorded."
        );
    }

    /*
     * Instruction 1:
     * Release buyer refund, seller payment,
     * at optional donation.
     */
    const releaseInstruction =
        await escrowProgram.methods
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
            .instruction();

    /*
     * Instruction 2:
     * Record completed sale and increase
     * the product sold count.
     */
    const recordSaleInstruction =
        await marketplaceProgram.methods
            .recordCompletedSale()
            .accounts({
                buyer:
                    wallet.publicKey,

                escrow:
                    escrowPublicKey,

                orderRecord:
                    orderRecordPda,

                product:
                    productPublicKey,

                completedSale:
                    completedSalePda,

                systemProgram:
                    SystemProgram.programId,
            })
            .instruction();

    /*
     * Parehong instruction sa isang transaction.
     *
     * Kapag pumalya ang recordCompletedSale,
     * mare-revert din ang acceptFinalization.
     */
    const transaction =
        new Transaction().add(
            releaseInstruction,
            recordSaleInstruction
        );

    const latestBlockhash =
        await connection.getLatestBlockhash(
            "confirmed"
        );

    transaction.feePayer =
        wallet.publicKey;

    transaction.recentBlockhash =
        latestBlockhash.blockhash;

    const signature =
        await wallet.sendTransaction(
            transaction,
            connection,
            {
                skipPreflight: false,
                preflightCommitment:
                    "confirmed",
            }
        );

    const confirmation =
        await connection.confirmTransaction(
            {
                signature,
                blockhash:
                    latestBlockhash.blockhash,

                lastValidBlockHeight:
                    latestBlockhash
                        .lastValidBlockHeight,
            },
            "confirmed"
        );

    if (confirmation.value.err) {
        throw new Error(
            `Transaction failed: ${JSON.stringify(
                confirmation.value.err
            )}`
        );
    }

    return signature;
}


export const MUTUAL_CANCELLATION_PREFIX =
    "MUTUAL_CANCELLATION|";

function normalizeAddress(value) {
    return (
        value?.toBase58?.() ??
        value?.toString?.() ??
        value ??
        ""
    );
}

export function isMutualCancellationProposal(
    escrow
) {
    return (
        Number(escrow?.status) ===
            ESCROW_STATUS.FINALIZATION_SUGGESTED &&
        String(
            escrow?.finalizationNote ?? ""
        ).startsWith(
            MUTUAL_CANCELLATION_PREFIX
        )
    );
}

export function getMutualCancellationReason(
    escrow
) {
    const note = String(
        escrow?.finalizationNote ?? ""
    );

    if (
        !note.startsWith(
            MUTUAL_CANCELLATION_PREFIX
        )
    ) {
        return "";
    }

    const reasonMarker = "|reason=";
    const markerIndex =
        note.indexOf(reasonMarker);

    if (markerIndex < 0) {
        return "";
    }

    return note
        .slice(
            markerIndex +
                reasonMarker.length
        )
        .trim();
}

export async function requestMutualCancellation({
    connection,
    wallet,
    escrow,
    reason,
}) {
    if (!wallet.publicKey) {
        throw new Error(
            "Connect wallet first."
        );
    }

    const signer =
        wallet.publicKey.toBase58();

    const buyer =
        normalizeAddress(
            escrow.partyA
        );

    const seller =
        normalizeAddress(
            escrow.partyB
        );

    if (
        signer !== buyer &&
        signer !== seller
    ) {
        throw new Error(
            "Only the buyer or seller can request cancellation."
        );
    }

    if (
        Number(escrow.status) !==
        ESCROW_STATUS.DEPOSITS_COMPLETE
    ) {
        throw new Error(
            "Mutual cancellation is available only after both deposits are complete."
        );
    }

    const cleanReason =
        String(reason ?? "")
            .trim()
            .replace(/\s+/g, " ");

    if (!cleanReason) {
        throw new Error(
            "Enter a cancellation reason."
        );
    }

    const requesterRole =
        signer === buyer
            ? "buyer"
            : "seller";

    const note =
        `${MUTUAL_CANCELLATION_PREFIX}` +
        `requester=${requesterRole}` +
        `|reason=${cleanReason}`;

    if (
        new TextEncoder()
            .encode(note)
            .length > 200
    ) {
        throw new Error(
            "Cancellation reason is too long."
        );
    }

    const program =
        getEscrowProgram(
            connection,
            wallet
        );

    /*
     * Neutral cancellation:
     * each party receives only its own
     * deposited funds.
     */
    const buyerPayout =
        toBN(escrow.depositedA);

    const sellerPayout =
        toBN(escrow.depositedB);

    const totalLocked =
        buyerPayout.add(
            sellerPayout
        );

    const allocatedTotal =
        buyerPayout.add(
            sellerPayout
        );

    if (
        !allocatedTotal.eq(
            totalLocked
        )
    ) {
        throw new Error(
            "Cancellation payouts do not match the escrow balance."
        );
    }

    return program.methods
        .suggestFinalization(
            buyerPayout,
            sellerPayout,
            new BN(0),
            note
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

export async function approveMutualCancellation({
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
        !isMutualCancellationProposal(
            escrow
        )
    ) {
        throw new Error(
            "No mutual cancellation request is pending."
        );
    }

    const signer =
        wallet.publicKey.toBase58();

    const buyer =
        normalizeAddress(
            escrow.partyA
        );

    const seller =
        normalizeAddress(
            escrow.partyB
        );

    const proposer =
        normalizeAddress(
            escrow.finalizationProposer
        );

    if (
        signer !== buyer &&
        signer !== seller
    ) {
        throw new Error(
            "Only the buyer or seller can approve cancellation."
        );
    }

    if (signer === proposer) {
        throw new Error(
            "The party who requested cancellation cannot approve its own request."
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
                Buffer.from("vault"),
                escrowPublicKey.toBuffer(),
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
                    buyer
                ),

            partyB:
                new PublicKey(
                    seller
                ),

            vault:
                vaultPda,

            donationRecipient:
                DONATION_RECIPIENT,
        })
        .rpc();
}

export async function declineMutualCancellation({
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
        !isMutualCancellationProposal(
            escrow
        )
    ) {
        throw new Error(
            "No mutual cancellation request is pending."
        );
    }

    const signer =
        wallet.publicKey.toBase58();

    const buyer =
        normalizeAddress(
            escrow.partyA
        );

    const seller =
        normalizeAddress(
            escrow.partyB
        );

    const proposer =
        normalizeAddress(
            escrow.finalizationProposer
        );

    if (
        signer !== buyer &&
        signer !== seller
    ) {
        throw new Error(
            "Only the buyer or seller can decline cancellation."
        );
    }

    if (signer === proposer) {
        throw new Error(
            "The requesting party cannot decline its own request."
        );
    }

    const program =
        getEscrowProgram(
            connection,
            wallet
        );

    return program.methods
        .rejectFinalization()
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

export async function withdrawBuyerOrder({
    connection,
    wallet,
    escrow,
}) {
    if (!wallet.publicKey) {
        throw new Error(
            "Connect wallet first."
        );
    }

    const buyerAddress =
        escrow.partyA?.toBase58?.() ??
        escrow.partyA?.toString?.() ??
        escrow.partyA;

    if (
        wallet.publicKey.toBase58() !==
        buyerAddress
    ) {
        throw new Error(
            "Only the buyer can withdraw this order."
        );
    }

    if (
        Number(escrow.status) !==
        ESCROW_STATUS.CREATED
    ) {
        throw new Error(
            "This order can no longer be withdrawn."
        );
    }

    const sellerDeposit = new BN(
        escrow.depositedB?.toString?.() ??
            escrow.depositedB ??
            0
    );

    if (!sellerDeposit.isZero()) {
        throw new Error(
            "The seller has already accepted this order."
        );
    }

    const program =
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
                Buffer.from("vault"),
                escrowPda.toBuffer(),
            ],
            program.programId
        );

    const creatorAddress =
        escrow.creator?.toBase58?.() ??
        escrow.creator?.toString?.() ??
        escrow.creator;

    return program.methods
        .withdrawBeforeComplete()
        .accounts({
            withdrawer:
                wallet.publicKey,
            escrow:
                escrowPda,
            creator:
                new PublicKey(
                    creatorAddress
                ),
            vault:
                vaultPda,
        })
        .rpc();
}

export async function rejectPendingFinalization({
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
        Number(escrow.status) !==
        ESCROW_STATUS.FINALIZATION_SUGGESTED
    ) {
        throw new Error(
            "No finalization proposal is pending."
        );
    }

    const proposer =
        normalizeAddress(
            escrow.finalizationProposer
        );

    if (
        wallet.publicKey.toBase58() ===
        proposer
    ) {
        throw new Error(
            "The party who proposed finalization cannot reject its own proposal."
        );
    }

    const program =
        getEscrowProgram(
            connection,
            wallet
        );

    return program.methods
        .rejectFinalization()
        .accounts({
            signer: wallet.publicKey,
            escrow: new PublicKey(
                escrow.publicKey
            ),
        })
        .rpc();
}