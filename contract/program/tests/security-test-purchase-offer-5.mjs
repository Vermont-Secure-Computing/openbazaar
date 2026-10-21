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

const bindingPda = (e) =>
  pda([Buffer.from("escrow_binding"), e.toBuffer()], marketId);

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
      escrowBinding: bindingPda(e),
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
      escrowBinding: bindingPda(o.e),
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
    .accountsStrict({
      merchantProfile: merchantPda,
      product: product,
      authority: merchant.publicKey,
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
        escrowBinding: bindingPda(f.e),
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

  // ============================================================
  // Batch 4A — Verify actual escrow CPI failure
  // ============================================================

  console.log("\n=== Batch 4A: Escrow CPI Failure Verification ===");

  let insufficientFundsError = null;

  try {
    await acceptOffer(h);
  } catch (error) {
    insufficientFundsError = error;
  }

  if (!insufficientFundsError) {
    throw new Error(
      "SECURITY FAILURE: Seller accepted without sufficient funds",
    );
  }

  const errorLogs = [
    ...(insufficientFundsError.logs || []),
    ...(insufficientFundsError.transactionLogs || []),
  ];

  const errorText = [
    insufficientFundsError.message || "",
    insufficientFundsError.error?.errorMessage || "",
    ...errorLogs,
  ].join("\n");

  console.log("\n--- Failed acceptance logs ---");
  console.log(errorText);

  const escrowInvoked = errorLogs.some((line) =>
    line.includes(`Program ${escrowId.toBase58()} invoke`),
  );

  if (!escrowInvoked) {
    throw new Error(
      "Escrow CPI was not observed. Check whether an earlier " +
        "account constraint or rent requirement caused the failure.",
    );
  }

  const insufficientFundsDetected =
    /insufficient funds|insufficient lamports|insufficient balance/i.test(
      errorText,
    );

  if (!insufficientFundsDetected) {
    throw new Error(
      "Escrow CPI was invoked, but insufficient-funds cause " +
        "was not confirmed in logs.",
    );
  }

  blocked++;

  console.log("✓ BLOCKED: Escrow CPI rejected insufficient seller funds");

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

  // ============================================================
  // Batch 4B — Successful Retry After Restoring Funds
  // ============================================================

  console.log("\n=== Batch 4B: Successful Seller Retry ===");

  const sellerBalanceBeforeRetry = await connection.getBalance(
    merchant.publicKey,
  );

  const vaultBalanceBeforeRetry = await connection.getBalance(h.vault);

  const productBeforeRetry = await market.account.product.fetch(product);

  const offerBeforeRetry = await market.account.purchaseOffer.fetch(h.offer);

  const escrowBeforeRetry = await escrowProgram.account.escrow.fetch(h.e);

  if (offerBeforeRetry.status !== 0) {
    throw new Error("Offer must still be Pending before retry");
  }

  if (escrowBeforeRetry.status !== 0) {
    throw new Error("Escrow must still be Created before retry");
  }

  if (sellerBalanceBeforeRetry < SECURITY) {
    throw new Error("Seller balance was not restored sufficiently");
  }

  if (await connection.getAccountInfo(orderAddress)) {
    throw new Error("OrderRecord unexpectedly exists before retry");
  }

  // Retry the SAME PurchaseOffer.
  const retrySignature = await acceptOffer(h);

  console.log("Retry transaction:", retrySignature);

  // Fetch confirmed state.
  const offerAfterRetry = await market.account.purchaseOffer.fetch(h.offer);

  const escrowAfterRetry = await escrowProgram.account.escrow.fetch(h.e);

  const productAfterRetry = await market.account.product.fetch(product);

  const vaultBalanceAfterRetry = await connection.getBalance(h.vault);

  const orderAfterRetry = await connection.getAccountInfo(orderAddress);

  // 1. Offer must become Accepted.
  if (offerAfterRetry.status !== 1) {
    throw new Error("Retry failed: Offer is not Accepted");
  }

  ok("Previously failed PurchaseOffer successfully accepted");

  // 2. Escrow must become DepositsComplete.
  if (escrowAfterRetry.status !== 1) {
    throw new Error("Retry failed: Escrow is not fully funded");
  }

  ok("Escrow reached DepositsComplete");

  // 3. Seller deposit must equal exact required bond.
  if (!escrowAfterRetry.depositedB.eq(new BN(SECURITY))) {
    throw new Error("Retry failed: Incorrect seller deposit amount");
  }

  ok("Escrow recorded exact seller security bond");

  // 4. Vault must receive exactly SECURITY lamports.
  const actualVaultIncrease = vaultBalanceAfterRetry - vaultBalanceBeforeRetry;

  if (actualVaultIncrease !== SECURITY) {
    throw new Error(
      `Retry failed: Vault increased by ${actualVaultIncrease}, ` +
        `expected ${SECURITY}`,
    );
  }

  ok("Vault received exact seller bond amount");

  // 5. Stock must decrease by exactly one.
  if (productAfterRetry.stock !== productBeforeRetry.stock - 1) {
    throw new Error("Retry failed: Product stock not correctly reserved");
  }

  ok("Product stock reserved exactly once");

  // 6. OrderRecord must exist.
  if (!orderAfterRetry) {
    throw new Error("Retry failed: OrderRecord was not created");
  }

  if (!orderAfterRetry.owner.equals(marketId)) {
    throw new Error("Retry failed: OrderRecord has incorrect owner");
  }

  ok("OrderRecord created under marketplace program");

  // 7. Double acceptance must remain blocked.
  await expectBlocked("Seller cannot accept retried offer twice", () =>
    acceptOffer(h),
  );

  console.log("\n✓ Batch 4 successful retry verified");

  // ============================================================
  // Batch 5 — Account Substitution & Escrow Integrity
  // ============================================================

  console.log("\n=== Batch 5: Account Substitution ===");

  // Ensure each rejected attempt preserves the original state.
  async function assertOfferUnchanged(o, before, label) {
    const offer = await market.account.purchaseOffer.fetch(o.offer);
    const escrow = await escrowProgram.account.escrow.fetch(o.e);
    const productAccount = await market.account.product.fetch(product);
    const vaultBalance = await connection.getBalance(o.vault);
    const orderInfo = await connection.getAccountInfo(orderPda(o.e));

    if (offer.status !== before.offerStatus) {
      throw new Error(`${label}: PurchaseOffer status changed`);
    }

    if (escrow.status !== before.escrowStatus) {
      throw new Error(`${label}: Escrow status changed`);
    }

    if (!escrow.depositedB.eq(before.depositedB)) {
      throw new Error(`${label}: Seller deposit changed`);
    }

    if (productAccount.stock !== before.stock) {
      throw new Error(`${label}: Product stock changed`);
    }

    if (vaultBalance !== before.vaultBalance) {
      throw new Error(`${label}: Vault balance changed`);
    }

    if (orderInfo !== null) {
      throw new Error(`${label}: OrderRecord unexpectedly created`);
    }

    ok(`${label}: State unchanged`);
  }

  async function snapshotOffer(o) {
    const offer = await market.account.purchaseOffer.fetch(o.offer);
    const escrow = await escrowProgram.account.escrow.fetch(o.e);
    const productAccount = await market.account.product.fetch(product);

    if (await connection.getAccountInfo(orderPda(o.e))) {
      throw new Error("Snapshot requires an offer without OrderRecord");
    }

    return {
      offerStatus: offer.status,
      escrowStatus: escrow.status,
      depositedB: escrow.depositedB,
      stock: productAccount.stock,
      vaultBalance: await connection.getBalance(o.vault),
    };
  }

  // Strictly reject only when the supplied error evidence
  // matches the expected account-validation failure.
  async function expectAccountBlocked(label, action, expectedPattern) {
    let caught = null;

    try {
      await action();
    } catch (error) {
      caught = error;
    }

    if (!caught) {
      throw new Error(`SECURITY FAILURE: ${label} unexpectedly succeeded`);
    }

    const details = [
      caught.message || "",
      caught.error?.errorMessage || "",
      caught.error?.errorCode?.code || "",
      ...(caught.logs || []),
      ...(caught.transactionLogs || []),
    ].join("\n");

    if (!expectedPattern.test(details)) {
      console.error(`\nUnexpected rejection for ${label}:`);
      console.error(details);

      throw new Error(`${label}: Rejected for an unverified reason`);
    }

    blocked++;
    console.log(`✓ BLOCKED: ${label}`);
  }

  // Build an acceptance instruction with account overrides.
  function acceptWithAccounts(o, overrides = {}) {
    const accounts = {
      seller: merchant.publicKey,
      escrow: o.e,
      purchaseOffer: o.offer,
      product,
      merchantProfile: merchantPda,
      orderRecord: orderPda(o.e),
      vault: o.vault,
      escrowBinding: bindingPda(o.e),
      escrowProgram: escrowId,
      systemProgram: SystemProgram.programId,
      ...overrides,
    };

    return market.methods
      .acceptPurchaseOffer()
      .accounts(accounts)
      .signers([merchant])
      .rpc();
  }

  // ------------------------------------------------------------
  // Test 1 — PurchaseOffer from another escrow
  // ------------------------------------------------------------

  console.log("\n--- Test 1: Cross-escrow PurchaseOffer ---");

  const b5a = await createOffer(920001);
  const b5b = await createOffer(920002);

  const b5aBefore = await snapshotOffer(b5a);
  const b5bBefore = await snapshotOffer(b5b);

  await expectAccountBlocked(
    "Cannot substitute PurchaseOffer from another escrow",
    () =>
      acceptWithAccounts(b5a, {
        purchaseOffer: b5b.offer,
      }),
    /constraintseeds|seeds constraint|invalid purchaseoffer escrow|invalid escrow/i,
  );

  await assertOfferUnchanged(b5a, b5aBefore, "Original escrow protected");

  await assertOfferUnchanged(b5b, b5bBefore, "Substituted offer protected");

  // ------------------------------------------------------------
  // Test 2 — Vault from another escrow
  // ------------------------------------------------------------

  console.log("\n--- Test 2: Cross-escrow Vault ---");

  const b5c = await createOffer(920003);
  const b5cBefore = await snapshotOffer(b5c);

  await expectAccountBlocked(
    "Cannot substitute another escrow's vault",
    () =>
      acceptWithAccounts(b5c, {
        vault: b5a.vault,
      }),
    /constraintseeds|seeds constraint|invalid purchaseoffer escrow|invalid vault|invalid escrow/i,
  );

  await assertOfferUnchanged(b5c, b5cBefore, "Cross-escrow vault substitution");

  // ------------------------------------------------------------
  // Test 3 — OrderRecord PDA from another escrow
  // ------------------------------------------------------------

  console.log("\n--- Test 3: Wrong OrderRecord PDA ---");

  const b5d = await createOffer(920004);
  const b5dBefore = await snapshotOffer(b5d);

  await expectAccountBlocked(
    "Cannot use another escrow's OrderRecord PDA",
    () =>
      acceptWithAccounts(b5d, {
        orderRecord: orderPda(b5a.e),
      }),
    /constraintseeds|seeds constraint|invalid seeds/i,
  );

  await assertOfferUnchanged(b5d, b5dBefore, "Wrong OrderRecord PDA");

  // ------------------------------------------------------------
  // Test 4 — Wrong MerchantProfile
  // ------------------------------------------------------------

  console.log("\n--- Test 4: Wrong MerchantProfile ---");

  const b5e = await createOffer(920005);
  const b5eBefore = await snapshotOffer(b5e);

  const fakeMerchantProfile = Keypair.generate().publicKey;

  await expectAccountBlocked(
    "Cannot substitute a nonexistent MerchantProfile",
    () =>
      acceptWithAccounts(b5e, {
        merchantProfile: fakeMerchantProfile,
      }),
    /accountnotinitialized|account not initialized|accountnotfound|account does not exist|could not find account/i,
  );

  await assertOfferUnchanged(b5e, b5eBefore, "Wrong MerchantProfile");

  // ------------------------------------------------------------
  // Test 5 — Wrong Product account
  // ------------------------------------------------------------

  console.log("\n--- Test 5: Wrong Product ---");

  const b5f = await createOffer(920006);
  const b5fBefore = await snapshotOffer(b5f);

  const fakeProduct = Keypair.generate().publicKey;

  await expectAccountBlocked(
    "Cannot substitute a nonexistent Product",
    () =>
      acceptWithAccounts(b5f, {
        product: fakeProduct,
      }),
    /accountnotinitialized|account not initialized|accountnotfound|account does not exist|could not find account/i,
  );

  await assertOfferUnchanged(b5f, b5fBefore, "Wrong Product");

  // ------------------------------------------------------------
  // Test 6 — Wrong seller
  // ------------------------------------------------------------

  console.log("\n--- Test 6: Unauthorized Seller ---");

  const b5g = await createOffer(920007);
  const b5gBefore = await snapshotOffer(b5g);

  await expectAccountBlocked(
    "Attacker cannot accept another seller's offer",
    () => acceptOffer(b5g, attacker),
    /unauthorized|constraintseeds|seeds constraint|invalid order seller/i,
  );

  await assertOfferUnchanged(b5g, b5gBefore, "Unauthorized seller");

  // ------------------------------------------------------------
  // Test 7 — Valid offer still works after substitution tests
  // ------------------------------------------------------------

  console.log("\n--- Test 7: Valid Acceptance Control ---");

  const b5h = await createOffer(920008);
  const b5hBefore = await snapshotOffer(b5h);

  await acceptOffer(b5h);

  const b5hOffer = await market.account.purchaseOffer.fetch(b5h.offer);
  const b5hEscrow = await escrowProgram.account.escrow.fetch(b5h.e);
  const b5hProduct = await market.account.product.fetch(product);
  const b5hVaultBalance = await connection.getBalance(b5h.vault);
  const b5hOrderInfo = await connection.getAccountInfo(orderPda(b5h.e));

  if (b5hOffer.status !== 1) {
    throw new Error("Valid acceptance did not update offer status");
  }

  if (b5hEscrow.status !== 1) {
    throw new Error("Valid acceptance did not fully fund escrow");
  }

  if (!b5hEscrow.depositedB.eq(new BN(SECURITY))) {
    throw new Error("Valid acceptance recorded incorrect seller bond");
  }

  if (b5hVaultBalance - b5hBefore.vaultBalance !== SECURITY) {
    throw new Error("Valid acceptance transferred incorrect bond");
  }

  if (b5hProduct.stock !== b5hBefore.stock - 1) {
    throw new Error("Valid acceptance reserved incorrect stock");
  }

  if (!b5hOrderInfo || !b5hOrderInfo.owner.equals(marketId)) {
    throw new Error("Valid acceptance did not create OrderRecord");
  }

  ok("Valid offer accepted after substitution tests");
  ok("Valid escrow fully funded");
  ok("Valid seller bond transferred exactly");
  ok("Valid stock reservation and OrderRecord verified");

  console.log("\n✓ Batch 5 account-substitution tests completed");

  console.log(
    `\nRESULT: ${passed} passed; ` + `${blocked} expected failures blocked.`,
  );
}

main().catch((error) => {
  console.error("\n✗ TEST FAILED:", error?.stack || error);

  process.exitCode = 1;
});
