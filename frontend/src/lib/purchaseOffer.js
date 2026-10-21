// src/lib/purchaseOffer.js

import { AnchorProvider, Program } from "@coral-xyz/anchor";

import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { solBazaarIdl, escrowIdl } from "../idl";

function getPrograms(connection, wallet) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  return {
    marketplace: new Program(solBazaarIdl, provider),
    escrowProgram: new Program(escrowIdl, provider),
  };
}

export function getPurchaseOfferPda(escrowAddress) {
  const escrow = new PublicKey(escrowAddress);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("purchase_offer"), escrow.toBuffer()],
    new PublicKey(solBazaarIdl.address),
  )[0];
}

export async function fetchPurchaseOffer({
  connection,
  wallet,
  escrowAddress,
}) {
  const { marketplace } = getPrograms(connection, wallet);

  const purchaseOfferPda = getPurchaseOfferPda(escrowAddress);

  const offer =
    await marketplace.account.purchaseOffer.fetchNullable(purchaseOfferPda);

  if (!offer) return null;

  return {
    ...offer,
    publicKey: purchaseOfferPda,
  };
}

export async function acceptPurchaseOffer({
  connection,
  wallet,
  escrowAddress,
  productAddress,
}) {
  if (!wallet.publicKey) {
    throw new Error("Connect seller wallet first.");
  }

  const { marketplace, escrowProgram } = getPrograms(connection, wallet);

  const seller = wallet.publicKey;
  const escrow = new PublicKey(escrowAddress);

  const purchaseOffer = getPurchaseOfferPda(escrow);

  const [escrowBinding] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_binding"), escrow.toBuffer()],
    marketplace.programId,
  );

  const offer = await marketplace.account.purchaseOffer.fetch(purchaseOffer);

  if (!offer.seller.equals(seller)) {
    throw new Error("Connected wallet is not the seller.");
  }

  const product = new PublicKey(productAddress ?? offer.product);

  const [merchantProfile] = PublicKey.findProgramAddressSync(
    [Buffer.from("merchant"), seller.toBuffer()],
    marketplace.programId,
  );

  const [orderRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from("order"), escrow.toBuffer()],
    marketplace.programId,
  );

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrow.toBuffer()],
    escrowProgram.programId,
  );

  return marketplace.methods
    .acceptPurchaseOffer()
    .accounts({
      seller,
      escrow,
      purchaseOffer,
      product,
      merchantProfile,
      orderRecord,
      vault,
      escrowBinding,
      escrowProgram: escrowProgram.programId,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function withdrawPurchaseOfferAndRefund({
  connection,
  wallet,
  escrow,
}) {
  if (!wallet.publicKey) {
    throw new Error("Connect buyer wallet first.");
  }

  if (!new PublicKey(escrow.partyA).equals(wallet.publicKey)) {
    throw new Error("Only the buyer can withdraw.");
  }

  if (Number(escrow.status) !== 0) {
    throw new Error("Escrow is no longer pending.");
  }

  const { marketplace, escrowProgram } = getPrograms(connection, wallet);

  const escrowPda = new PublicKey(escrow.publicKey);
  const purchaseOffer = getPurchaseOfferPda(escrowPda);

  const offer = await marketplace.account.purchaseOffer.fetch(purchaseOffer);

  if (![0, 2].includes(Number(offer.status))) {
    throw new Error("PurchaseOffer cannot be withdrawn.");
  }

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPda.toBuffer()],
    escrowProgram.programId,
  );

  const transaction = await marketplace.methods
    .withdrawPurchaseOffer()
    .accounts({
      buyer: wallet.publicKey,
      escrow: escrowPda,
      purchaseOffer,
      creator: new PublicKey(escrow.creator),
      vault,
      escrowProgram: escrowProgram.programId,
    })
    .transaction();

  const latest = await connection.getLatestBlockhash("confirmed");

  transaction.feePayer = wallet.publicKey;
  transaction.recentBlockhash = latest.blockhash;

  // Simulate the unsigned legacy transaction before wallet signing.
  const simulation = await connection.simulateTransaction(
    transaction,
    undefined,
    false,
  );

  console.log("Withdraw simulation error:", simulation.value.err);
  console.log("Withdraw simulation logs:", simulation.value.logs);

  if (simulation.value.err) {
    throw new Error(
      `Withdraw simulation failed: ${JSON.stringify(simulation.value.err)}`,
    );
  }

  const signature = await wallet.sendTransaction(transaction, connection, {
    skipPreflight: false,
  });

  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error(JSON.stringify(confirmation.value.err));
  }

  return signature;
}

export async function rejectPurchaseOffer({
  connection,
  wallet,
  escrowAddress,
}) {
  if (!wallet.publicKey) {
    throw new Error("Connect seller wallet first.");
  }

  const { marketplace } = getPrograms(connection, wallet);

  const purchaseOffer = getPurchaseOfferPda(escrowAddress);

  const offer = await marketplace.account.purchaseOffer.fetch(purchaseOffer);

  if (!offer.seller.equals(wallet.publicKey)) {
    throw new Error("Only the seller can reject this offer.");
  }

  if (Number(offer.status) !== 0) {
    throw new Error("Only pending offers can be rejected.");
  }

  return marketplace.methods
    .rejectPurchaseOffer()
    .accounts({
      seller: wallet.publicKey,
      purchaseOffer,
    })
    .rpc();
}
