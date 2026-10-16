
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import BN from "bn.js";

// Batch 9: Product-specific security deposit BPS.
// Persistent Localnet: no ledger reset or program deployment.

const here = path.dirname(fileURLToPath(import.meta.url));

const load = (name) =>
  JSON.parse(fs.readFileSync(path.join(here, name), "utf8"));

const marketIdl = load("sol_bazaar.json");
const escrowIdl = load("sol_shop_escrow.json");

const connection = new Connection(
  "http://127.0.0.1:8899",
  "confirmed"
);

const walletPath =
  process.env.ANCHOR_WALLET ||
  path.join(os.homedir(), ".config/solana/id.json");

const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(fs.readFileSync(walletPath, "utf8"))
  )
);

const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(payer),
  {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  }
);

anchor.setProvider(provider);

const market = new anchor.Program(marketIdl, provider);
const escrowProgram = new anchor.Program(escrowIdl, provider);

const marketId = new PublicKey(marketIdl.address);
const escrowId = new PublicKey(escrowIdl.address);

const merchant = Keypair.generate();
const buyer = Keypair.generate();

const merchantBps = 2000; // 20%
const PRICE = 100_000_000; // 0.1 SOL
const STOCK = 30;

const u64le = (value) =>
  new BN(value.toString()).toArrayLike(Buffer, "le", 8);

const pda = (seeds, programId) =>
  PublicKey.findProgramAddressSync(seeds, programId)[0];

const merchantProfile = pda(
  [Buffer.from("merchant"), merchant.publicKey.toBuffer()],
  marketId
);

const productPda = (id) =>
  pda(
    [
      Buffer.from("product"),
      merchant.publicKey.toBuffer(),
      u64le(id),
    ],
    marketId
  );

const escrowPda = (id) =>
  pda(
    [
      Buffer.from("escrow"),
      buyer.publicKey.toBuffer(),
      u64le(id),
    ],
    escrowId
  );

const vaultPda = (escrow) =>
  pda(
    [Buffer.from("vault"), escrow.toBuffer()],
    escrowId
  );

const orderPda = (escrow) =>
  pda(
    [Buffer.from("order"), escrow.toBuffer()],
    marketId
  );

let passed = 0;

function pass(label) {
  passed++;
  console.log(`✓ ${label}`);
}

function assertBps(actual, expected, label) {
  assert.equal(
    actual == null ? null : Number(actual),
    expected,
    label
  );
  pass(label);
}

async function rejected(label, operation, expectedFragment) {
  let error;

  try {
    await operation();
  } catch (e) {
    error = e;
  }

  assert.ok(error, `${label}: unexpectedly succeeded`);

  const detail = [
    error?.error?.errorCode?.code,
    error?.error?.errorMessage,
    error?.message,
    ...(error?.logs || []),
    ...(error?.errorLogs || []),
  ]
    .filter(Boolean)
    .join(" | ");

  assert.ok(
    detail.includes(expectedFragment),
    `${label}: wrong rejection: ${detail}`
  );

  pass(`${label} (${expectedFragment})`);
}

async function airdrop(key, sol) {
  const sig = await connection.requestAirdrop(
    key,
    sol * LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(sig, "confirmed");
}

async function createProduct(id, override) {
  const product = productPda(id);

  await market.methods
    .createProduct(
      new BN(id),
      `Batch 9 Product ${id}`,
      "https://example.com/product.json",
      ["https://example.com/image.png"],
      "tests",
      new BN(PRICE),
      STOCK,
      override
    )
    .accounts({
      authority: merchant.publicKey,
      merchantProfile,
      product,
      systemProgram: SystemProgram.programId,
    })
    .signers([merchant])
    .rpc();

  return product;
}

async function updateProduct(product, override) {
  const current = await market.account.product.fetch(product);

  await market.methods
    .updateProduct(
      current.title,
      current.descriptionUri,
      current.imageUris,
      current.category,
      current.price,
      current.stock,
      current.active,
      override
    )
    .accounts({
      product,
      authority: merchant.publicKey,
    })
    .signers([merchant])
    .rpc();
}

async function createEscrow({
  id,
  total,
  requiredBuyer,
  requiredSeller,
  fundBuyer = true,
}) {
  const escrow = escrowPda(id);
  const vault = vaultPda(escrow);

  await escrowProgram.methods
    .createEscrow(
      new BN(id),
      0,
      buyer.publicKey,
      merchant.publicKey,
      new BN(total),
      new BN(requiredBuyer),
      new BN(requiredSeller),
      JSON.stringify({
        marketplace: "solbazaar",
        checkout: "buy",
        batch: 9,
        id,
      })
    )
    .accounts({
      creator: buyer.publicKey,
      escrow,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();

  if (fundBuyer) {
    await escrowProgram.methods
      .deposit(new BN(requiredBuyer))
      .accounts({
        depositor: buyer.publicKey,
        escrow,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }

  return escrow;
}

async function createOrder(escrow, product) {
  return market.methods
    .createOrderRecord(1)
    .accounts({
      buyer: buyer.publicKey,
      escrow,
      product,
      merchantProfile,
      orderRecord: orderPda(escrow),
      systemProgram: SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();
}

async function orderCase(label, id, override, expectedBps) {
  const product = await createProduct(id, override);

  const stored = await market.account.product.fetch(product);

  assertBps(
    stored.sellerDepositBpsOverride,
    override,
    `${label}: override stored`
  );

  const bond = Math.max(
    1,
    Math.floor((PRICE * expectedBps) / 10_000)
  );

  const escrow = await createEscrow({
    id: id + 100_000,
    total: PRICE,
    requiredBuyer: PRICE + bond,
    requiredSeller: bond,
  });

  await createOrder(escrow, product);

  const after = await market.account.product.fetch(product);

  assert.equal(after.stock, STOCK - 1);

  const order = await market.account.orderRecord.fetch(
    orderPda(escrow)
  );

  assert.equal(order.price.toString(), String(PRICE));

  pass(
    `${label}: order accepted, deposit=${bond}, ` +
    `stock ${STOCK} -> ${after.stock}`
  );

  return product;
}

// ============================================================
// START TESTS
// ============================================================

console.log(
  "\n=== Solzaar Security Test Batch 9: Product BPS ==="
);

// 0. Program verification

for (const [name, id] of [
  ["Marketplace", marketId],
  ["Escrow", escrowId],
]) {
  assert.equal(
    (await connection.getAccountInfo(id))?.executable,
    true,
    `${name} not executable`
  );
}

pass("Marketplace and Escrow programs executable");

// 1. Funding

await airdrop(merchant.publicKey, 15);
await airdrop(buyer.publicKey, 15);

pass("Merchant and buyer funded");

// 2. Merchant setup (20%)

await market.methods
  .createMerchant(
    "Batch 9 Store",
    "https://example.com/store.json",
    "https://example.com/logo.png",
    "https://example.com/banner.png",
    "Cavite",
    merchantBps,
    "batch9@example.com"
  )
  .accounts({
    authority: merchant.publicKey,
    merchantProfile,
    systemProgram: SystemProgram.programId,
  })
  .signers([merchant])
  .rpc();

assert.equal(
  Number(
    (await market.account.merchantProfile.fetch(merchantProfile))
      .sellerDepositBps
  ),
  2000
);

pass("Merchant BPS = 20%");

// 3. Product BPS scenarios

await orderCase("Inherit 20%", 9001, null, 2000);

await orderCase("Override 0%", 9002, 0, 0);

await orderCase("Override 50%", 9003, 5000, 5000);

await orderCase("Override 100%", 9004, 10000, 10000);

// 4. Reject invalid BPS on create

await rejected(
  "Override 10001 rejected on create",
  () => createProduct(9005, 10001),
  "Invalid"
);

assert.equal(
  await connection.getAccountInfo(productPda(9005)),
  null,
  "Invalid product unexpectedly created"
);

pass("Invalid product PDA not created");

// 5. Product update tests

const editable = await createProduct(9006, null);

await updateProduct(editable, 5000);

assertBps(
  (await market.account.product.fetch(editable))
    .sellerDepositBpsOverride,
  5000,
  "Update null -> 50%"
);

await rejected(
  "Override 10001 rejected on update",
  () => updateProduct(editable, 10001),
  "Invalid"
);

assertBps(
  (await market.account.product.fetch(editable))
    .sellerDepositBpsOverride,
  5000,
  "Invalid update left override unchanged"
);

await updateProduct(editable, null);

assertBps(
  (await market.account.product.fetch(editable))
    .sellerDepositBpsOverride,
  null,
  "Update 50% -> inherit"
);

// 6. Deposit validation attacks

const negative = await createProduct(9007, 5000);

const bond = Math.floor((PRICE * 5000) / 10_000);

const stockBefore = (
  await market.account.product.fetch(negative)
).stock;

const cases = [
  {
    label: "Wrong buyer required deposit",
    id: 19001,
    buyerBond: bond - 1,
    sellerBond: bond,
    fund: true,
    error: "InvalidBuyerDeposit",
  },
  {
    label: "Wrong seller required deposit",
    id: 19002,
    buyerBond: bond,
    sellerBond: bond - 1,
    fund: true,
    error: "InvalidSellerDeposit",
  },
  {
    label: "Incomplete buyer funding",
    id: 19003,
    buyerBond: bond,
    sellerBond: bond,
    fund: false,
    error: "BuyerDepositIncomplete",
  },
];

for (const c of cases) {
  const escrow = await createEscrow({
    id: c.id,
    total: PRICE,
    requiredBuyer: PRICE + c.buyerBond,
    requiredSeller: c.sellerBond,
    fundBuyer: c.fund,
  });

  await rejected(
    c.label,
    () => createOrder(escrow, negative),
    c.error
  );

  assert.equal(
    (await market.account.product.fetch(negative)).stock,
    stockBefore,
    `${c.label}: stock mutated`
  );

  assert.equal(
    await connection.getAccountInfo(orderPda(escrow)),
    null,
    `${c.label}: order record unexpectedly created`
  );

  pass(`${c.label}: no stock mutation or order record`);
}

// 7. Summary

console.log(
  `\nBatch 9 PASSED: ${passed} checks.`
);

console.log("No ledger reset or program deployment.");
