import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import marketplaceIdl from "../idl/sol_bazaar.json";

const PROGRAM_ID = new PublicKey(
  marketplaceIdl.address ||
    marketplaceIdl.metadata?.address ||
    "Dg1SUE2GAfMaxft1XFaMYck1n6uqxtx4F5m4cbB4c6dp"
);

function createReadonlyWallet() {
  return {
    publicKey: PublicKey.default,
    signTransaction: async () => {
      throw new Error("Connect your wallet to send a transaction.");
    },
    signAllTransactions: async () => {
      throw new Error("Connect your wallet to send transactions.");
    },
  };
}

function getMarketplaceProgram(connection, wallet) {
  const provider = new AnchorProvider(
    connection,
    wallet?.publicKey ? wallet : createReadonlyWallet(),
    { commitment: "confirmed" }
  );

  return new Program(marketplaceIdl, provider);
}

function requireConnectedWallet(wallet) {
  if (!wallet?.publicKey) {
    throw new Error("Connect your wallet first.");
  }
}

export function deriveMerchantPda(merchantAuthority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("merchant"), new PublicKey(merchantAuthority).toBuffer()],
    PROGRAM_ID
  )[0];
}

export function deriveReputationPda(merchantAuthority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), new PublicKey(merchantAuthority).toBuffer()],
    PROGRAM_ID
  )[0];
}

export function deriveOrderRecordPda(escrow) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("order"), new PublicKey(escrow).toBuffer()],
    PROGRAM_ID
  )[0];
}

export function deriveReviewPda(orderRecord) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("review"), new PublicKey(orderRecord).toBuffer()],
    PROGRAM_ID
  )[0];
}

export async function initializeMerchantReputation({ connection, wallet, merchantAuthority }) {
  requireConnectedWallet(wallet);
  const program = getMarketplaceProgram(connection, wallet);
  const merchantProfile = deriveMerchantPda(merchantAuthority);
  const reputation = deriveReputationPda(merchantAuthority);
  const existing = await connection.getAccountInfo(reputation);

  if (existing) {
    return { signature: null, merchantProfile, reputation, alreadyInitialized: true };
  }

  const signature = await program.methods
    .initializeReputation()
    .accounts({
      merchantProfile,
      reputation,
      payer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature, merchantProfile, reputation, alreadyInitialized: false };
}

export async function submitProductReview({
  connection,
  wallet,
  escrow,
  product,
  merchantAuthority,
  rating,
  comment,
}) {
  requireConnectedWallet(wallet);
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new Error("Rating must be between 1 and 5.");
  }

  const cleanComment = String(comment || "").trim();
  if (new TextEncoder().encode(cleanComment).length > 280) {
    throw new Error("Review comment must not exceed 280 bytes.");
  }

  const program = getMarketplaceProgram(connection, wallet);
  const escrowKey = new PublicKey(escrow);
  const productKey = new PublicKey(product);
  const merchantProfile = deriveMerchantPda(merchantAuthority);
  const reputation = deriveReputationPda(merchantAuthority);
  const orderRecord = deriveOrderRecordPda(escrowKey);
  const review = deriveReviewPda(orderRecord);

  if (!(await connection.getAccountInfo(reputation))) {
    throw new Error("Seller reputation is not initialized yet.");
  }
  if (await connection.getAccountInfo(review)) {
    throw new Error("This completed order already has a review.");
  }

  const signature = await program.methods
    .submitReview(numericRating, cleanComment)
    .accounts({
      reviewer: wallet.publicKey,
      escrow: escrowKey,
      merchantProfile,
      product: productKey,
      orderRecord,
      reputation,
      review,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature, escrow: escrowKey, product: productKey, orderRecord, reputation, review };
}

export async function getMerchantReputation({ connection, wallet, merchantAuthority }) {
  const program = getMarketplaceProgram(connection, wallet);
  const reputationPda = deriveReputationPda(merchantAuthority);

  try {
    const account = await program.account.merchantReputation.fetch(reputationPda);
    const totalReviews = Number(account.totalReviews);
    const totalRating = Number(account.totalRating);
    return {
      publicKey: reputationPda,
      merchant: account.merchant,
      totalReviews,
      totalRating,
      averageRating: totalReviews > 0 ? totalRating / totalReviews : 0,
      average: totalReviews > 0 ? totalRating / totalReviews : 0,
      fiveStar: Number(account.fiveStar),
      fourStar: Number(account.fourStar),
      threeStar: Number(account.threeStar),
      twoStar: Number(account.twoStar),
      oneStar: Number(account.oneStar),
    };
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("Account does not exist") || message.includes("AccountNotInitialized")) {
      return null;
    }
    throw error;
  }
}

export async function getProductReviews({ connection, wallet, product }) {
  const program = getMarketplaceProgram(connection, wallet);
  const productKey = new PublicKey(product);
  const rows = await program.account.merchantReview.all([
    {
      memcmp: {
        // discriminator(8) + escrow(32) + order_record(32)
        offset: 72,
        bytes: productKey.toBase58(),
      },
    },
  ]);

  return rows
    .map(({ publicKey, account }) => ({
      publicKey,
      escrow: account.escrow,
      orderRecord: account.orderRecord,
      product: account.product,
      merchant: account.merchant,
      reviewer: account.reviewer,
      rating: Number(account.rating),
      comment: account.comment,
      createdAt: Number(account.createdAt),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function hasOrderReview({ connection, escrow }) {
  const orderRecord = deriveOrderRecordPda(escrow);
  const review = deriveReviewPda(orderRecord);
  return { exists: Boolean(await connection.getAccountInfo(review)), orderRecord, review };
}
