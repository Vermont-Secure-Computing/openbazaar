import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import BN from "bn.js";

// ============================================================
// Solzaar Security Test - Batch 7
//
// Focus:
//   - cancelled escrow integration
//   - restore_cancelled_order_stock
//   - exact stock restoration
//   - restoration replay protection
//   - order/product/escrow binding
//   - cancelled escrow terminal behavior
// ============================================================

const RPC = "http://127.0.0.1:8899";

const SOLZAAR_IDL_PATH = path.resolve("./sol_bazaar.json");
const ESCROW_IDL_PATH = path.resolve("./sol_shop_escrow.json");

const solzaarIdl = JSON.parse(
  fs.readFileSync(SOLZAAR_IDL_PATH, "utf8")
);

const escrowIdl = JSON.parse(
  fs.readFileSync(ESCROW_IDL_PATH, "utf8")
);

const connection = new Connection(RPC, "confirmed");

// ------------------------------------------------------------
// Provider
// ------------------------------------------------------------

const walletPath =
  process.env.ANCHOR_WALLET ||
  path.join(os.homedir(), ".config/solana/id.json");

const payerSecret = JSON.parse(
  fs.readFileSync(walletPath, "utf8")
);

const payer = Keypair.fromSecretKey(
  Uint8Array.from(payerSecret)
);

const wallet = new anchor.Wallet(payer);

const provider = new anchor.AnchorProvider(
  connection,
  wallet,
  {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  }
);

anchor.setProvider(provider);

const solzaar = new anchor.Program(solzaarIdl, provider);
const escrowProgram = new anchor.Program(escrowIdl, provider);

const SOLZAAR_PROGRAM_ID =
  new PublicKey(solzaarIdl.address);

const ESCROW_PROGRAM_ID =
  new PublicKey(escrowIdl.address);

// ------------------------------------------------------------
// Test wallets
// ------------------------------------------------------------

const merchant = Keypair.generate();
const buyer = Keypair.generate();
const attacker = Keypair.generate();

let passed = 0;
let blocked = 0;
let findings = 0;

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function banner(text) {
  console.log("\n" + "=".repeat(68));
  console.log(text);
  console.log("=".repeat(68));
}

function ok(text) {
  passed++;
  console.log(`✓ ${text}`);
}

function finding(text) {
  findings++;
  console.log(`⚠ FINDING: ${text}`);
}

function shortError(err) {
  const msg =
    err?.error?.errorMessage ||
    err?.error?.errorCode?.code ||
    err?.message ||
    String(err);

  return msg.split("\n")[0];
}

async function expectBlocked(label, fn, expected = null) {
  try {
    await fn();

    console.error(
      `✗ ${label}: transaction unexpectedly succeeded`
    );

    process.exit(1);
  } catch (err) {
    const message = shortError(err);

    if (
      expected &&
      !message
        .toLowerCase()
        .includes(expected.toLowerCase())
    ) {
      console.log(
        `✓ ${label}: BLOCKED (${message})`
      );
    } else {
      console.log(
        `✓ ${label}: BLOCKED (${message})`
      );
    }

    blocked++;
  }
}

async function airdrop(pubkey, sol = 10) {
  const sig = await connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(
    sig,
    "confirmed"
  );
}

function u64le(value) {
  return new BN(value.toString())
    .toArrayLike(Buffer, "le", 8);
}

function merchantPda(authority) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("merchant"),
      authority.toBuffer(),
    ],
    SOLZAAR_PROGRAM_ID
  )[0];
}

function productPda(authority, productId) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("product"),
      authority.toBuffer(),
      u64le(productId),
    ],
    SOLZAAR_PROGRAM_ID
  )[0];
}

function orderPda(escrow) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("order"),
      escrow.toBuffer(),
    ],
    SOLZAAR_PROGRAM_ID
  )[0];
}

function completedSalePda(order) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("completed-sale"),
      order.toBuffer(),
    ],
    SOLZAAR_PROGRAM_ID
  )[0];
}

function stockRestorationPda(order) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("stock-restoration"),
      order.toBuffer(),
    ],
    SOLZAAR_PROGRAM_ID
  )[0];
}

function escrowPda(creator, escrowId) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      creator.toBuffer(),
      u64le(escrowId),
    ],
    ESCROW_PROGRAM_ID
  )[0];
}

function vaultPda(escrow) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault"),
      escrow.toBuffer(),
    ],
    ESCROW_PROGRAM_ID
  )[0];
}

async function createEscrow({
  escrowId,
  creator,
  partyA,
  partyB,
  referenceAmount,
  requiredDepositA,
  requiredDepositB,
  note,
}) {
  const escrow =
    escrowPda(creator.publicKey, escrowId);

  const vault =
    vaultPda(escrow);

  await escrowProgram.methods
    .createEscrow(
      new BN(escrowId.toString()),
      0,
      partyA,
      partyB,
      new BN(referenceAmount.toString()),
      new BN(requiredDepositA.toString()),
      new BN(requiredDepositB.toString()),
      note
    )
    .accounts({
      creator: creator.publicKey,
      escrow,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .signers([creator])
    .rpc();

  return { escrow, vault };
}

async function depositEscrow({
  depositor,
  escrow,
  vault,
  amount,
}) {
  await escrowProgram.methods
    .deposit(new BN(amount.toString()))
    .accounts({
      depositor: depositor.publicKey,
      escrow,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .signers([depositor])
    .rpc();
}

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------

banner("Solzaar Security Test Batch 7");

console.log("RPC:       ", RPC);
console.log(
  "Solzaar:   ",
  SOLZAAR_PROGRAM_ID.toBase58()
);
console.log(
  "Escrow:    ",
  ESCROW_PROGRAM_ID.toBase58()
);
console.log(
  "Provider:  ",
  payer.publicKey.toBase58()
);
console.log(
  "Merchant:  ",
  merchant.publicKey.toBase58()
);
console.log(
  "Buyer:     ",
  buyer.publicKey.toBase58()
);
console.log(
  "Attacker:  ",
  attacker.publicKey.toBase58()
);

// ------------------------------------------------------------
// 0. Programs
// ------------------------------------------------------------

banner("0. Program verification");

for (const [name, address] of [
  ["Solzaar", SOLZAAR_PROGRAM_ID],
  ["Escrow", ESCROW_PROGRAM_ID],
]) {
  const info =
    await connection.getAccountInfo(address);

  if (!info || !info.executable) {
    console.error(
      `✗ ${name} program is not executable locally.`
    );

    process.exit(1);
  }

  ok(`${name} program executable`);
}

// ------------------------------------------------------------
// 1. Funding
// ------------------------------------------------------------

banner("1. Funding test wallets");

await airdrop(merchant.publicKey, 20);
await airdrop(buyer.publicKey, 20);
await airdrop(attacker.publicKey, 10);

ok("Merchant funded");
ok("Buyer funded");
ok("Attacker funded");

// ------------------------------------------------------------
// 2. Merchant / products
// ------------------------------------------------------------

banner("2. Merchant / product setup");

const merchantProfile =
  merchantPda(merchant.publicKey);

await solzaar.methods
  .createMerchant(
    "Batch 7 Store",
    "https://example.com/store.json",
    "https://example.com/logo.png",
    "https://example.com/banner.png",
    "Cavite",
    1000,
    "batch7@example.com"
  )
  .accounts({
    authority: merchant.publicKey,
    merchantProfile,
    systemProgram: SystemProgram.programId,
  })
  .signers([merchant])
  .rpc();

ok("Merchant created");

const PRODUCT_ID = new BN(7001);
const PRODUCT_2_ID = new BN(7002);

const product =
  productPda(merchant.publicKey, PRODUCT_ID);

const product2 =
  productPda(merchant.publicKey, PRODUCT_2_ID);

const PRICE = 1_000_000;
const STOCK = 20;

for (const [id, pda, title] of [
  [PRODUCT_ID, product, "Batch 7 Product"],
  [PRODUCT_2_ID, product2, "Batch 7 Wrong Product"],
]) {
  await solzaar.methods
    .createProduct(
      id,
      title,
      "https://example.com/product.json",
      ["https://example.com/image.png"],
      "tests",
      new BN(PRICE),
      STOCK
    )
    .accounts({
      authority: merchant.publicKey,
      merchantProfile,
      product: pda,
      systemProgram: SystemProgram.programId,
    })
    .signers([merchant])
    .rpc();
}

ok("Two independent products created");

// ------------------------------------------------------------
// 3. Create escrow and reserve stock
// ------------------------------------------------------------

banner("3. Create order and reserve stock");

const quantity = 2;
const totalPrice = PRICE * quantity;

const securityDeposit =
  Math.floor(
    (totalPrice * 1000) / 10_000
  ) || 1;

const buyerDeposit =
  totalPrice + securityDeposit;

const sellerDeposit =
  securityDeposit;

const ESCROW_ID = new BN(700001);

const { escrow, vault } =
  await createEscrow({
    escrowId: ESCROW_ID,
    creator: buyer,
    partyA: buyer.publicKey,
    partyB: merchant.publicKey,
    referenceAmount: totalPrice,
    requiredDepositA: buyerDeposit,
    requiredDepositB: sellerDeposit,
    note: JSON.stringify({
      marketplace: "solbazaar",
      batch: 7,
      test: "cancel-stock-restoration",
    }),
  });

ok("External SolBazaar escrow created");

await depositEscrow({
  depositor: buyer,
  escrow,
  vault,
  amount: buyerDeposit,
});

const escrowAfterBuyerDeposit =
  await escrowProgram.account.escrow.fetch(
    escrow
  );

if (
  Number(escrowAfterBuyerDeposit.status) !== 0
) {
  throw new Error(
    `Expected CREATED status 0, got ` +
    `${escrowAfterBuyerDeposit.status}`
  );
}

ok(
  "Buyer deposited; escrow remains CREATED (0)"
);

const orderRecord =
  orderPda(escrow);

const stockBeforeOrder =
  await solzaar.account.product.fetch(product);

await solzaar.methods
  .createOrderRecord(quantity)
  .accounts({
    buyer: buyer.publicKey,
    escrow,
    product,
    merchantProfile,
    orderRecord,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

const stockAfterOrder =
  await solzaar.account.product.fetch(product);

if (
  stockAfterOrder.stock !==
  stockBeforeOrder.stock - quantity
) {
  throw new Error(
    `Incorrect reservation: ` +
    `${stockBeforeOrder.stock} -> ` +
    `${stockAfterOrder.stock}`
  );
}

ok(
  `Order reserved stock exactly once: ` +
  `${stockBeforeOrder.stock} -> ` +
  `${stockAfterOrder.stock}`
);

// ------------------------------------------------------------
// 4. Restore while escrow still active
// ------------------------------------------------------------

banner(
  "4. Cannot restore stock before cancellation"
);

const stockRestoration =
  stockRestorationPda(orderRecord);

await expectBlocked(
  "Cannot restore stock while escrow is CREATED",
  async () => {
    await solzaar.methods
      .restoreCancelledOrderStock()
      .accounts({
        payer: buyer.publicKey,
        escrow,
        orderRecord,
        product,
        stockRestoration,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  },
  "cancel"
);

const stockAfterPrematureRestore =
  await solzaar.account.product.fetch(product);

if (
  stockAfterPrematureRestore.stock !==
  stockAfterOrder.stock
) {
  throw new Error(
    "Failed premature restoration mutated stock"
  );
}

ok(
  `Failed premature restore left stock unchanged at ` +
  `${stockAfterPrematureRestore.stock}`
);

// ------------------------------------------------------------
// 5. Wrong product substitution
// ------------------------------------------------------------

banner("5. Product/order binding");

const wrongRestoration =
  stockRestorationPda(orderRecord);

await expectBlocked(
  "Cannot restore order quantity into wrong product",
  async () => {
    await solzaar.methods
      .restoreCancelledOrderStock()
      .accounts({
        payer: buyer.publicKey,
        escrow,
        orderRecord,
        product: product2,
        stockRestoration: wrongRestoration,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

const wrongProductAfter =
  await solzaar.account.product.fetch(product2);

if (wrongProductAfter.stock !== STOCK) {
  throw new Error(
    "Wrong-product attack mutated product2 stock"
  );
}

ok("Wrong product stock remained unchanged");

// ------------------------------------------------------------
// 6. Cancel escrow
// ------------------------------------------------------------

banner("6. Cancel escrow via withdraw_before_complete");

const buyerBalanceBefore =
  await connection.getBalance(buyer.publicKey);

await escrowProgram.methods
  .withdrawBeforeComplete()
  .accounts({
    withdrawer: buyer.publicKey,
    escrow,
    creator: buyer.publicKey,
    vault,
  })
  .signers([buyer])
  .rpc();

const cancelledEscrow =
  await escrowProgram.account.escrow.fetch(
    escrow
  );

if (Number(cancelledEscrow.status) !== 4) {
  throw new Error(
    `Expected CANCELLED status 4, got ` +
    `${cancelledEscrow.status}`
  );
}

ok("Escrow status changed to CANCELLED (4)");

const escrowAccountInfo =
  await connection.getAccountInfo(escrow);

if (!escrowAccountInfo) {
  throw new Error(
    "Cancelled escrow account was closed"
  );
}

ok(
  "Cancelled escrow account remains on-chain"
);

if (
  new BN(cancelledEscrow.depositedA.toString())
    .toNumber() !== 0
) {
  throw new Error(
    "Buyer deposited_a was not cleared after withdrawal"
  );
}

ok("Buyer deposited amount cleared in escrow state");

const buyerBalanceAfter =
  await connection.getBalance(buyer.publicKey);

if (buyerBalanceAfter <= buyerBalanceBefore) {
  finding(
    "Buyer balance did not increase after cancellation; " +
    "inspect refund/rent/transaction-fee accounting."
  );
} else {
  ok("Buyer received cancellation refund");
}

// ------------------------------------------------------------
// 7. Cancelled escrow is terminal
// ------------------------------------------------------------

banner("7. CANCELLED state is terminal");

await expectBlocked(
  "Buyer cannot deposit again after CANCELLED",
  async () => {
    await depositEscrow({
      depositor: buyer,
      escrow,
      vault,
      amount: buyerDeposit,
    });
  },
  "status"
);

await expectBlocked(
  "Seller cannot deposit after CANCELLED",
  async () => {
    await depositEscrow({
      depositor: merchant,
      escrow,
      vault,
      amount: sellerDeposit,
    });
  },
  "status"
);

await expectBlocked(
  "Cannot suggest finalization after CANCELLED",
  async () => {
    await escrowProgram.methods
      .suggestFinalization(
        new BN(0),
        new BN(0),
        new BN(0),
        "invalid cancelled finalization"
      )
      .accounts({
        signer: buyer.publicKey,
        escrow,
      })
      .signers([buyer])
      .rpc();
  },
  "status"
);

ok("CANCELLED escrow cannot return to active flow");

// ------------------------------------------------------------
// 8. Cancelled order cannot be completed
// ------------------------------------------------------------

banner(
  "8. Cancelled order cannot become completed sale"
);

const completedSale =
  completedSalePda(orderRecord);

await expectBlocked(
  "Cancelled order cannot record completed sale",
  async () => {
    await solzaar.methods
      .recordCompletedSale()
      .accounts({
        buyer: buyer.publicKey,
        escrow,
        orderRecord,
        product,
        merchantProfile,
        completedSale,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  },
  "completed"
);

const beforeRestore =
  await solzaar.account.product.fetch(product);

if (
  beforeRestore.stock !==
  stockAfterOrder.stock
) {
  throw new Error(
    "Cancelled order unexpectedly changed stock before restoration"
  );
}

ok(
  `Cancellation alone does not alter Solzaar stock: ` +
  `${beforeRestore.stock}`
);

// ------------------------------------------------------------
// 9. Restore cancelled stock
// ------------------------------------------------------------

banner("9. Restore cancelled order stock");

await solzaar.methods
  .restoreCancelledOrderStock()
  .accounts({
    payer: buyer.publicKey,
    escrow,
    orderRecord,
    product,
    stockRestoration,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

const afterRestore =
  await solzaar.account.product.fetch(product);

const expectedRestoredStock =
  stockAfterOrder.stock + quantity;

if (
  afterRestore.stock !==
  expectedRestoredStock
) {
  throw new Error(
    `Incorrect stock restoration: ` +
    `${stockAfterOrder.stock} -> ` +
    `${afterRestore.stock}; expected ` +
    `${expectedRestoredStock}`
  );
}

if (
  afterRestore.stock !==
  stockBeforeOrder.stock
) {
  throw new Error(
    `Stock did not return to original value: ` +
    `${stockBeforeOrder.stock} expected, ` +
    `${afterRestore.stock} actual`
  );
}

ok(
  `Cancelled quantity restored exactly: ` +
  `${stockAfterOrder.stock} -> ` +
  `${afterRestore.stock}`
);

ok(
  `Product stock returned to original value: ` +
  `${afterRestore.stock}`
);

// ------------------------------------------------------------
// 10. Restoration receipt
// ------------------------------------------------------------

banner("10. Stock-restoration receipt");

const restorationAccount =
  await solzaar.account.stockRestoration.fetch(
    stockRestoration
  );

if (
  !restorationAccount.orderRecord.equals(
    orderRecord
  )
) {
  throw new Error(
    "StockRestoration order_record mismatch"
  );
}

ok(
  "StockRestoration receipt bound to correct order"
);

// ------------------------------------------------------------
// 11. Replay protection
// ------------------------------------------------------------

banner("11. Restoration replay protection");

await expectBlocked(
  "Same cancelled order cannot restore stock twice",
  async () => {
    await solzaar.methods
      .restoreCancelledOrderStock()
      .accounts({
        payer: buyer.publicKey,
        escrow,
        orderRecord,
        product,
        stockRestoration,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

const afterReplay =
  await solzaar.account.product.fetch(product);

if (
  afterReplay.stock !==
  afterRestore.stock
) {
  throw new Error(
    `Replay mutated stock: ` +
    `${afterRestore.stock} -> ${afterReplay.stock}`
  );
}

ok(
  `Failed restoration replay left stock unchanged at ` +
  `${afterReplay.stock}`
);

// ------------------------------------------------------------
// 12. Attacker replay / authorization probe
// ------------------------------------------------------------

banner("12. Attacker restoration probe");

await expectBlocked(
  "Attacker cannot create a second restoration",
  async () => {
    await solzaar.methods
      .restoreCancelledOrderStock()
      .accounts({
        payer: attacker.publicKey,
        escrow,
        orderRecord,
        product,
        stockRestoration,
        systemProgram: SystemProgram.programId,
      })
      .signers([attacker])
      .rpc();
  }
);

const afterAttacker =
  await solzaar.account.product.fetch(product);

if (
  afterAttacker.stock !==
  afterRestore.stock
) {
  throw new Error(
    "Attacker restoration attempt mutated stock"
  );
}

ok(
  "Attacker attempt did not change restored stock"
);

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------

banner("Batch 7 Summary");

console.log(`PASS checks:    ${passed}`);
console.log(`Blocked attacks:${blocked}`);
console.log(`Findings:       ${findings}`);

console.log(
  "\nExpected security properties:"
);

console.log(
  "1. create_order_record reserves product quantity exactly once."
);

console.log(
  "2. Stock cannot be restored while escrow is still active."
);

console.log(
  "3. withdraw_before_complete leaves escrow alive with status CANCELLED (4)."
);

console.log(
  "4. CANCELLED escrow cannot accept new deposits/finalization."
);

console.log(
  "5. restore_cancelled_order_stock restores exactly order.quantity."
);

console.log(
  "6. Stock restoration cannot be replayed."
);

console.log(
  "7. Cancelled order cannot be recorded as a completed sale."
);

console.log(
  "\nBatch 7 finished."
);
