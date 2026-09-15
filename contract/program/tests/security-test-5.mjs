import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import BN from "bn.js";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";


// ============================================================
// Setup
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOLBAZAAR_IDL =
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "sol_bazaar.json"),
      "utf8"
    )
  );

const ESCROW_IDL =
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "sol_shop_escrow.json"),
      "utf8"
    )
  );

const RPC_URL =
  "http://127.0.0.1:8899";

const connection =
  new Connection(
    RPC_URL,
    "confirmed"
  );

const SOLBAZAAR_PROGRAM_ID =
  new PublicKey(
    SOLBAZAAR_IDL.address
  );

const ESCROW_PROGRAM_ID =
  new PublicKey(
    ESCROW_IDL.address
  );


// ============================================================
// Provider
// ============================================================

const walletPath =
  path.join(
    os.homedir(),
    ".config",
    "solana",
    "id.json"
  );

const secret =
  JSON.parse(
    fs.readFileSync(
      walletPath,
      "utf8"
    )
  );

const payer =
  Keypair.fromSecretKey(
    Uint8Array.from(secret)
  );

const provider =
  new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    {
      commitment: "confirmed",
    }
  );

anchor.setProvider(provider);

const bazaar =
  new anchor.Program(
    SOLBAZAAR_IDL,
    provider
  );

const escrowProgram =
  new anchor.Program(
    ESCROW_IDL,
    provider
  );


// ============================================================
// Helpers
// ============================================================

function line() {
  console.log(
    "\n" + "=".repeat(60)
  );
}

function section(title) {
  line();
  console.log(title);
  line();
}

function errorText(error) {
  if (
    error?.error?.errorCode?.code
  ) {
    return (
      error.error.errorCode.code +
      ": " +
      (
        error.error.errorMessage ??
        ""
      )
    );
  }

  if (
    Array.isArray(error?.logs)
  ) {
    const found =
      error.logs.find(
        x =>
          x.includes(
            "Error Code:"
          )
      );

    if (found) {
      return found
        .replace(
          "Program log:",
          ""
        )
        .trim();
    }
  }

  return (
    error?.message ??
    String(error)
  );
}


async function expectAllowed(
  label,
  fn
) {
  try {
    const result =
      await fn();

    console.log(
      `✓ PASS: ${label}`
    );

    return result;
  } catch (error) {
    console.log(
      `✗ FAIL: ${label}`
    );

    console.log(
      `  ↳ ${errorText(error)}`
    );

    throw error;
  }
}


async function expectBlocked(
  label,
  fn,
  expected = null
) {
  try {
    await fn();

    console.log(
      `✗ VULNERABLE: ${label}`
    );

    throw new Error(
      "EXPECTED_BLOCK"
    );
  } catch (error) {
    if (
      error?.message ===
      "EXPECTED_BLOCK"
    ) {
      throw new Error(
        `Security test failed: ${label}`
      );
    }

    const text =
      errorText(error);

    console.log(
      `✓ BLOCKED: ${label}`
    );

    console.log(
      `  ↳ ${text}`
    );

    if (
      expected &&
      !text.includes(expected)
    ) {
      console.log(
        `  ⚠ Expected error containing: ${expected}`
      );
    }

    return error;
  }
}


function u64Buffer(value) {
  const bn =
    BN.isBN(value)
      ? value
      : new BN(value);

  return bn.toArrayLike(
    Buffer,
    "le",
    8
  );
}


function merchantPda(
  authority
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("merchant"),
      authority.toBuffer(),
    ],
    SOLBAZAAR_PROGRAM_ID
  )[0];
}


function productPda(
  authority,
  productId
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("product"),
      authority.toBuffer(),
      u64Buffer(productId),
    ],
    SOLBAZAAR_PROGRAM_ID
  )[0];
}


function orderPda(
  escrow
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("order"),
      escrow.toBuffer(),
    ],
    SOLBAZAAR_PROGRAM_ID
  )[0];
}


async function fund(
  keypair,
  sol = 10
) {
  const sig =
    await connection.requestAirdrop(
      keypair.publicKey,
      sol * LAMPORTS_PER_SOL
    );

  await connection.confirmTransaction(
    sig,
    "confirmed"
  );
}


// ============================================================
// IDL helper
// ============================================================

function normalizeName(name) {
  return name
    .replace(/_/g, "")
    .toLowerCase();
}


function getInstruction(
  idl,
  instructionName
) {
  const wanted =
    normalizeName(
      instructionName
    );

  return idl.instructions.find(
    ix =>
      normalizeName(ix.name) ===
      wanted
  );
}


function flattenAccounts(
  accounts,
  out = []
) {
  for (
    const account of accounts ?? []
  ) {
    if (account.accounts) {
      flattenAccounts(
        account.accounts,
        out
      );
    } else {
      out.push(account.name);
    }
  }

  return out;
}


function printInstructionAccounts(
  idl,
  name
) {
  const ix =
    getInstruction(
      idl,
      name
    );

  if (!ix) {
    console.log(
      `  ${name}: NOT FOUND`
    );
    return;
  }

  console.log(
    `  ${name}:`
  );

  console.log(
    "   ",
    flattenAccounts(
      ix.accounts
    ).join(", ")
  );
}


// ============================================================
// SolBazaar helpers
// ============================================================

async function createMerchant(
  merchant,
  sellerDepositBps = 500
) {
  const merchantProfile =
    merchantPda(
      merchant.publicKey
    );

  await bazaar.methods
    .createMerchant(
      "Batch 5 Store",
      "https://example.com/store.json",
      "https://example.com/logo.png",
      "https://example.com/banner.png",
      "Philippines",
      sellerDepositBps,
      "contact@example.com"
    )
    .accountsStrict({
      merchantProfile,

      authority:
        merchant.publicKey,

      systemProgram:
        SystemProgram.programId,
    })
    .signers([
      merchant,
    ])
    .rpc();

  return merchantProfile;
}


async function createProduct(
  merchant,
  productId,
  price,
  stock
) {
  const merchantProfile =
    merchantPda(
      merchant.publicKey
    );

  const product =
    productPda(
      merchant.publicKey,
      productId
    );

  await bazaar.methods
    .createProduct(
      new BN(productId),
      `Product ${productId}`,
      "https://example.com/product.json",
      [
        "https://example.com/image.png",
      ],
      "Test",
      new BN(price),
      stock
    )
    .accountsStrict({
      merchantProfile,
      product,

      authority:
        merchant.publicKey,

      systemProgram:
        SystemProgram.programId,
    })
    .signers([
      merchant,
    ])
    .rpc();

  return product;
}


async function createOrder(
  buyer,
  escrow,
  product,
  merchantProfile,
  quantity
) {
  const orderRecord =
    orderPda(escrow);

  return bazaar.methods
    .createOrderRecord(
      quantity
    )
    .accountsStrict({
      buyer:
        buyer.publicKey,

      escrow,

      product,

      merchantProfile,

      orderRecord,

      systemProgram:
        SystemProgram.programId,
    })
    .signers([
      buyer,
    ])
    .rpc();
}


// ============================================================
// Escrow dynamic helpers
//
// This deliberately reads the escrow IDL so we don't hard-code
// the escrow PDA seed layout.
// ============================================================

async function creatorEscrows(
  creator
) {
  const accounts =
    await connection.getProgramAccounts(
      ESCROW_PROGRAM_ID,
      {
        filters: [
          {
            memcmp: {
              offset: 8,
              bytes:
                creator.toBase58(),
            },
          },
        ],
      }
    );

  return accounts.map(
    x => x.pubkey
  );
}


async function newestEscrowForCreator(
  creator,
  before
) {
  const after =
    await creatorEscrows(
      creator
    );

  const beforeSet =
    new Set(
      before.map(
        x => x.toBase58()
      )
    );

  const fresh =
    after.find(
      x =>
        !beforeSet.has(
          x.toBase58()
        )
    );

  if (!fresh) {
    throw new Error(
      "Could not locate newly-created escrow account"
    );
  }

  return fresh;
}


async function fetchEscrow(
  escrow
) {
  /*
   * Anchor normally exposes this as account.escrow.
   * If your IDL used another account-type name, locate it
   * automatically.
   */

  if (
    escrowProgram.account.escrow
  ) {
    return escrowProgram.account
      .escrow
      .fetch(escrow);
  }

  const names =
    Object.keys(
      escrowProgram.account
    );

  for (
    const name of names
  ) {
    try {
      return await escrowProgram
        .account[name]
        .fetch(escrow);
    } catch {
      // continue
    }
  }

  throw new Error(
    "Unable to decode escrow account using escrow IDL"
  );
}


async function createEscrow({
  creator,
  seller,
  escrowId,
  referenceAmount,
  requiredDepositA,
  requiredDepositB,
  note =
    '{"marketplace":"solbazaar"}',
}) {

  const before =
    await creatorEscrows(
      creator.publicKey
    );

  /*
   * accountsPartial() is intentional:
   * Anchor resolves escrow/vault PDA accounts from
   * the escrow IDL where PDA seed metadata is present.
   */

  await escrowProgram.methods
    .createEscrow(
      new BN(escrowId),
      0,
      creator.publicKey,
      seller.publicKey,
      new BN(referenceAmount),
      new BN(requiredDepositA),
      new BN(requiredDepositB),
      note
    )
    .accountsPartial({
      creator:
        creator.publicKey,

      payer:
        creator.publicKey,

      authority:
        creator.publicKey,

      partyA:
        creator.publicKey,

      partyB:
        seller.publicKey,

      systemProgram:
        SystemProgram.programId,
    })
    .signers([
      creator,
    ])
    .rpc();

  const escrow =
    await newestEscrowForCreator(
      creator.publicKey,
      before
    );

  const state =
    await fetchEscrow(
      escrow
    );

  return {
    escrow,
    state,
  };
}


async function depositEscrow(
  depositor,
  escrow,
  amount
) {
  const state =
    await fetchEscrow(
      escrow
    );

  const vault =
    state.vault;

  if (!vault) {
    throw new Error(
      "Escrow account has no vault field"
    );
  }

  /*
   * Different escrow IDLs sometimes name the signer
   * depositor / party / user. accountsPartial allows
   * Anchor to ignore names that don't exist and resolve
   * the rest.
   */

  return escrowProgram.methods
    .deposit(
      new BN(amount)
    )
    .accountsPartial({
      depositor:
        depositor.publicKey,

      party:
        depositor.publicKey,

      user:
        depositor.publicKey,

      authority:
        depositor.publicKey,

      signer:
        depositor.publicKey,

      escrow,

      vault,

      systemProgram:
        SystemProgram.programId,
    })
    .signers([
      depositor,
    ])
    .rpc();
}


// ============================================================
// Main
// ============================================================

async function main() {

  line();

  console.log(
    "SolBazaar Security Test - Batch 5"
  );

  line();

  console.log(
    `RPC:       ${RPC_URL}`
  );

  console.log(
    `SolBazaar: ${SOLBAZAAR_PROGRAM_ID.toBase58()}`
  );

  console.log(
    `Escrow:    ${ESCROW_PROGRAM_ID.toBase58()}`
  );

  console.log(
    `Provider:  ${payer.publicKey.toBase58()}`
  );


  // ==========================================================
  // 0
  // ==========================================================

  section(
    "0. Program checks"
  );

  for (
    const [name, id] of [
      [
        "SolBazaar",
        SOLBAZAAR_PROGRAM_ID,
      ],
      [
        "Escrow",
        ESCROW_PROGRAM_ID,
      ],
    ]
  ) {
    const info =
      await connection.getAccountInfo(
        id
      );

    if (
      !info ||
      !info.executable
    ) {
      throw new Error(
        `${name} program not executable locally`
      );
    }

    console.log(
      `✓ PASS: ${name} executable locally`
    );
  }


  // ==========================================================
  // 1 - show IDL accounts
  // ==========================================================

  section(
    "1. Escrow IDL compatibility"
  );

  printInstructionAccounts(
    ESCROW_IDL,
    "createEscrow"
  );

  printInstructionAccounts(
    ESCROW_IDL,
    "deposit"
  );

  const createIx =
    getInstruction(
      ESCROW_IDL,
      "createEscrow"
    );

  const depositIx =
    getInstruction(
      ESCROW_IDL,
      "deposit"
    );

  if (!createIx) {
    throw new Error(
      "Escrow IDL has no create_escrow instruction"
    );
  }

  if (!depositIx) {
    throw new Error(
      "Escrow IDL has no deposit instruction"
    );
  }

  console.log(
    "✓ PASS: Required escrow instructions found"
  );


  // ==========================================================
  // Participants
  // ==========================================================

  const merchant =
    Keypair.generate();

  const buyer =
    Keypair.generate();

  const attacker =
    Keypair.generate();

  await fund(
    merchant,
    20
  );

  await fund(
    buyer,
    20
  );

  await fund(
    attacker,
    20
  );


  // ==========================================================
  // 2
  // ==========================================================

  section(
    "2. Create baseline merchant/product"
  );

  const merchantProfile =
    await expectAllowed(
      "Merchant created with 5% seller deposit",
      () =>
        createMerchant(
          merchant,
          500
        )
    );

  const product =
    await expectAllowed(
      "Product created: price 0.1 SOL, stock 10",
      () =>
        createProduct(
          merchant,
          5001,
          100_000_000,
          10
        )
    );

  console.log(
    `  merchant: ${merchant.publicKey.toBase58()}`
  );

  console.log(
    `  buyer:    ${buyer.publicKey.toBase58()}`
  );

  console.log(
    `  product:  ${product.toBase58()}`
  );


  // ==========================================================
  // 3
  // ==========================================================

  section(
    "3. Valid escrow → buyer deposit → order"
  );

  /*
   * Product:
   * 0.1 SOL each × 2 = 0.2 SOL
   *
   * 5% security deposit = 0.01 SOL
   *
   * buyer required:
   * 0.2 + 0.01 = 0.21 SOL
   *
   * seller required:
   * 0.01 SOL
   */

  const totalPrice =
    new BN(
      200_000_000
    );

  const securityDeposit =
    new BN(
      10_000_000
    );

  const buyerRequired =
    totalPrice.add(
      securityDeposit
    );

  const good =
    await expectAllowed(
      "Valid SolBazaar escrow created",
      () =>
        createEscrow({
          creator:
            buyer,

          seller:
            merchant,

          escrowId:
            Date.now(),

          referenceAmount:
            totalPrice,

          requiredDepositA:
            buyerRequired,

          requiredDepositB:
            securityDeposit,
        })
    );

  console.log(
    `  escrow: ${good.escrow.toBase58()}`
  );

  await expectAllowed(
    "Buyer deposits full required amount",
    () =>
      depositEscrow(
        buyer,
        good.escrow,
        buyerRequired
      )
  );

  const escrowAfterDeposit =
    await fetchEscrow(
      good.escrow
    );

  console.log(
    `  deposited_a: ${escrowAfterDeposit.depositedA?.toString?.() ?? escrowAfterDeposit.deposited_a?.toString?.()}`
  );

  const stockBefore =
    (
      await bazaar.account
        .product
        .fetch(product)
    ).stock;

  await expectAllowed(
    "create_order_record accepts valid funded escrow",
    () =>
      createOrder(
        buyer,
        good.escrow,
        product,
        merchantProfile,
        2
      )
  );

  const stockAfter =
    (
      await bazaar.account
        .product
        .fetch(product)
    ).stock;

  console.log(
    `  stock before: ${stockBefore}`
  );

  console.log(
    `  stock after:  ${stockAfter}`
  );

  if (
    stockAfter !==
    stockBefore - 2
  ) {
    throw new Error(
      "Invalid stock deduction"
    );
  }

  console.log(
    "✓ PASS: Stock deducted exactly once"
  );


  // ==========================================================
  // 4
  // ==========================================================

  section(
    "4. Replay same escrow/order"
  );

  await expectBlocked(
    "Same escrow cannot create a second OrderRecord",
    () =>
      createOrder(
        buyer,
        good.escrow,
        product,
        merchantProfile,
        2
      )
  );


  // ==========================================================
// 5
// ==========================================================

section(
    "5. quantity = 0"
  );
  
  {
    const e =
      await createEscrow({
        creator:
          buyer,
  
        seller:
          merchant,
  
        escrowId:
          Date.now() + 50,
  
        referenceAmount:
          new BN(
            100_000_000
          ),
  
        requiredDepositA:
          new BN(
            105_000_000
          ),
  
        requiredDepositB:
          new BN(
            5_000_000
          ),
      });
  
    await expectBlocked(
      "Zero quantity blocked",
      () =>
        createOrder(
          buyer,
          e.escrow,
          product,
          merchantProfile,
          0
        ),
      "InvalidQuantity"
    );
  }


  // ==========================================================
// 6
// ==========================================================

section(
    "6. quantity > stock"
  );
  
  {
    const e =
      await createEscrow({
        creator:
          buyer,
  
        seller:
          merchant,
  
        escrowId:
          Date.now() + 60,
  
        referenceAmount:
          new BN(
            100_000_000
          ),
  
        requiredDepositA:
          new BN(
            105_000_000
          ),
  
        requiredDepositB:
          new BN(
            5_000_000
          ),
      });
  
    const p =
      await bazaar.account
        .product
        .fetch(product);
  
    console.log(
      `  current stock: ${p.stock}`
    );
  
    await expectBlocked(
      "Quantity greater than stock blocked",
      () =>
        createOrder(
          buyer,
          e.escrow,
          product,
          merchantProfile,
          p.stock + 1
        ),
      "InsufficientStock"
    );
  }


  // ==========================================================
  // 7
  // ==========================================================

  section(
    "7. Wrong reference_amount"
  );

  {
    const bad =
      await createEscrow({
        creator:
          buyer,

        seller:
          merchant,

        escrowId:
          Date.now() + 100,

        // Actual product total for quantity 1 is 100m.
        referenceAmount:
          new BN(
            99_000_000
          ),

        requiredDepositA:
          new BN(
            105_000_000
          ),

        requiredDepositB:
          new BN(
            5_000_000
          ),
      });

    await depositEscrow(
      buyer,
      bad.escrow,
      new BN(
        105_000_000
      )
    );

    await expectBlocked(
      "Wrong escrow reference_amount rejected",
      () =>
        createOrder(
          buyer,
          bad.escrow,
          product,
          merchantProfile,
          1
        ),
      "InvalidOrderAmount"
    );
  }


  // ==========================================================
  // 8
  // ==========================================================

  section(
    "8. Wrong required buyer deposit"
  );

  {
    /*
     * Correct for quantity=1:
     *
     * price        = 100,000,000
     * security 5%  =   5,000,000
     * buyer total  = 105,000,000
     *
     * We intentionally configure 104,999,999.
     */

    const wrongBuyerDeposit =
      new BN(
        104_999_999
      );

    const bad =
      await createEscrow({
        creator:
          buyer,

        seller:
          merchant,

        escrowId:
          Date.now() + 200,

        referenceAmount:
          new BN(
            100_000_000
          ),

        requiredDepositA:
          wrongBuyerDeposit,

        requiredDepositB:
          new BN(
            5_000_000
          ),
      });

    await depositEscrow(
      buyer,
      bad.escrow,
      wrongBuyerDeposit
    );

    await expectBlocked(
      "Wrong required_deposit_a rejected",
      () =>
        createOrder(
          buyer,
          bad.escrow,
          product,
          merchantProfile,
          1
        ),
      "InvalidBuyerDeposit"
    );
  }


  // ==========================================================
  // 9
  // ==========================================================

  section(
    "9. Buyer has not deposited"
  );

  {
    const bad =
      await createEscrow({
        creator:
          buyer,

        seller:
          merchant,

        escrowId:
          Date.now() + 300,

        referenceAmount:
          new BN(
            100_000_000
          ),

        requiredDepositA:
          new BN(
            105_000_000
          ),

        requiredDepositB:
          new BN(
            5_000_000
          ),
      });

    await expectBlocked(
      "Order rejected before buyer funds escrow",
      () =>
        createOrder(
          buyer,
          bad.escrow,
          product,
          merchantProfile,
          1
        ),
      "BuyerDepositIncomplete"
    );
  }


  // ==========================================================
  // 10
  // ==========================================================

  section(
    "10. Wrong seller required deposit"
  );

  {
    const bad =
      await createEscrow({
        creator:
          buyer,

        seller:
          merchant,

        escrowId:
          Date.now() + 400,

        referenceAmount:
          new BN(
            100_000_000
          ),

        requiredDepositA:
          new BN(
            105_000_000
          ),

        // should be 5,000,000
        requiredDepositB:
          new BN(
            4_999_999
          ),
      });

    await depositEscrow(
      buyer,
      bad.escrow,
      new BN(
        105_000_000
      )
    );

    await expectBlocked(
      "Wrong required_deposit_b rejected",
      () =>
        createOrder(
          buyer,
          bad.escrow,
          product,
          merchantProfile,
          1
        ),
      "InvalidSellerDeposit"
    );
  }


  // ==========================================================
  // 11
  // ==========================================================

  section(
    "11. Wrong buyer"
  );

  {
    const valid =
      await createEscrow({
        creator:
          buyer,

        seller:
          merchant,

        escrowId:
          Date.now() + 500,

        referenceAmount:
          new BN(
            100_000_000
          ),

        requiredDepositA:
          new BN(
            105_000_000
          ),

        requiredDepositB:
          new BN(
            5_000_000
          ),
      });

    await depositEscrow(
      buyer,
      valid.escrow,
      new BN(
        105_000_000
      )
    );

    await expectBlocked(
      "Attacker cannot use buyer's escrow",
      () =>
        createOrder(
          attacker,
          valid.escrow,
          product,
          merchantProfile,
          1
        ),
      "InvalidOrderBuyer"
    );
  }


  // ==========================================================
  // 12
  // ==========================================================

  section(
    "12. Wrong seller"
  );

  {
    const fakeSeller =
      attacker;

    const bad =
      await createEscrow({
        creator:
          buyer,

        seller:
          fakeSeller,

        escrowId:
          Date.now() + 600,

        referenceAmount:
          new BN(
            100_000_000
          ),

        requiredDepositA:
          new BN(
            105_000_000
          ),

        requiredDepositB:
          new BN(
            5_000_000
          ),
      });

    await depositEscrow(
      buyer,
      bad.escrow,
      new BN(
        105_000_000
      )
    );

    await expectBlocked(
      "Escrow with wrong seller rejected",
      () =>
        createOrder(
          buyer,
          bad.escrow,
          product,
          merchantProfile,
          1
        ),
      "InvalidOrderSeller"
    );
  }


  // ==========================================================
  // 13
  // ==========================================================

  section(
    "13. Non-SolBazaar escrow note"
  );

  {
    const bad =
      await createEscrow({
        creator:
          buyer,

        seller:
          merchant,

        escrowId:
          Date.now() + 700,

        referenceAmount:
          new BN(
            100_000_000
          ),

        requiredDepositA:
          new BN(
            105_000_000
          ),

        requiredDepositB:
          new BN(
            5_000_000
          ),

        note:
          '{"marketplace":"something-else"}',
      });

    await depositEscrow(
      buyer,
      bad.escrow,
      new BN(
        105_000_000
      )
    );

    await expectBlocked(
      "Non-SolBazaar escrow rejected",
      () =>
        createOrder(
          buyer,
          bad.escrow,
          product,
          merchantProfile,
          1
        ),
      "NotSolBazaarEscrow"
    );
  }


  // ==========================================================
  // 14
  // ==========================================================

  section(
    "14. Seller deposits before create_order_record"
  );

  {
    const testProduct =
      await createProduct(
        merchant,
        5014,
        100_000_000,
        10
      );

    const e =
      await createEscrow({
        creator:
          buyer,

        seller:
          merchant,

        escrowId:
          Date.now() + 800,

        referenceAmount:
          new BN(
            100_000_000
          ),

        requiredDepositA:
          new BN(
            105_000_000
          ),

        requiredDepositB:
          new BN(
            5_000_000
          ),
      });

    await depositEscrow(
      buyer,
      e.escrow,
      new BN(
        105_000_000
      )
    );

    await depositEscrow(
      merchant,
      e.escrow,
      new BN(
        5_000_000
      )
    );

    const state =
      await fetchEscrow(
        e.escrow
      );

    console.log(
      `  escrow status after both deposits: ${state.status}`
    );

    await expectBlocked(
      "Fully-funded escrow cannot create order after status moved from CREATED",
      () =>
        createOrder(
          buyer,
          e.escrow,
          testProduct,
          merchantProfile,
          1
        ),
      "InvalidOrderStatus"
    );

    console.log(
      "✓ PASS: Confirms order must be recorded after buyer deposit but before seller deposit"
    );
  }


  // ==========================================================
// 15
// ==========================================================

section(
    "15. price × quantity overflow"
  );
  
  {
    const hugePrice =
      new BN(
        "18446744073709551615"
      );
  
    const overflowProduct =
      await createProduct(
        merchant,
        5015,
        hugePrice,
        2
      );
  
    const e =
      await createEscrow({
        creator:
          buyer,
  
        seller:
          merchant,
  
        escrowId:
          Date.now() + 1500,
  
        // Values here do not matter for this test because
        // MathOverflow happens before escrow validation.
        referenceAmount:
          new BN(1),
  
        requiredDepositA:
          new BN(1),
  
        requiredDepositB:
          new BN(1),
      });
  
    await expectBlocked(
      "u64::MAX × quantity 2 blocked",
      () =>
        createOrder(
          buyer,
          e.escrow,
          overflowProduct,
          merchantProfile,
          2
        ),
      "MathOverflow"
    );
  }


  // ==========================================================
  // Done
  // ==========================================================

  section(
    "BATCH 5 COMPLETE"
  );

  console.log(
    "Tests completed:"
  );

  console.log(
    "  • Real cloned escrow integration"
  );

  console.log(
    "  • Valid buyer-funded order"
  );

  console.log(
    "  • Exact stock deduction"
  );

  console.log(
    "  • Same-escrow replay"
  );

  console.log(
    "  • Zero quantity"
  );

  console.log(
    "  • Quantity > stock"
  );

  console.log(
    "  • Wrong reference_amount"
  );

  console.log(
    "  • Wrong buyer required deposit"
  );

  console.log(
    "  • Buyer deposit incomplete"
  );

  console.log(
    "  • Wrong seller required deposit"
  );

  console.log(
    "  • Wrong buyer"
  );

  console.log(
    "  • Wrong seller"
  );

  console.log(
    "  • Marketplace-note validation"
  );

  console.log(
    "  • Escrow status validation"
  );

  console.log(
    "  • price × quantity overflow"
  );

  console.log(
    "\nDONE"
  );
}


main()
  .catch(error => {
    console.error(
      "\nFATAL TEST ERROR"
    );

    console.error(
      error
    );

    process.exit(1);
  });