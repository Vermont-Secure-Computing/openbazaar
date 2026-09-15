import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import BN from "bn.js";

// ============================================================
// Solzaar Security Test - Batch 6
//
// Focus:
//   - completed sale integrity
//   - completed-sale replay protection
//   - review integrity / review replay
//   - chat authorization / arbitrary external escrow namespace
//   - cross-product / cross-user substitution
//   - unusual completed escrow payout semantics
// ============================================================

const RPC = "http://127.0.0.1:8899";

const SOLZAAR_IDL_PATH = path.resolve("./sol_bazaar.json");
const ESCROW_IDL_PATH = path.resolve("./sol_shop_escrow.json");

const solzaarIdl = JSON.parse(fs.readFileSync(SOLZAAR_IDL_PATH, "utf8"));
const escrowIdl = JSON.parse(fs.readFileSync(ESCROW_IDL_PATH, "utf8"));

const connection = new Connection(RPC, "confirmed");

// ------------------------------------------------------------
// Load default Solana CLI wallet
// ------------------------------------------------------------

const walletPath =
  process.env.ANCHOR_WALLET ||
  path.join(os.homedir(), ".config/solana/id.json");

const payerSecret = JSON.parse(fs.readFileSync(walletPath, "utf8"));
const payer = Keypair.fromSecretKey(Uint8Array.from(payerSecret));

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

const SOLZAAR_PROGRAM_ID = new PublicKey(solzaarIdl.address);
const ESCROW_PROGRAM_ID = new PublicKey(escrowIdl.address);

const DONATION_RECIPIENT =
  new PublicKey("61Gt8siRo84pmGziia5dHuJMkx9ne1d4Cb5aHsyQGP85");

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

function failUnexpected(text, err) {
  console.error(`✗ ${text}`);
  console.error(shortError(err));
  process.exit(1);
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

    console.error(`✗ ${label}: transaction unexpectedly succeeded`);
    process.exit(1);
  } catch (err) {
    const message = shortError(err);

    if (
      expected &&
      !message.toLowerCase().includes(expected.toLowerCase())
    ) {
      console.log(`✓ ${label}: BLOCKED (${message})`);
    } else {
      console.log(`✓ ${label}: BLOCKED (${message})`);
    }

    blocked++;
  }
}

async function airdrop(pubkey, sol = 10) {
  const sig = await connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(sig, "confirmed");
}

function u64le(value) {
  return new BN(value.toString()).toArrayLike(Buffer, "le", 8);
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

function reviewPda(order) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("review"),
      order.toBuffer(),
    ],
    SOLZAAR_PROGRAM_ID
  )[0];
}

function messagePda(escrow, messageId) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("message"),
      escrow.toBuffer(),
      u64le(messageId),
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

// ------------------------------------------------------------
// Escrow helper
// ------------------------------------------------------------

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
  const escrow = escrowPda(creator.publicKey, escrowId);
  const vault = vaultPda(escrow);

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

async function completeEscrowNormal({
  escrow,
  vault,
  buyerDeposit,
  sellerDeposit,
  totalPrice,
}) {
  // Seller deposits -> status becomes 1.
  await depositEscrow({
    depositor: merchant,
    escrow,
    vault,
    amount: sellerDeposit,
  });

  // Normal settlement:
  // buyer gets refundable buyer security deposit
  // merchant gets price + merchant security deposit

  const payoutA = sellerDeposit;
  const payoutB = totalPrice + sellerDeposit;

  await escrowProgram.methods
    .suggestFinalization(
      new BN(payoutA.toString()),
      new BN(payoutB.toString()),
      new BN(0),
      "Order successfully completed"
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
}

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------

banner("Solzaar Security Test Batch 6");

console.log("RPC:       ", RPC);
console.log("Solzaar:   ", SOLZAAR_PROGRAM_ID.toBase58());
console.log("Escrow:    ", ESCROW_PROGRAM_ID.toBase58());
console.log("Provider:  ", payer.publicKey.toBase58());
console.log("Merchant:  ", merchant.publicKey.toBase58());
console.log("Buyer:     ", buyer.publicKey.toBase58());
console.log("Attacker:  ", attacker.publicKey.toBase58());

// ------------------------------------------------------------
// 0. Program verification
// ------------------------------------------------------------

banner("0. Program verification");

for (const [name, address] of [
  ["Solzaar", SOLZAAR_PROGRAM_ID],
  ["Escrow", ESCROW_PROGRAM_ID],
]) {
  const info = await connection.getAccountInfo(address);

  if (!info || !info.executable) {
    console.error(`✗ ${name} program is not executable locally.`);
    process.exit(1);
  }

  ok(`${name} program executable`);
}

// ------------------------------------------------------------
// Funding
// ------------------------------------------------------------

banner("1. Funding test wallets");

await airdrop(merchant.publicKey, 20);
await airdrop(buyer.publicKey, 20);
await airdrop(attacker.publicKey, 10);

ok("Merchant funded");
ok("Buyer funded");
ok("Attacker funded");

// ------------------------------------------------------------
// Merchant setup
// ------------------------------------------------------------

banner("2. Merchant / product setup");

const merchantProfile = merchantPda(merchant.publicKey);
const reputation = reputationPda(merchant.publicKey);

await solzaar.methods
  .createMerchant(
    "Batch 6 Store",
    "https://example.com/store.json",
    "https://example.com/logo.png",
    "https://example.com/banner.png",
    "Cavite",
    1000, // 10%
    "batch6@example.com"
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

const PRODUCT_ID = new BN(6001);
const PRODUCT_2_ID = new BN(6002);

const product = productPda(merchant.publicKey, PRODUCT_ID);
const product2 = productPda(merchant.publicKey, PRODUCT_2_ID);

const PRICE = 1_000_000; // 0.001 SOL
const STOCK = 20;

await solzaar.methods
  .createProduct(
    PRODUCT_ID,
    "Batch 6 Product",
    "https://example.com/product.json",
    ["https://example.com/image.png"],
    "tests",
    new BN(PRICE),
    STOCK
  )
  .accounts({
    authority: merchant.publicKey,
    merchantProfile,
    product,
    systemProgram: SystemProgram.programId,
  })
  .signers([merchant])
  .rpc();

await solzaar.methods
  .createProduct(
    PRODUCT_2_ID,
    "Wrong Product",
    "https://example.com/product2.json",
    ["https://example.com/image2.png"],
    "tests",
    new BN(PRICE),
    STOCK
  )
  .accounts({
    authority: merchant.publicKey,
    merchantProfile,
    product: product2,
    systemProgram: SystemProgram.programId,
  })
  .signers([merchant])
  .rpc();

ok("Two independent products created");

// ------------------------------------------------------------
// 3. Create legitimate order
// ------------------------------------------------------------

banner("3. Create legitimate buyer order");

const quantity = 2;
const totalPrice = PRICE * quantity;

// seller_deposit_bps = 1000 = 10%
const securityDeposit =
  Math.floor((totalPrice * 1000) / 10_000) || 1;

const buyerDeposit = totalPrice + securityDeposit;
const sellerDeposit = securityDeposit;

const ESCROW_ID = new BN(600001);

const { escrow, vault } = await createEscrow({
  escrowId: ESCROW_ID,
  creator: buyer,
  partyA: buyer.publicKey,
  partyB: merchant.publicKey,
  referenceAmount: totalPrice,
  requiredDepositA: buyerDeposit,
  requiredDepositB: sellerDeposit,
  note: JSON.stringify({
    marketplace: "solbazaar",
    batch: 6,
  }),
});

ok("External SolBazaar escrow created");

await depositEscrow({
  depositor: buyer,
  escrow,
  vault,
  amount: buyerDeposit,
});

ok("Buyer deposited required amount; escrow remains status CREATED");

const orderRecord = orderPda(escrow);

const beforeProduct =
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

const afterOrderProduct =
  await solzaar.account.product.fetch(product);

if (
  afterOrderProduct.stock !==
  beforeProduct.stock - quantity
) {
  throw new Error(
    `Stock deduction incorrect: ${beforeProduct.stock} -> ${afterOrderProduct.stock}`
  );
}

ok(
  `Order created and stock deducted exactly once: ` +
  `${beforeProduct.stock} -> ${afterOrderProduct.stock}`
);

// ------------------------------------------------------------
// 4. Cannot record incomplete sale
// ------------------------------------------------------------

banner("4. Completed-sale status validation");

const completedSale = completedSalePda(orderRecord);

await expectBlocked(
  "record_completed_sale before escrow completion",
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

// ------------------------------------------------------------
// 5. Wrong buyer
// ------------------------------------------------------------

banner("5. Buyer binding");

await expectBlocked(
  "Attacker cannot record buyer's sale",
  async () => {
    await solzaar.methods
      .recordCompletedSale()
      .accounts({
        buyer: attacker.publicKey,
        escrow,
        orderRecord,
        product,
        merchantProfile,
        completedSale,
        systemProgram: SystemProgram.programId,
      })
      .signers([attacker])
      .rpc();
  }
);

// ------------------------------------------------------------
// 6. Wrong product substitution
// ------------------------------------------------------------

banner("6. Product/order binding");

await expectBlocked(
  "Cannot substitute another merchant product into sale",
  async () => {
    await solzaar.methods
      .recordCompletedSale()
      .accounts({
        buyer: buyer.publicKey,
        escrow,
        orderRecord,
        product: product2,
        merchantProfile,
        completedSale,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

// ------------------------------------------------------------
// 7. Complete real escrow
// ------------------------------------------------------------

banner("7. Complete escrow");

await completeEscrowNormal({
  escrow,
  vault,
  buyerDeposit,
  sellerDeposit,
  totalPrice,
});

const completedEscrowData =
  await escrowProgram.account.escrow.fetch(escrow);

if (Number(completedEscrowData.status) !== 3) {
  throw new Error(
    `Expected escrow status 3, got ${completedEscrowData.status}`
  );
}

ok("Escrow finalized with status COMPLETED (3)");

// ------------------------------------------------------------
// 8. Record completed sale
// ------------------------------------------------------------

banner("8. Record completed sale");

const soldBefore =
  await solzaar.account.product.fetch(product);

const merchantBefore =
  await solzaar.account.merchantProfile.fetch(merchantProfile);

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

const soldAfter =
  await solzaar.account.product.fetch(product);

const merchantAfter =
  await solzaar.account.merchantProfile.fetch(merchantProfile);

if (
  soldAfter.sold !==
  soldBefore.sold + quantity
) {
  throw new Error(
    `Incorrect product.sold: ${soldBefore.sold} -> ${soldAfter.sold}`
  );
}

if (
  merchantAfter.totalSold.toString() !==
  new BN(merchantBefore.totalSold.toString())
    .add(new BN(quantity))
    .toString()
) {
  throw new Error(
    `Incorrect merchant total_sold`
  );
}

ok(
  `product.sold incremented exactly by quantity: ` +
  `${soldBefore.sold} -> ${soldAfter.sold}`
);

ok(
  `merchant.total_sold incremented exactly by quantity: ` +
  `${merchantBefore.totalSold} -> ${merchantAfter.totalSold}`
);

// ------------------------------------------------------------
// 9. Completed-sale replay
// ------------------------------------------------------------

banner("9. Completed-sale replay protection");

await expectBlocked(
  "Same order cannot increment sold counters twice",
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
  }
);

const afterReplay =
  await solzaar.account.product.fetch(product);

if (afterReplay.sold !== soldAfter.sold) {
  throw new Error(
    "Replay failure mutated product.sold"
  );
}

ok("Failed replay did not mutate sold counter");

// ------------------------------------------------------------
// 10. Reviews
// ------------------------------------------------------------

banner("10. Review validation");

const review = reviewPda(orderRecord);

const reputationBefore =
  await solzaar.account.merchantReputation.fetch(reputation);

// Invalid rating 0
await expectBlocked(
  "Rating 0 rejected",
  async () => {
    await solzaar.methods
      .submitReview(0, "invalid rating")
      .accounts({
        reviewer: buyer.publicKey,
        escrow,
        merchantProfile,
        orderRecord,
        product,
        reputation,
        review,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  },
  "rating"
);

// Invalid rating 6
await expectBlocked(
  "Rating 6 rejected",
  async () => {
    await solzaar.methods
      .submitReview(6, "invalid rating")
      .accounts({
        reviewer: buyer.publicKey,
        escrow,
        merchantProfile,
        orderRecord,
        product,
        reputation,
        review,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  },
  "rating"
);

// Wrong reviewer
await expectBlocked(
  "Non-buyer cannot review order",
  async () => {
    await solzaar.methods
      .submitReview(5, "attacker review")
      .accounts({
        reviewer: attacker.publicKey,
        escrow,
        merchantProfile,
        orderRecord,
        product,
        reputation,
        review,
        systemProgram: SystemProgram.programId,
      })
      .signers([attacker])
      .rpc();
  }
);

// Wrong product
await expectBlocked(
  "Buyer cannot attach review to wrong product",
  async () => {
    await solzaar.methods
      .submitReview(5, "wrong product")
      .accounts({
        reviewer: buyer.publicKey,
        escrow,
        merchantProfile,
        orderRecord,
        product: product2,
        reputation,
        review,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

// Oversized comment
await expectBlocked(
  "Review comment >280 bytes rejected",
  async () => {
    await solzaar.methods
      .submitReview(5, "R".repeat(281))
      .accounts({
        reviewer: buyer.publicKey,
        escrow,
        merchantProfile,
        orderRecord,
        product,
        reputation,
        review,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  },
  "long"
);

// Legit review
await solzaar.methods
  .submitReview(
    5,
    "Legitimate Batch 6 completed-order review"
  )
  .accounts({
    reviewer: buyer.publicKey,
    escrow,
    merchantProfile,
    orderRecord,
    product,
    reputation,
    review,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

ok("Legitimate completed-order review accepted");

const reputationAfter =
  await solzaar.account.merchantReputation.fetch(reputation);

if (
  new BN(reputationAfter.totalReviews.toString()).sub(
    new BN(reputationBefore.totalReviews.toString())
  ).toNumber() !== 1
) {
  throw new Error("total_reviews did not increase exactly once");
}

if (
  new BN(reputationAfter.totalRating.toString()).sub(
    new BN(reputationBefore.totalRating.toString())
  ).toNumber() !== 5
) {
  throw new Error("total_rating did not increase by 5");
}

ok("Reputation counters correctly updated");

// ------------------------------------------------------------
// 11. Review replay
// ------------------------------------------------------------

banner("11. Review replay protection");

await expectBlocked(
  "Same order cannot submit a second review",
  async () => {
    await solzaar.methods
      .submitReview(
        1,
        "Attempted duplicate review"
      )
      .accounts({
        reviewer: buyer.publicKey,
        escrow,
        merchantProfile,
        orderRecord,
        product,
        reputation,
        review,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

const reputationAfterReplay =
  await solzaar.account.merchantReputation.fetch(reputation);

if (
  reputationAfterReplay.totalReviews.toString() !==
    reputationAfter.totalReviews.toString() ||
  reputationAfterReplay.totalRating.toString() !==
    reputationAfter.totalRating.toString()
) {
  throw new Error(
    "Duplicate review attempt mutated reputation"
  );
}

ok("Failed duplicate review did not mutate reputation");

// ------------------------------------------------------------
// 12. Chat authorization
// ------------------------------------------------------------

banner("12. Chat authorization");

const MESSAGE_ID = new BN(60001);
const chatMessage = messagePda(escrow, MESSAGE_ID);

await solzaar.methods
  .sendMessage(
    MESSAGE_ID,
    "Legitimate buyer message"
  )
  .accounts({
    sender: buyer.publicKey,
    escrow,
    chatMessage,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

ok("Escrow participant can send message");

// Same message ID = same PDA.
await expectBlocked(
  "Same escrow/message_id cannot be replayed",
  async () => {
    await solzaar.methods
      .sendMessage(
        MESSAGE_ID,
        "Replay"
      )
      .accounts({
        sender: buyer.publicKey,
        escrow,
        chatMessage,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

const attackerMessageId = new BN(60002);
const attackerChat =
  messagePda(escrow, attackerMessageId);

await expectBlocked(
  "Non-party attacker cannot send escrow chat",
  async () => {
    await solzaar.methods
      .sendMessage(
        attackerMessageId,
        "Unauthorized message"
      )
      .accounts({
        sender: attacker.publicKey,
        escrow,
        chatMessage: attackerChat,
        systemProgram: SystemProgram.programId,
      })
      .signers([attacker])
      .rpc();
  },
  "unauthorized"
);

const emptyMessageId = new BN(60003);
const emptyChat =
  messagePda(escrow, emptyMessageId);

await expectBlocked(
  "Whitespace-only chat rejected",
  async () => {
    await solzaar.methods
      .sendMessage(
        emptyMessageId,
        "     "
      )
      .accounts({
        sender: buyer.publicKey,
        escrow,
        chatMessage: emptyChat,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

const longMessageId = new BN(60004);
const longChat =
  messagePda(escrow, longMessageId);

await expectBlocked(
  "Chat >280 bytes rejected",
  async () => {
    await solzaar.methods
      .sendMessage(
        longMessageId,
        "M".repeat(281)
      )
      .accounts({
        sender: buyer.publicKey,
        escrow,
        chatMessage: longChat,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }
);

// ------------------------------------------------------------
// 13. Arbitrary external escrow chat namespace
// ------------------------------------------------------------

banner("13. Non-SolBazaar escrow chat probe");

const FOREIGN_ESCROW_ID = new BN(600002);

const foreign = await createEscrow({
  escrowId: FOREIGN_ESCROW_ID,
  creator: buyer,
  partyA: buyer.publicKey,
  partyB: merchant.publicKey,
  referenceAmount: 1000,
  requiredDepositA: 1000,
  requiredDepositB: 1,
  note: "generic external escrow, NOT a SolBazaar order",
});

const foreignMessageId = new BN(1);

const foreignChat =
  messagePda(
    foreign.escrow,
    foreignMessageId
  );

try {
  await solzaar.methods
    .sendMessage(
      foreignMessageId,
      "Message from non-SolBazaar escrow"
    )
    .accounts({
      sender: buyer.publicKey,
      escrow: foreign.escrow,
      chatMessage: foreignChat,
      systemProgram: SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();

  finding(
    "send_message accepts a valid external escrow even when " +
    "the escrow is NOT marked as marketplace=solbazaar"
  );

  console.log(
    "  This confirms chat namespace is not bound to a SolBazaar order."
  );
} catch (err) {
  ok(
    "Non-SolBazaar external escrow was rejected by send_message: " +
    shortError(err)
  );
}

// ------------------------------------------------------------
// 14. Completed-sale economic semantics
// ------------------------------------------------------------

banner("14. Completed-sale payout semantics probe");

// Create a second legitimate order, but parties intentionally agree
// to pay ALL locked funds back to the buyer.
//
// If Solzaar still increments sold/total_sold, this proves that
// "completed sale" means completed escrow settlement, not necessarily
// "merchant received the purchase price".

const ECON_ESCROW_ID = new BN(600003);
const econQuantity = 1;
const econTotalPrice = PRICE;

const econSecurity =
  Math.floor((econTotalPrice * 1000) / 10_000) || 1;

const econBuyerDeposit =
  econTotalPrice + econSecurity;

const econSellerDeposit =
  econSecurity;

const econ = await createEscrow({
  escrowId: ECON_ESCROW_ID,
  creator: buyer,
  partyA: buyer.publicKey,
  partyB: merchant.publicKey,
  referenceAmount: econTotalPrice,
  requiredDepositA: econBuyerDeposit,
  requiredDepositB: econSellerDeposit,
  note: JSON.stringify({
    marketplace: "solbazaar",
    test: "zero-seller-payout",
  }),
});

await depositEscrow({
  depositor: buyer,
  escrow: econ.escrow,
  vault: econ.vault,
  amount: econBuyerDeposit,
});

const econOrder = orderPda(econ.escrow);

await solzaar.methods
  .createOrderRecord(econQuantity)
  .accounts({
    buyer: buyer.publicKey,
    escrow: econ.escrow,
    product,
    merchantProfile,
    orderRecord: econOrder,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

await depositEscrow({
  depositor: merchant,
  escrow: econ.escrow,
  vault: econ.vault,
  amount: econSellerDeposit,
});

const allLocked =
  econBuyerDeposit + econSellerDeposit;

// Merchant proposes giving ALL funds to buyer.
await escrowProgram.methods
  .suggestFinalization(
    new BN(allLocked),
    new BN(0),
    new BN(0),
    "Economic semantics test: seller accepts zero payout"
  )
  .accounts({
    signer: merchant.publicKey,
    escrow: econ.escrow,
  })
  .signers([merchant])
  .rpc();

// Buyer accepts.
await escrowProgram.methods
  .acceptFinalization()
  .accounts({
    signer: buyer.publicKey,
    escrow: econ.escrow,
    partyA: buyer.publicKey,
    partyB: merchant.publicKey,
    vault: econ.vault,
    donationRecipient: DONATION_RECIPIENT,
  })
  .signers([buyer])
  .rpc();

const econCompletedSale =
  completedSalePda(econOrder);

const econBefore =
  await solzaar.account.product.fetch(product);

await solzaar.methods
  .recordCompletedSale()
  .accounts({
    buyer: buyer.publicKey,
    escrow: econ.escrow,
    orderRecord: econOrder,
    product,
    merchantProfile,
    completedSale: econCompletedSale,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();

const econAfter =
  await solzaar.account.product.fetch(product);

if (
  econAfter.sold ===
  econBefore.sold + econQuantity
) {
  finding(
    "record_completed_sale counts a completed escrow as a sale " +
    "even when seller payout is ZERO."
  );

  console.log(
    "  Not necessarily an exploit: both escrow parties agreed to the payout."
  );

  console.log(
    "  But product.sold / merchant.total_sold represent completed settlements,"
  );

  console.log(
    "  not cryptographic proof that seller received the product price."
  );
} else {
  throw new Error(
    "Unexpected sold counter result in economic semantics test"
  );
}

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------

banner("Batch 6 Summary");

console.log(`PASS checks:    ${passed}`);
console.log(`Blocked attacks:${blocked}`);
console.log(`Findings:       ${findings}`);

console.log("\nExpected important findings:");

console.log(
  "1. send_message may accept participants from a non-SolBazaar external escrow."
);

console.log(
  "2. record_completed_sale may count a status=3 settlement even with zero seller payout."
);

console.log(
  "\nThese are currently design/integration findings, not necessarily exploitable theft."
);

console.log("\nBatch 6 finished.");