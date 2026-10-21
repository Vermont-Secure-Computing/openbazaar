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
// Solzaar Security Test - Batch 8
//
// FINAL PRE-MAINNET LIFECYCLE / STATE-MACHINE TEST
//
// Order A:
//   CREATED -> DEPOSITS_COMPLETE -> COMPLETED
//
// Order B:
//   CREATED -> CANCELLED -> STOCK RESTORED
//
// Security probes:
//   - COMPLETED order cannot restore stock
//   - CANCELLED order cannot record completed sale
//   - CANCELLED order cannot submit review
//   - wrong escrow/order substitution
//   - wrong product substitution
//   - completed-sale replay
//   - stock-restoration replay
//   - cross-order receipt substitution
//   - cancelled escrow remains terminal
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

const solzaar =
  new anchor.Program(solzaarIdl, provider);

const escrowProgram =
  new anchor.Program(escrowIdl, provider);

const SOLZAAR_PROGRAM_ID =
  new PublicKey(solzaarIdl.address);

const ESCROW_PROGRAM_ID =
  new PublicKey(escrowIdl.address);

const DONATION_RECIPIENT =
  new PublicKey(
    "61Gt8siRo84pmGziia5dHuJMkx9ne1d4Cb5aHsyQGP85"
  );

// ------------------------------------------------------------
// Wallets
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

async function expectBlocked(
  label,
  fn,
  expected = null
) {
  try {
    await fn();

    console.error(
      `✗ ${label}: transaction unexpectedly succeeded`
    );

    process.exit(1);
  } catch (err) {
    const message = shortError(err);

    console.log(
      `✓ ${label}: BLOCKED (${message})`
    );

    if (
      expected &&
      !message
        .toLowerCase()
        .includes(expected.toLowerCase())
    ) {
      console.log(
        `  Note: expected message containing "${expected}", ` +
        `but rejection still occurred.`
      );
    }

    blocked++;
  }
}

async function airdrop(pubkey, sol = 10) {
  const sig =
    await connection.requestAirdrop(
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

function reputationPda(authority) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("reputation"),
      authority.toBuffer(),
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

function reviewPda(order) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("review"),
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

async function completeEscrow({
  escrow,
  vault,
  totalPrice,
  sellerDeposit,
}) {
  await depositEscrow({
    depositor: merchant,
    escrow,
    vault,
    amount: sellerDeposit,
  });

  const data =
    await escrowProgram.account.escrow.fetch(
      escrow
    );

  if (Number(data.status) !== 1) {
    throw new Error(
      `Expected DEPOSITS_COMPLETE (1), got ${data.status}`
    );
  }

  // Same settlement convention used in Batch 6.
  const payoutA = sellerDeposit;
  const payoutB = totalPrice + sellerDeposit;

  await escrowProgram.methods
    .suggestFinalization(
      new BN(payoutA),
      new BN(payoutB),
      new BN(0),
      "Batch 8 completed order"
    )
    .accounts({
      signer: merchant.publicKey,
      escrow,
    })
    .signers([merchant])
    .rpc();

  await escrowProgram.methods
    .acceptFinalization()
    .accounts({
      signer: buyer.publicKey,
      escrow,
      partyA: buyer.publicKey,
      partyB: merchant.publicKey,
      vault,
      donationRecipient: DONATION_RECIPIENT,
    })
    .signers([buyer])
    .rpc();

  const completed =
    await escrowProgram.account.escrow.fetch(
      escrow
    );

  if (Number(completed.status) !== 3) {
    throw new Error(
      `Expected COMPLETED (3), got ${completed.status}`
    );
  }
}

// ============================================================
// START
// ============================================================

banner("Solzaar Security Test Batch 8");

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

// ============================================================
// 0. Program verification
// ============================================================

banner("0. Program verification");

for (const [name, address] of [
  ["Solzaar", SOLZAAR_PROGRAM_ID],
  ["Escrow", ESCROW_PROGRAM_ID],
]) {
  const info =
    await connection.getAccountInfo(address);

  if (!info || !info.executable) {
    throw new Error(
      `${name} program not executable`
    );
  }

  ok(`${name} program executable`);
}

// ============================================================
// 1. Funding
// ============================================================

banner("1. Funding");

await airdrop(merchant.publicKey, 25);
await airdrop(buyer.publicKey, 25);
await airdrop(attacker.publicKey, 10);

ok("Merchant funded");
ok("Buyer funded");
ok("Attacker funded");

// ============================================================
// 2. Merchant / reputation / products
// ============================================================

banner("2. Merchant / product setup");

const merchantProfile =
  merchantPda(merchant.publicKey);

const reputation =
  reputationPda(merchant.publicKey);

await solzaar.methods
  .createMerchant(
    "Batch 8 Store",
    "https://example.com/store.json",
    "https://example.com/logo.png",
    "https://example.com/banner.png",
    "Cavite",
    1000,
    "batch8@example.com"
  )
  .accounts({
    authority: merchant.publicKey,
    merchantProfile,
    systemProgram: SystemProgram.programId,
  })
  .signers([merchant])
  .rpc();

ok("Merchant created");

await solzaar.methods
  .initializeReputation()
  .accounts({
    merchantProfile,
    reputation,
    payer: merchant.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([merchant])
  .rpc();

ok("Reputation initialized");

const PRODUCT_ID = new BN(8001);
const WRONG_PRODUCT_ID = new BN(8002);

const product =
  productPda(
    merchant.publicKey,
    PRODUCT_ID
  );

const wrongProduct =
  productPda(
    merchant.publicKey,
    WRONG_PRODUCT_ID
  );

const PRICE = 1_000_000;
const INITIAL_STOCK = 30;

for (const [id, pda, title] of [
  [PRODUCT_ID, product, "Batch 8 Product"],
  [
    WRONG_PRODUCT_ID,
    wrongProduct,
    "Batch 8 Wrong Product",
  ],
]) {
  await solzaar.methods
    .createProduct(
      id,
      title,
      "https://example.com/product.json",
      ["https://example.com/image.png"],
      "tests",
      new BN(PRICE),
      INITIAL_STOCK
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

ok("Products created");

// ============================================================
// ORDER A - WILL COMPLETE
// ============================================================

banner("3. Create Order A (will COMPLETE)");

const QTY_A = 2;
const TOTAL_A = PRICE * QTY_A;

const SECURITY_A =
  Math.floor(
    (TOTAL_A * 1000) / 10_000
  ) || 1;

const BUYER_DEPOSIT_A =
  TOTAL_A + SECURITY_A;

const SELLER_DEPOSIT_A =
  SECURITY_A;

const ESCROW_ID_A =
  new BN(800001);

const A =
  await createEscrow({
    escrowId: ESCROW_ID_A,
    creator: buyer,
    partyA: buyer.publicKey,
    partyB: merchant.publicKey,
    referenceAmount: TOTAL_A,
    requiredDepositA: BUYER_DEPOSIT_A,
    requiredDepositB: SELLER_DEPOSIT_A,
    note: JSON.stringify({
      marketplace: "solbazaar",
      batch: 8,
      order: "A",
    }),
  });

await depositEscrow({
  depositor: buyer,
  escrow: A.escrow,
  vault: A.vault,
  amount: BUYER_DEPOSIT_A,
});

const orderA =
  orderPda(A.escrow);

const beforeA =
  await solzaar.account.product.fetch(
    product
  );

await solzaar.methods
  .createOrderRecord(QTY_A)
  .accounts({
    buyer: buyer.publicKey,
    escrow: A.escrow,
    product,
    merchantProfile,
    orderRecord: orderA,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

const afterA =
  await solzaar.account.product.fetch(
    product
  );

if (
  afterA.stock !==
  beforeA.stock - QTY_A
) {
  throw new Error(
    "Order A stock reservation incorrect"
  );
}

ok(
  `Order A reserved ${QTY_A}: ` +
  `${beforeA.stock} -> ${afterA.stock}`
);

// ============================================================
// ORDER B - WILL CANCEL
// ============================================================

banner("4. Create Order B (will CANCEL)");

const QTY_B = 3;
const TOTAL_B = PRICE * QTY_B;

const SECURITY_B =
  Math.floor(
    (TOTAL_B * 1000) / 10_000
  ) || 1;

const BUYER_DEPOSIT_B =
  TOTAL_B + SECURITY_B;

const SELLER_DEPOSIT_B =
  SECURITY_B;

const ESCROW_ID_B =
  new BN(800002);

const B =
  await createEscrow({
    escrowId: ESCROW_ID_B,
    creator: buyer,
    partyA: buyer.publicKey,
    partyB: merchant.publicKey,
    referenceAmount: TOTAL_B,
    requiredDepositA: BUYER_DEPOSIT_B,
    requiredDepositB: SELLER_DEPOSIT_B,
    note: JSON.stringify({
      marketplace: "solbazaar",
      batch: 8,
      order: "B",
    }),
  });

await depositEscrow({
  depositor: buyer,
  escrow: B.escrow,
  vault: B.vault,
  amount: BUYER_DEPOSIT_B,
});

const orderB =
  orderPda(B.escrow);

const beforeB =
  await solzaar.account.product.fetch(
    product
  );

await solzaar.methods
  .createOrderRecord(QTY_B)
  .accounts({
    buyer: buyer.publicKey,
    escrow: B.escrow,
    product,
    merchantProfile,
    orderRecord: orderB,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

const afterB =
  await solzaar.account.product.fetch(
    product
  );

if (
  afterB.stock !==
  beforeB.stock - QTY_B
) {
  throw new Error(
    "Order B stock reservation incorrect"
  );
}

ok(
  `Order B reserved ${QTY_B}: ` +
  `${beforeB.stock} -> ${afterB.stock}`
);

// ============================================================
// 5. Complete A
// ============================================================

banner("5. Complete Order A");

await completeEscrow({
  escrow: A.escrow,
  vault: A.vault,
  totalPrice: TOTAL_A,
  sellerDeposit: SELLER_DEPOSIT_A,
});

ok("Order A escrow reached COMPLETED (3)");

const completedSaleA =
  completedSalePda(orderA);

const soldBeforeA =
  await solzaar.account.product.fetch(
    product
  );

await solzaar.methods
  .recordCompletedSale()
  .accounts({
    buyer: buyer.publicKey,
    escrow: A.escrow,
    orderRecord: orderA,
    product,
    merchantProfile,
    completedSale: completedSaleA,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

const soldAfterA =
  await solzaar.account.product.fetch(
    product
  );

if (
  soldAfterA.sold !==
  soldBeforeA.sold + QTY_A
) {
  throw new Error(
    "Completed Order A did not increment sold correctly"
  );
}

ok(
  `Order A recorded completed sale: sold ` +
  `${soldBeforeA.sold} -> ${soldAfterA.sold}`
);

// ============================================================
// 6. COMPLETED cannot restore stock
// ============================================================

banner(
  "6. COMPLETED order cannot restore stock"
);

const restorationA =
  stockRestorationPda(orderA);

const stockBeforeCompletedRestore =
  await solzaar.account.product.fetch(
    product
  );

await expectBlocked(
  "COMPLETED Order A cannot restore reserved stock",
  async () => {
    await solzaar.methods
      .restoreCancelledOrderStock()
      .accounts({
        payer: buyer.publicKey,
        escrow: A.escrow,
        orderRecord: orderA,
        product,
        stockRestoration: restorationA,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  },
  "cancel"
);

const stockAfterCompletedRestore =
  await solzaar.account.product.fetch(
    product
  );

if (
  stockAfterCompletedRestore.stock !==
  stockBeforeCompletedRestore.stock
) {
  throw new Error(
    "COMPLETED restore attempt mutated stock"
  );
}

ok(
  "COMPLETED restore attempt left stock unchanged"
);

// ============================================================
// 7. Cancel B
// ============================================================

banner("7. Cancel Order B");

await escrowProgram.methods
  .withdrawBeforeComplete()
  .accounts({
    withdrawer: buyer.publicKey,
    escrow: B.escrow,
    creator: buyer.publicKey,
    vault: B.vault,
  })
  .signers([buyer])
  .rpc();

const cancelledB =
  await escrowProgram.account.escrow.fetch(
    B.escrow
  );

if (Number(cancelledB.status) !== 4) {
  throw new Error(
    `Order B expected CANCELLED 4, got ${cancelledB.status}`
  );
}

ok("Order B escrow reached CANCELLED (4)");

const cancelledAccount =
  await connection.getAccountInfo(
    B.escrow
  );

if (!cancelledAccount) {
  throw new Error(
    "Cancelled Order B escrow disappeared"
  );
}

ok("Cancelled Order B escrow remains on-chain");

// ============================================================
// 8. CANCELLED cannot complete
// ============================================================

banner(
  "8. CANCELLED order cannot become completed sale"
);

const completedSaleB =
  completedSalePda(orderB);

await expectBlocked(
  "CANCELLED Order B cannot record completed sale",
  async () => {
    await solzaar.methods
      .recordCompletedSale()
      .accounts({
        buyer: buyer.publicKey,
        escrow: B.escrow,
        orderRecord: orderB,
        product,
        merchantProfile,
        completedSale: completedSaleB,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  },
  "completed"
);

// ============================================================
// 9. CANCELLED cannot review
// ============================================================

banner(
  "9. CANCELLED order cannot submit review"
);

const reviewB =
  reviewPda(orderB);

const repBeforeCancelledReview =
  await solzaar.account.merchantReputation.fetch(
    reputation
  );

await expectBlocked(
  "Buyer cannot review CANCELLED Order B",
  async () => {
    await solzaar.methods
      .submitReview(
        5,
        "Cancelled order must not be reviewable"
      )
      .accounts({
        reviewer: buyer.publicKey,
        escrow: B.escrow,
        merchantProfile,
        orderRecord: orderB,
        product,
        reputation,
        review: reviewB,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  },
  "completed"
);

const repAfterCancelledReview =
  await solzaar.account.merchantReputation.fetch(
    reputation
  );

if (
  repBeforeCancelledReview.totalReviews.toString() !==
    repAfterCancelledReview.totalReviews.toString() ||
  repBeforeCancelledReview.totalRating.toString() !==
    repAfterCancelledReview.totalRating.toString()
) {
  throw new Error(
    "Cancelled review attempt mutated reputation"
  );
}

ok(
  "Cancelled review attempt did not mutate reputation"
);

// ============================================================
// 10. Cross escrow/order substitution
// ============================================================

banner("10. Cross escrow/order substitution");

await expectBlocked(
  "Cannot use COMPLETED escrow A with Order B",
  async () => {
    const fakeCompleted =
      completedSalePda(orderB);

    await solzaar.methods
      .recordCompletedSale()
      .accounts({
        buyer: buyer.publicKey,
        escrow: A.escrow,
        orderRecord: orderB,
        product,
        merchantProfile,
        completedSale: fakeCompleted,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

await expectBlocked(
  "Cannot use CANCELLED escrow B with Order A restoration",
  async () => {
    await solzaar.methods
      .restoreCancelledOrderStock()
      .accounts({
        payer: buyer.publicKey,
        escrow: B.escrow,
        orderRecord: orderA,
        product,
        stockRestoration: restorationA,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

ok("Cross escrow/order substitution blocked");

// ============================================================
// 11. Wrong product restoration
// ============================================================

banner("11. Wrong product substitution");

const restorationB =
  stockRestorationPda(orderB);

const wrongBefore =
  await solzaar.account.product.fetch(
    wrongProduct
  );

await expectBlocked(
  "Cannot restore Order B quantity into wrong product",
  async () => {
    await solzaar.methods
      .restoreCancelledOrderStock()
      .accounts({
        payer: buyer.publicKey,
        escrow: B.escrow,
        orderRecord: orderB,
        product: wrongProduct,
        stockRestoration: restorationB,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

const wrongAfter =
  await solzaar.account.product.fetch(
    wrongProduct
  );

if (
  wrongAfter.stock !==
  wrongBefore.stock
) {
  throw new Error(
    "Wrong product restoration mutated stock"
  );
}

ok("Wrong product remained unchanged");

// ============================================================
// 12. Legitimate restoration of B
// ============================================================

banner(
  "12. Legitimate CANCELLED stock restoration"
);

const beforeRestoreB =
  await solzaar.account.product.fetch(
    product
  );

await solzaar.methods
  .restoreCancelledOrderStock()
  .accounts({
    payer: buyer.publicKey,
    escrow: B.escrow,
    orderRecord: orderB,
    product,
    stockRestoration: restorationB,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

const afterRestoreB =
  await solzaar.account.product.fetch(
    product
  );

if (
  afterRestoreB.stock !==
  beforeRestoreB.stock + QTY_B
) {
  throw new Error(
    `Order B restoration incorrect: ` +
    `${beforeRestoreB.stock} -> ${afterRestoreB.stock}`
  );
}

ok(
  `Order B restored exactly ${QTY_B}: ` +
  `${beforeRestoreB.stock} -> ${afterRestoreB.stock}`
);

// ============================================================
// 13. Final inventory invariant
// ============================================================

banner("13. Final inventory invariant");

//
// Initial stock = 30
//
// A completed quantity 2:
//   stays removed from stock
//
// B cancelled quantity 3:
//   restored
//
// Therefore final stock MUST be:
//   30 - 2 = 28
//

const finalProduct =
  await solzaar.account.product.fetch(
    product
  );

const EXPECTED_FINAL_STOCK =
  INITIAL_STOCK - QTY_A;

if (
  finalProduct.stock !==
  EXPECTED_FINAL_STOCK
) {
  throw new Error(
    `FINAL INVENTORY INVARIANT FAILED: ` +
    `expected ${EXPECTED_FINAL_STOCK}, ` +
    `got ${finalProduct.stock}`
  );
}

if (
  finalProduct.sold !== QTY_A
) {
  throw new Error(
    `FINAL SOLD INVARIANT FAILED: ` +
    `expected ${QTY_A}, got ${finalProduct.sold}`
  );
}

ok(
  `Final stock correct: ${finalProduct.stock}`
);

ok(
  `Final sold correct: ${finalProduct.sold}`
);

ok(
  `Inventory invariant holds: initial ${INITIAL_STOCK}, ` +
  `completed ${QTY_A}, cancelled/restored ${QTY_B}`
);

// ============================================================
// 14. Completed-sale replay
// ============================================================

banner("14. Completed-sale replay");

await expectBlocked(
  "Order A completed sale cannot be replayed",
  async () => {
    await solzaar.methods
      .recordCompletedSale()
      .accounts({
        buyer: buyer.publicKey,
        escrow: A.escrow,
        orderRecord: orderA,
        product,
        merchantProfile,
        completedSale: completedSaleA,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

const afterSaleReplay =
  await solzaar.account.product.fetch(
    product
  );

if (
  afterSaleReplay.stock !==
    finalProduct.stock ||
  afterSaleReplay.sold !==
    finalProduct.sold
) {
  throw new Error(
    "Completed-sale replay mutated product"
  );
}

ok(
  "Completed-sale replay caused no mutation"
);

// ============================================================
// 15. Restoration replay
// ============================================================

banner("15. Stock-restoration replay");

await expectBlocked(
  "Order B restoration cannot be replayed",
  async () => {
    await solzaar.methods
      .restoreCancelledOrderStock()
      .accounts({
        payer: buyer.publicKey,
        escrow: B.escrow,
        orderRecord: orderB,
        product,
        stockRestoration: restorationB,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

const afterRestoreReplay =
  await solzaar.account.product.fetch(
    product
  );

if (
  afterRestoreReplay.stock !==
    finalProduct.stock ||
  afterRestoreReplay.sold !==
    finalProduct.sold
) {
  throw new Error(
    "Restoration replay mutated product"
  );
}

ok(
  "Stock-restoration replay caused no mutation"
);

// ============================================================
// 16. Cross receipt substitution
// ============================================================

banner("16. Cross receipt/PDA substitution");

await expectBlocked(
  "Order A cannot use Order B StockRestoration PDA",
  async () => {
    await solzaar.methods
      .restoreCancelledOrderStock()
      .accounts({
        payer: buyer.publicKey,
        escrow: A.escrow,
        orderRecord: orderA,
        product,
        stockRestoration: restorationB,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

await expectBlocked(
  "Order B cannot use Order A CompletedSale PDA",
  async () => {
    await solzaar.methods
      .recordCompletedSale()
      .accounts({
        buyer: buyer.publicKey,
        escrow: B.escrow,
        orderRecord: orderB,
        product,
        merchantProfile,
        completedSale: completedSaleA,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

ok("Cross-order receipt/PDA substitution blocked");

// ============================================================
// 17. CANCELLED remains terminal after restoration
// ============================================================

banner(
  "17. CANCELLED remains terminal after stock restoration"
);

await expectBlocked(
  "Cannot deposit to restored CANCELLED escrow",
  async () => {
    await depositEscrow({
      depositor: buyer,
      escrow: B.escrow,
      vault: B.vault,
      amount: BUYER_DEPOSIT_B,
    });
  },
  "status"
);

await expectBlocked(
  "Cannot finalize restored CANCELLED escrow",
  async () => {
    await escrowProgram.methods
      .suggestFinalization(
        new BN(0),
        new BN(0),
        new BN(0),
        "attempt to revive cancelled order"
      )
      .accounts({
        signer: buyer.publicKey,
        escrow: B.escrow,
      })
      .signers([buyer])
      .rpc();
  },
  "status"
);

const finalEscrowB =
  await escrowProgram.account.escrow.fetch(
    B.escrow
  );

if (Number(finalEscrowB.status) !== 4) {
  throw new Error(
    "Cancelled escrow B changed state after restoration"
  );
}

ok(
  "Restored Order B remains permanently CANCELLED (4)"
);

// ============================================================
// 18. Final no-mutation check
// ============================================================

banner("18. Final no-mutation check");

const absoluteFinal =
  await solzaar.account.product.fetch(
    product
  );

if (
  absoluteFinal.stock !==
    EXPECTED_FINAL_STOCK ||
  absoluteFinal.sold !==
    QTY_A
) {
  throw new Error(
    `Final state changed unexpectedly: ` +
    `stock=${absoluteFinal.stock}, ` +
    `sold=${absoluteFinal.sold}`
  );
}

ok(
  `Final product state stable: ` +
  `stock=${absoluteFinal.stock}, ` +
  `sold=${absoluteFinal.sold}`
);

// ============================================================
// Summary
// ============================================================

banner("Batch 8 Summary");

console.log(`PASS checks:    ${passed}`);
console.log(`Blocked attacks:${blocked}`);
console.log(`Findings:       ${findings}`);

console.log(
  "\nFinal lifecycle expected:"
);

console.log(
  `Order A: COMPLETED quantity=${QTY_A}`
);

console.log(
  `Order B: CANCELLED quantity=${QTY_B} + stock restored`
);

console.log(
  `Initial stock: ${INITIAL_STOCK}`
);

console.log(
  `Expected final stock: ${EXPECTED_FINAL_STOCK}`
);

console.log(
  `Expected sold: ${QTY_A}`
);

console.log(
  "\nCritical pre-mainnet properties:"
);

console.log(
  "1. COMPLETED orders cannot restore stock."
);

console.log(
  "2. CANCELLED orders cannot become completed sales."
);

console.log(
  "3. CANCELLED orders cannot create reviews."
);

console.log(
  "4. Escrow/order substitution is blocked."
);

console.log(
  "5. Product substitution is blocked."
);

console.log(
  "6. Completed-sale replay is blocked."
);

console.log(
  "7. Stock-restoration replay is blocked."
);

console.log(
  "8. Cross-order receipt/PDA substitution is blocked."
);

console.log(
  "9. CANCELLED remains terminal after restoration."
);

console.log(
  "10. Final inventory invariant remains correct."
);

console.log(
  "\nBatch 8 finished."
);
