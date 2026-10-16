import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import BN from "bn.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (name) =>
  JSON.parse(fs.readFileSync(path.join(here, name), "utf8"));

const marketplaceIdl = load("sol_bazaar.json");
const escrowIdl = load("sol_shop_escrow.json");

const connection = new Connection("http://127.0.0.1:8899", "confirmed");

const walletFile =
  process.env.ANCHOR_WALLET ||
  path.join(os.homedir(), ".config/solana/id.json");

const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, "utf8"))),
);

const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(payer),
  {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  },
);

anchor.setProvider(provider);

const market = new anchor.Program(marketplaceIdl, provider);
const escrowProgram = new anchor.Program(escrowIdl, provider);

const marketId = new PublicKey(marketplaceIdl.address);
const escrowId = new PublicKey(escrowIdl.address);

const merchant = Keypair.generate();
const buyer = Keypair.generate();
const attacker = Keypair.generate();

const PRICE = 100_000_000; // 0.1 SOL
const BPS = 1000;
const SECURITY = (PRICE * BPS) / 10_000;
const BUYER_DEPOSIT = PRICE + SECURITY;

const u64le = (n) => new BN(n.toString()).toArrayLike(Buffer, "le", 8);

const pda = (seeds, program) =>
  PublicKey.findProgramAddressSync(seeds, program)[0];

const merchantPda = pda(
  [Buffer.from("merchant"), merchant.publicKey.toBuffer()],
  marketId,
);

const productId = new BN(910001);

const product = pda(
  [Buffer.from("product"), merchant.publicKey.toBuffer(), u64le(productId)],
  marketId,
);

const escrowPda = (n) =>
  pda([Buffer.from("escrow"), buyer.publicKey.toBuffer(), u64le(n)], escrowId);

const vaultPda = (e) => pda([Buffer.from("vault"), e.toBuffer()], escrowId);

const offerPda = (e) =>
  pda([Buffer.from("purchase_offer"), e.toBuffer()], marketId);

let passed = 0;
let blocked = 0;

function ok(message) {
  passed++;
  console.log("✓ PASS:", message);
}

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

async function offerStatus(address) {
  return (await market.account.purchaseOffer.fetch(address)).status;
}

async function escrowStatus(address) {
  return (await escrowProgram.account.escrow.fetch(address)).status;
}

async function expectBlocked(label, action) {
  let rejected = false;

  try {
    await action();
  } catch (error) {
    rejected = true;
    blocked++;

    console.log(
      "✓ BLOCKED:",
      label,
      "-",
      (error.error?.errorMessage || error.message || String(error)).split(
        "\n",
      )[0],
    );
  }

  if (!rejected) {
    fail(label, "Unexpectedly succeeded");
  }
}

async function fund(keypair, sol = 5) {
  const signature = await connection.requestAirdrop(
    keypair.publicKey,
    sol * LAMPORTS_PER_SOL,
  );

  await connection.confirmTransaction(signature, "confirmed");
}

async function createOffer(n) {
  const e = escrowPda(n);
  const vault = vaultPda(e);
  const offer = offerPda(e);

  await escrowProgram.methods
    .createEscrow(
      new BN(n),
      0,
      buyer.publicKey,
      merchant.publicKey,
      new BN(PRICE),
      new BN(BUYER_DEPOSIT),
      new BN(SECURITY),
      JSON.stringify({
        marketplace: "solbazaar",
        checkout: "offer",
      }),
    )
    .accounts({
      creator: buyer.publicKey,
      escrow: e,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();

  await escrowProgram.methods
    .deposit(new BN(BUYER_DEPOSIT))
    .accounts({
      depositor: buyer.publicKey,
      escrow: e,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();

  await market.methods
    .createPurchaseOffer(new BN(PRICE), 1)
    .accounts({
      buyer: buyer.publicKey,
      escrow: e,
      product,
      merchantProfile: merchantPda,
      purchaseOffer: offer,
      systemProgram: SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();

  if ((await offerStatus(offer)) !== 0) {
    fail("createOffer", "Offer is not Pending");
  }

  ok(`Offer ${n} created and buyer funded`);

  return { e, vault, offer };
}

const orderPda = (e) => pda([Buffer.from("order"), e.toBuffer()], marketId);

async function acceptOffer(o, signer = merchant) {
  return market.methods
    .acceptPurchaseOffer()
    .accounts({
      seller: signer.publicKey,
      escrow: o.e,
      purchaseOffer: o.offer,
      product,
      merchantProfile: merchantPda,
      orderRecord: orderPda(o.e),
      vault: o.vault,
      escrowProgram: escrowId,
      systemProgram: SystemProgram.programId,
    })
    .signers([signer])
    .rpc();
}

function reject(offer, signer) {
  return market.methods
    .rejectPurchaseOffer()
    .accounts({
      seller: signer.publicKey,
      purchaseOffer: offer,
    })
    .signers([signer])
    .rpc();
}

function markWithdrawn(o, signer) {
  return market.methods
    .withdrawPurchaseOffer()
    .accounts({
      buyer: signer.publicKey,
      escrow: o.e,
      purchaseOffer: o.offer,
    })
    .signers([signer])
    .rpc();
}

async function refundIx(o) {
  return escrowProgram.methods
    .withdrawBeforeComplete()
    .accounts({
      withdrawer: buyer.publicKey,
      escrow: o.e,
      creator: buyer.publicKey,
      vault: o.vault,
    })
    .instruction();
}

async function markIx(o) {
  return market.methods
    .withdrawPurchaseOffer()
    .accounts({
      buyer: buyer.publicKey,
      escrow: o.e,
      purchaseOffer: o.offer,
    })
    .instruction();
}

async function atomicWithdraw(o) {
  const tx = new Transaction().add(await refundIx(o), await markIx(o));

  return sendAndConfirmTransaction(connection, tx, [payer, buyer], {
    commitment: "confirmed",
  });
}

async function main() {
  console.log("\n=== SolBazaar PurchaseOffer Security Batch 2 ===");

  console.log("Marketplace:", marketId.toBase58());
  console.log("Escrow:", escrowId.toBase58());

  // Verify deployed programs.
  for (const id of [marketId, escrowId]) {
    const info = await connection.getAccountInfo(id);

    if (!info?.executable) {
      fail("preflight", `Program not deployed: ${id.toBase58()}`);
    }
  }

  await Promise.all([fund(merchant), fund(buyer), fund(attacker)]);

  // Create merchant.
  await market.methods
    .createMerchant(
      "Offer Test Store",
      "https://example.com/store.json",
      "https://example.com/logo.png",
      "https://example.com/banner.png",
      "Cavite",
      BPS,
      "offer-test@example.com",
    )
    .accounts({
      authority: merchant.publicKey,
      merchantProfile: merchantPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([merchant])
    .rpc();

  // Create product.
  await market.methods
    .createProduct(
      productId,
      "Offer Test Product",
      "https://example.com/product.json",
      ["https://example.com/image.png"],
      "tests",
      new BN(PRICE),
      30,
    )
    .accounts({
      authority: merchant.publicKey,
      merchantProfile: merchantPda,
      product,
      systemProgram: SystemProgram.programId,
    })
    .signers([merchant])
    .rpc();

  ok("Merchant and product initialized");

  // Test A: Seller rejection and buyer refund.
  const a = await createOffer(910001);

  await expectBlocked("Attacker cannot reject offer", () =>
    reject(a.offer, attacker),
  );

  await expectBlocked("Attacker cannot mark offer withdrawn", () =>
    markWithdrawn(a, attacker),
  );

  await expectBlocked("Cannot mark withdrawn before escrow cancellation", () =>
    markWithdrawn(a, buyer),
  );

  if ((await offerStatus(a.offer)) !== 0) {
    fail("pending", "Failed probes changed status");
  }

  await reject(a.offer, merchant);

  if ((await offerStatus(a.offer)) !== 2) {
    fail("reject", "Expected Rejected status");
  }

  ok("Seller rejected pending offer");

  await expectBlocked("Seller cannot reject twice", () =>
    reject(a.offer, merchant),
  );

  await atomicWithdraw(a);

  if ((await offerStatus(a.offer)) !== 3 || (await escrowStatus(a.e)) !== 4) {
    fail("atomic refund", "Final status mismatch");
  }

  ok("Atomic refund and marketplace withdrawal");

  await expectBlocked("Double marketplace withdrawal", () =>
    markWithdrawn(a, buyer),
  );

  await expectBlocked("Double escrow refund", async () => {
    const tx = new Transaction().add(await refundIx(a));

    await sendAndConfirmTransaction(connection, tx, [payer, buyer], {
      commitment: "confirmed",
    });
  });

  // Test B: Buyer withdraws pending offer.
  const b = await createOffer(910002);

  await atomicWithdraw(b);

  if ((await offerStatus(b.offer)) !== 3 || (await escrowStatus(b.e)) !== 4) {
    fail("pending withdrawal", "Expected statuses 3/4");
  }

  ok("Buyer can withdraw pending offer atomically");

  await expectBlocked("Seller cannot reject withdrawn offer", () =>
    reject(b.offer, merchant),
  );

  // Test C: Direct escrow cancellation.
  const c = await createOffer(910003);

  await escrowProgram.methods
    .withdrawBeforeComplete()
    .accounts({
      withdrawer: buyer.publicKey,
      escrow: c.e,
      creator: buyer.publicKey,
      vault: c.vault,
    })
    .signers([buyer])
    .rpc();

  if ((await offerStatus(c.offer)) !== 0 || (await escrowStatus(c.e)) !== 4) {
    fail("cancel-before-mark", "Unexpected intermediate state");
  }

  ok("Direct escrow cancellation leaves offer Pending until synchronized");

  await markWithdrawn(c, buyer);

  if ((await offerStatus(c.offer)) !== 3) {
    fail("sync", "Status not Withdrawn");
  }

  ok("Cancelled escrow synchronized to Withdrawn");

  const d = await createOffer(910004);

  const stockBefore = (await market.account.product.fetch(product)).stock;

  await acceptOffer(d);

  const accepted = await market.account.purchaseOffer.fetch(d.offer);

  const funded = await escrowProgram.account.escrow.fetch(d.e);

  const stockAfter = (await market.account.product.fetch(product)).stock;

  if (
    accepted.status !== 1 ||
    funded.status !== 1 ||
    !funded.depositedB.eq(new BN(SECURITY)) ||
    stockAfter !== stockBefore - 1
  ) {
    throw new Error("Seller acceptance / security deposit verification failed");
  }

  ok("Seller acceptance automatically deposits security bond");

  await expectBlocked("Seller cannot accept twice", () => acceptOffer(d));

  await expectBlocked("Buyer cannot withdraw after seller funded escrow", () =>
    atomicWithdraw(d),
  );

  // ============================================================
  // Batch 2 — Additional Security Tests
  // ============================================================

  console.log("\n=== Batch 2: Seller Bond Security ===");

  // Test: Unauthorized seller acceptance
  const e = await createOffer(910005);

  await expectBlocked("Attacker cannot accept PurchaseOffer", () =>
    acceptOffer(e, attacker),
  );

  if ((await offerStatus(e.offer)) !== 0 || (await escrowStatus(e.e)) !== 0) {
    throw new Error("Unauthorized acceptance changed offer or escrow state");
  }

  ok("Unauthorized acceptance leaves offer Pending");

  // Test: Wrong vault
  const f = await createOffer(910006);

  await expectBlocked("Seller cannot accept with wrong vault", () =>
    market.methods
      .acceptPurchaseOffer()
      .accounts({
        seller: merchant.publicKey,
        escrow: f.e,
        purchaseOffer: f.offer,
        product,
        merchantProfile: merchantPda,
        orderRecord: orderPda(f.e),
        vault: e.vault,
        escrowProgram: escrowId,
        systemProgram: SystemProgram.programId,
      })
      .signers([merchant])
      .rpc(),
  );

  if ((await offerStatus(f.offer)) !== 0 || (await escrowStatus(f.e)) !== 0) {
    throw new Error("Wrong vault attempt changed offer or escrow state");
  }

  ok("Wrong vault leaves offer Pending");

  // Test: Cancelled escrow cannot be accepted
  const g = await createOffer(910007);

  await escrowProgram.methods
    .withdrawBeforeComplete()
    .accounts({
      withdrawer: buyer.publicKey,
      escrow: g.e,
      creator: buyer.publicKey,
      vault: g.vault,
    })
    .signers([buyer])
    .rpc();

  await expectBlocked("Seller cannot accept cancelled escrow", () =>
    acceptOffer(g),
  );

  if ((await offerStatus(g.offer)) !== 0 || (await escrowStatus(g.e)) !== 4) {
    throw new Error("Cancelled escrow acceptance changed state");
  }

  ok("Cancelled escrow remains cancelled");

  // Test: Insufficient seller balance

  // Existing merchant has funds, so simulate an insufficient
  // balance by creating a seller-signed acceptance with an
  // intentionally inadequate account balance.
  // This test requires a separate merchant/offer fixture.
  // We will implement it in the next batch.

  // ============================================================
  // Batch 3 — Insufficient Seller Funds / Atomic Rollback
  // ============================================================

  console.log("\n=== Batch 3: Insufficient Seller Funds ===");

  // Create a fresh buyer-funded offer.
  const h = await createOffer(910008);

  // Record original state.
  const offerBefore = await market.account.purchaseOffer.fetch(h.offer);

  const escrowBefore = await escrowProgram.account.escrow.fetch(h.e);

  const productBefore = await market.account.product.fetch(product);

  const vaultBefore = await connection.getBalance(h.vault);

  const orderAddress = orderPda(h.e);

  const orderBefore = await connection.getAccountInfo(orderAddress);

  if (orderBefore !== null) {
    throw new Error("OrderRecord already exists before acceptance");
  }

  // Drain merchant's SOL, leaving enough for transaction fees,
  // but less than the required seller security deposit.
  //
  // Merchant is also the fee payer for the acceptance transaction,
  // so this intentionally uses a seller-funded transaction.

  const merchantBalance = await connection.getBalance(merchant.publicKey);

  const keepLamports = 5_000_000;
  const estimatedFee = 5_000;

  if (keepLamports >= SECURITY) {
    throw new Error("Test setup invalid: retained balance covers bond");
  }

  if (merchantBalance <= keepLamports + 5_000) {
    throw new Error("Merchant has insufficient balance for drain setup");
  }

  const drainAmount = merchantBalance - keepLamports - estimatedFee;

  if (drainAmount <= 0) {
    throw new Error("Insufficient merchant balance for setup");
  }

  const drainTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: merchant.publicKey,
      toPubkey: payer.publicKey,
      lamports: drainAmount,
    }),
  );

  await sendAndConfirmTransaction(connection, drainTx, [merchant], {
    commitment: "confirmed",
  });

  const balanceAfterDrain = await connection.getBalance(merchant.publicKey);

  if (balanceAfterDrain >= SECURITY) {
    throw new Error("Merchant still has enough funds for security deposit");
  }

  ok("Seller balance reduced below required security bond");

  // Attempt acceptance — must fail.
  await expectBlocked(
    "Seller cannot accept without sufficient bond funds",
    () => acceptOffer(h),
  );

  // Verify atomic rollback.
  const offerAfter = await market.account.purchaseOffer.fetch(h.offer);

  const escrowAfter = await escrowProgram.account.escrow.fetch(h.e);

  const productAfter = await market.account.product.fetch(product);

  const vaultAfter = await connection.getBalance(h.vault);

  const orderAfter = await connection.getAccountInfo(orderAddress);

  if (offerAfter.status !== offerBefore.status) {
    throw new Error("ROLLBACK FAILED: PurchaseOffer status changed");
  }

  if (escrowAfter.status !== escrowBefore.status) {
    throw new Error("ROLLBACK FAILED: Escrow status changed");
  }

  if (!escrowAfter.depositedB.eq(escrowBefore.depositedB)) {
    throw new Error("ROLLBACK FAILED: Seller deposit changed");
  }

  if (productAfter.stock !== productBefore.stock) {
    throw new Error("ROLLBACK FAILED: Product stock changed");
  }

  if (vaultAfter !== vaultBefore) {
    throw new Error("ROLLBACK FAILED: Vault balance changed");
  }

  if (orderAfter !== null) {
    throw new Error("ROLLBACK FAILED: OrderRecord was created");
  }

  ok("Failed seller deposit leaves PurchaseOffer Pending");
  ok("Failed seller deposit leaves escrow unchanged");
  ok("Failed seller deposit does not reserve product stock");
  ok("Failed seller deposit does not create OrderRecord");
  ok("Failed seller deposit does not change vault balance");

  // Restore merchant funds.
  await fund(merchant, 1);

  console.log("✓ Merchant balance restored");

  console.log(
    `\nRESULT: ${passed} passed; ` + `${blocked} expected failures blocked.`,
  );
}

main().catch((error) => {
  console.error("\n✗ TEST FAILED:", error?.stack || error);

  process.exitCode = 1;
});
