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

const IDL_PATH =
  path.join(__dirname, "sol_bazaar.json");

const RPC_URL = "http://127.0.0.1:8899";

const connection =
  new Connection(RPC_URL, "confirmed");

const idl =
  JSON.parse(
    fs.readFileSync(IDL_PATH, "utf8")
  );

const PROGRAM_ID =
  new PublicKey(idl.address);


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
    fs.readFileSync(walletPath, "utf8")
  );

const payer =
  Keypair.fromSecretKey(
    Uint8Array.from(secret)
  );

const wallet =
  new anchor.Wallet(payer);

const provider =
  new anchor.AnchorProvider(
    connection,
    wallet,
    {
      commitment: "confirmed",
    }
  );

anchor.setProvider(provider);

const program =
  new anchor.Program(
    idl,
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
    error?.logs &&
    Array.isArray(error.logs)
  ) {
    const found =
      error.logs.find(
        (x) =>
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
  fn
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

    console.log(
      `✓ BLOCKED: ${label}`
    );

    console.log(
      `  ↳ ${errorText(error)}`
    );

    return error;
  }
}


async function expectFinding(
  label,
  fn
) {
  try {
    await fn();

    console.log(
      `⚠ FINDING: ${label}`
    );

    return true;
  } catch (error) {
    console.log(
      `✓ BLOCKED: ${label}`
    );

    console.log(
      `  ↳ ${errorText(error)}`
    );

    return false;
  }
}


function u64Buffer(value) {
  return new BN(value)
    .toArrayLike(
      Buffer,
      "le",
      8
    );
}


function merchantPda(authority) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("merchant"),
      authority.toBuffer(),
    ],
    PROGRAM_ID
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
    PROGRAM_ID
  )[0];
}


function reputationPda(authority) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("reputation"),
      authority.toBuffer(),
    ],
    PROGRAM_ID
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
// Merchant
// ============================================================

async function createMerchant(
  authority,
  {
    storeName = "Batch 4 Store",
    active = true,
  } = {}
) {
  const profile =
    merchantPda(
      authority.publicKey
    );

  await program.methods
    .createMerchant(
      storeName,
      "https://example.com/store.json",
      "https://example.com/logo.png",
      "https://example.com/banner.png",
      "Philippines",
      500,
      "contact@example.com"
    )
    .accountsStrict({
      merchantProfile:
        profile,

      authority:
        authority.publicKey,

      systemProgram:
        SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  return profile;
}


async function setMerchantActive(
  authority,
  active
) {
  const profile =
    merchantPda(
      authority.publicKey
    );

  const current =
    await program.account
      .merchantProfile
      .fetch(profile);

  await program.methods
    .updateMerchant(
      current.storeName,
      current.descriptionUri,
      current.logoUri,
      current.bannerUri,
      current.shipsFrom,
      current.sellerDepositBps,
      current.preferredContact,
      active
    )
    .accountsStrict({
      merchantProfile:
        profile,

      authority:
        authority.publicKey,
    })
    .signers([authority])
    .rpc();
}


// ============================================================
// Product
// ============================================================

async function createProduct(
  authority,
  productId,
  {
    title = "Batch 4 Product",
    price = new BN(100000000),
    stock = 10,
  } = {}
) {
  const merchant =
    merchantPda(
      authority.publicKey
    );

  const product =
    productPda(
      authority.publicKey,
      productId
    );

  await program.methods
    .createProduct(
      new BN(productId),
      title,
      "https://example.com/product.json",
      [
        "https://example.com/product.png",
      ],
      "Test",
      price,
      stock
    )
    .accountsStrict({
      merchantProfile:
        merchant,

      product,

      authority:
        authority.publicKey,

      systemProgram:
        SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  return product;
}


async function updateProduct(
  authority,
  product,
  {
    title,
    price,
    stock,
    active,
  } = {}
) {
  const current =
    await program.account
      .product
      .fetch(product);

  return program.methods
    .updateProduct(
      title ??
        current.title,

      current.descriptionUri,

      current.imageUris,

      current.category,

      price ??
        current.price,

      stock ??
        current.stock,

      active ??
        current.active
    )
    .accountsStrict({
      product,

      authority:
        authority.publicKey,
    })
    .signers([authority])
    .rpc();
}


async function deleteProduct(
  authority,
  product
) {
  return program.methods
    .deleteProduct()
    .accountsStrict({
      product,

      authority:
        authority.publicKey,
    })
    .signers([authority])
    .rpc();
}


// ============================================================
// Main
// ============================================================

async function main() {

  line();

  console.log(
    "SolBazaar Security Test - Batch 4"
  );

  line();

  console.log(
    `RPC:       ${RPC_URL}`
  );

  console.log(
    `Program:   ${PROGRAM_ID.toBase58()}`
  );

  console.log(
    `Provider:  ${payer.publicKey.toBase58()}`
  );


  const merchant =
    Keypair.generate();

  const attacker =
    Keypair.generate();

  await fund(merchant);
  await fund(attacker);


  // ==========================================================
  // 0
  // ==========================================================

  section(
    "0. Program check"
  );

  {
    const info =
      await connection.getAccountInfo(
        PROGRAM_ID
      );

    if (
      !info ||
      !info.executable
    ) {
      throw new Error(
        "SolBazaar not executable"
      );
    }

    console.log(
      "✓ PASS: SolBazaar executable locally"
    );
  }


  // ==========================================================
  // 1
  // ==========================================================

  section(
    "1. Create merchant and baseline product"
  );

  const merchantProfile =
    await expectAllowed(
      "Merchant created",
      () =>
        createMerchant(
          merchant
        )
    );

  const product =
    await expectAllowed(
      "Baseline product created",
      () =>
        createProduct(
          merchant,
          4001,
          {
            stock: 10,
          }
        )
    );

  console.log(
    `  merchant: ${merchant.publicKey.toBase58()}`
  );

  console.log(
    `  profile:  ${merchantProfile.toBase58()}`
  );

  console.log(
    `  product:  ${product.toBase58()}`
  );


  // ==========================================================
  // 2
  // ==========================================================

  section(
    "2. Inactive merchant cannot create new product"
  );

  await expectAllowed(
    "Merchant can deactivate itself",
    () =>
      setMerchantActive(
        merchant,
        false
      )
  );

  await expectBlocked(
    "Inactive merchant cannot create product",
    () =>
      createProduct(
        merchant,
        4002
      )
  );


  // ==========================================================
  // 3
  // ==========================================================

  section(
    "3. Existing product while merchant is inactive"
  );

  const existingBefore =
    await program.account
      .product
      .fetch(product);

  console.log(
    `  product active before: ${existingBefore.active}`
  );

  console.log(
    `  merchant active: false`
  );

  const inactiveMerchantUpdate =
    await expectFinding(
      "Inactive merchant can still update an existing product",
      () =>
        updateProduct(
          merchant,
          product,
          {
            title:
              "Updated While Merchant Inactive",
          }
        )
    );

  if (
    inactiveMerchantUpdate
  ) {
    const state =
      await program.account
        .product
        .fetch(product);

    console.log(
      `  title: ${state.title}`
    );

    console.log(
      "ℹ INFO: update_product currently does not check MerchantProfile.active."
    );
  }


  // ==========================================================
  // 4
  // ==========================================================

  section(
    "4. Inactive merchant can delete existing product"
  );

  const tempProduct =
    productPda(
      merchant.publicKey,
      4003
    );

  // Reactivate temporarily so product can be created.
  await setMerchantActive(
    merchant,
    true
  );

  await createProduct(
    merchant,
    4003
  );

  await setMerchantActive(
    merchant,
    false
  );

  const deleteWhileInactive =
    await expectFinding(
      "Inactive merchant can delete own existing product",
      () =>
        deleteProduct(
          merchant,
          tempProduct
        )
    );

  if (
    deleteWhileInactive
  ) {
    console.log(
      "ℹ INFO: delete_product also does not depend on MerchantProfile.active."
    );
  }


  // ==========================================================
  // 5
  // ==========================================================

  section(
    "5. Reactivation restores product creation"
  );

  await expectAllowed(
    "Merchant can reactivate itself",
    () =>
      setMerchantActive(
        merchant,
        true
      )
  );

  await expectAllowed(
    "Reactivated merchant can create product",
    () =>
      createProduct(
        merchant,
        4004
      )
  );


  // ==========================================================
  // 6
  // ==========================================================

  section(
    "6. Product active toggle"
  );

  await expectAllowed(
    "Merchant can deactivate existing product",
    () =>
      updateProduct(
        merchant,
        product,
        {
          active: false,
        }
      )
  );

  {
    const state =
      await program.account
        .product
        .fetch(product);

    if (
      state.active !== false ||
      state.deleted !== false
    ) {
      throw new Error(
        "Unexpected product state"
      );
    }

    console.log(
      "✓ PASS: inactive product remains undeleted"
    );
  }

  await expectAllowed(
    "Merchant can reactivate non-deleted product",
    () =>
      updateProduct(
        merchant,
        product,
        {
          active: true,
        }
      )
  );

  {
    const state =
      await program.account
        .product
        .fetch(product);

    if (
      state.active !== true ||
      state.deleted !== false
    ) {
      throw new Error(
        "Product reactivation failed"
      );
    }

    console.log(
      "✓ PASS: Non-deleted product can be reactivated"
    );
  }


  // ==========================================================
  // 7
  // ==========================================================

  section(
    "7. Delete is terminal"
  );

  const terminalProduct =
    await createProduct(
      merchant,
      4005
    );

  await expectAllowed(
    "Product can be deleted once",
    () =>
      deleteProduct(
        merchant,
        terminalProduct
      )
  );

  {
    const state =
      await program.account
        .product
        .fetch(
          terminalProduct
        );

    console.log(
      `  active:  ${state.active}`
    );

    console.log(
      `  deleted: ${state.deleted}`
    );

    if (
      state.active !== false ||
      state.deleted !== true
    ) {
      throw new Error(
        "Invalid deleted state"
      );
    }

    console.log(
      "✓ PASS: deleted => active=false"
    );
  }

  await expectBlocked(
    "Deleted product cannot be reactivated",
    () =>
      updateProduct(
        merchant,
        terminalProduct,
        {
          active: true,
        }
      )
  );

  await expectBlocked(
    "Deleted product cannot have stock changed",
    () =>
      updateProduct(
        merchant,
        terminalProduct,
        {
          stock: 999999,
        }
      )
  );

  await expectBlocked(
    "Deleted product cannot have price changed",
    () =>
      updateProduct(
        merchant,
        terminalProduct,
        {
          price:
            new BN(1),
        }
      )
  );


  // ==========================================================
  // 8
  // ==========================================================

  section(
    "8. Merchant deactivate/reactivate does not mutate products"
  );

  const snapshotBefore =
    await program.account
      .product
      .fetch(product);

  await setMerchantActive(
    merchant,
    false
  );

  const snapshotInactive =
    await program.account
      .product
      .fetch(product);

  await setMerchantActive(
    merchant,
    true
  );

  const snapshotAfter =
    await program.account
      .product
      .fetch(product);

  if (
    snapshotBefore.stock !==
    snapshotInactive.stock
  ) {
    throw new Error(
      "Merchant deactivation changed product stock"
    );
  }

  if (
    snapshotBefore.active !==
    snapshotInactive.active
  ) {
    throw new Error(
      "Merchant deactivation changed product.active"
    );
  }

  if (
    snapshotBefore.deleted !==
    snapshotInactive.deleted
  ) {
    throw new Error(
      "Merchant deactivation changed product.deleted"
    );
  }

  if (
    snapshotBefore.stock !==
    snapshotAfter.stock
  ) {
    throw new Error(
      "Merchant reactivation changed product stock"
    );
  }

  console.log(
    "✓ PASS: Merchant active flag does not silently mutate product state"
  );


  // ==========================================================
  // 9
  // ==========================================================

  section(
    "9. Stock edge transitions"
  );

  await expectAllowed(
    "Stock can transition 10 → 0",
    () =>
      updateProduct(
        merchant,
        product,
        {
          stock: 0,
        }
      )
  );

  {
    const state =
      await program.account
        .product
        .fetch(product);

    console.log(
      `  stock: ${state.stock}`
    );
  }

  await expectAllowed(
    "Stock can transition 0 → 10",
    () =>
      updateProduct(
        merchant,
        product,
        {
          stock: 10,
        }
      )
  );

  await expectAllowed(
    "Stock can transition to u32::MAX",
    () =>
      updateProduct(
        merchant,
        product,
        {
          stock:
            4294967295,
        }
      )
  );

  {
    const state =
      await program.account
        .product
        .fetch(product);

    console.log(
      `  stock: ${state.stock}`
    );
  }


  // ==========================================================
  // 10
  // ==========================================================

  section(
    "10. Price edge transitions"
  );

  await expectAllowed(
    "Price can transition to 1 lamport",
    () =>
      updateProduct(
        merchant,
        product,
        {
          price:
            new BN(1),
        }
      )
  );

  await expectBlocked(
    "Price cannot transition to zero",
    () =>
      updateProduct(
        merchant,
        product,
        {
          price:
            new BN(0),
        }
      )
  );

  const U64_MAX =
    new BN(
      "18446744073709551615"
    );

  await expectAllowed(
    "Price can transition to u64::MAX",
    () =>
      updateProduct(
        merchant,
        product,
        {
          price:
            U64_MAX,
        }
      )
  );

  {
    const state =
      await program.account
        .product
        .fetch(product);

    console.log(
      `  price: ${state.price.toString()}`
    );
  }


  // ==========================================================
  // 11
  // ==========================================================

  section(
    "11. Failed update preserves previous state"
  );

  const beforeFailure =
    await program.account
      .product
      .fetch(product);

  await expectBlocked(
    "Invalid zero-price update rejected",
    () =>
      updateProduct(
        merchant,
        product,
        {
          title:
            "THIS MUST NOT STICK",

          stock:
            123456,

          price:
            new BN(0),

          active:
            false,
        }
      )
  );

  const afterFailure =
    await program.account
      .product
      .fetch(product);

  if (
    beforeFailure.title !==
    afterFailure.title ||
    beforeFailure.stock !==
    afterFailure.stock ||
    beforeFailure.active !==
    afterFailure.active ||
    !beforeFailure.price.eq(
      afterFailure.price
    )
  ) {
    throw new Error(
      "Rejected update caused partial mutation"
    );
  }

  console.log(
    "✓ PASS: Failed update is atomic"
  );


  // ==========================================================
  // 12
  // ==========================================================

  section(
    "12. Reputation survives merchant active-state changes"
  );

  const reputation =
    reputationPda(
      merchant.publicKey
    );

  await expectAllowed(
    "Initialize reputation",
    () =>
      program.methods
        .initializeReputation()
        .accountsStrict({
          merchantProfile:
            merchantProfile,

          reputation,

          payer:
            attacker.publicKey,

          systemProgram:
            SystemProgram.programId,
        })
        .signers([
          attacker,
        ])
        .rpc()
  );

  const reputationBefore =
    await program.account
      .merchantReputation
      .fetch(reputation);

  await setMerchantActive(
    merchant,
    false
  );

  const reputationInactive =
    await program.account
      .merchantReputation
      .fetch(reputation);

  await setMerchantActive(
    merchant,
    true
  );

  const reputationAfter =
    await program.account
      .merchantReputation
      .fetch(reputation);

  if (
    !reputationBefore.merchant.equals(
      reputationInactive.merchant
    ) ||
    reputationBefore.totalReviews.toString() !==
      reputationInactive.totalReviews.toString() ||
    reputationBefore.totalRating.toString() !==
      reputationInactive.totalRating.toString()
  ) {
    throw new Error(
      "Merchant deactivation mutated reputation"
    );
  }

  if (
    reputationBefore.totalReviews.toString() !==
    reputationAfter.totalReviews.toString()
  ) {
    throw new Error(
      "Merchant reactivation mutated reputation"
    );
  }

  console.log(
    "✓ PASS: Reputation persists across merchant active-state changes"
  );


  // ==========================================================
  // 13
  // ==========================================================

  section(
    "13. Attacker cannot change merchant active state"
  );

  await expectBlocked(
    "Attacker cannot deactivate merchant",
    async () => {
      const current =
        await program.account
          .merchantProfile
          .fetch(
            merchantProfile
          );

      return program.methods
        .updateMerchant(
          current.storeName,
          current.descriptionUri,
          current.logoUri,
          current.bannerUri,
          current.shipsFrom,
          current.sellerDepositBps,
          current.preferredContact,
          false
        )
        .accountsStrict({
          merchantProfile,

          authority:
            attacker.publicKey,
        })
        .signers([
          attacker,
        ])
        .rpc();
    }
  );


  // ==========================================================
  // Done
  // ==========================================================

  section(
    "BATCH 4 COMPLETE"
  );

  console.log(
    "Tests completed:"
  );

  console.log(
    "  • Inactive merchant product creation"
  );

  console.log(
    "  • Existing-product behavior while merchant inactive"
  );

  console.log(
    "  • Delete behavior while merchant inactive"
  );

  console.log(
    "  • Merchant reactivation"
  );

  console.log(
    "  • Product active/inactive transitions"
  );

  console.log(
    "  • Terminal deleted state"
  );

  console.log(
    "  • Merchant/product state isolation"
  );

  console.log(
    "  • Stock edge transitions"
  );

  console.log(
    "  • Price edge transitions"
  );

  console.log(
    "  • Failed-update atomicity"
  );

  console.log(
    "  • Reputation persistence"
  );

  console.log(
    "  • Unauthorized merchant deactivation"
  );

  console.log(
    "\nDONE"
  );
}


main()
  .catch((error) => {
    console.error(
      "\nFATAL TEST ERROR"
    );

    console.error(error);

    process.exit(1);
  });