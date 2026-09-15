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
// Paths / setup
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOLZAAR_IDL_PATH =
  path.join(__dirname, "sol_bazaar.json");

const RPC_URL = "http://127.0.0.1:8899";

const connection =
  new Connection(RPC_URL, "confirmed");

const idl =
  JSON.parse(
    fs.readFileSync(
      SOLZAAR_IDL_PATH,
      "utf8"
    )
  );

const PROGRAM_ID =
  new PublicKey(idl.address);


// ============================================================
// Provider wallet
// ============================================================

const walletPath =
  path.join(
    os.homedir(),
    ".config",
    "solana",
    "id.json"
  );

const walletSecret =
  JSON.parse(
    fs.readFileSync(
      walletPath,
      "utf8"
    )
  );

const payer =
  Keypair.fromSecretKey(
    Uint8Array.from(walletSecret)
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
// Formatting helpers
// ============================================================

function line() {
  console.log(
    "\n" +
    "=".repeat(60)
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
    const code =
      error.error.errorCode.code;

    const msg =
      error.error.errorMessage ?? "";

    return `${code}: ${msg}`;
  }

  if (
    error?.logs &&
    Array.isArray(error.logs)
  ) {
    const anchorLog =
      error.logs.find(
        (x) =>
          x.includes(
            "Error Code:"
          )
      );

    if (anchorLog) {
      return anchorLog
        .replace("Program log:", "")
        .trim();
    }
  }

  if (
    error?.transactionLogs &&
    Array.isArray(
      error.transactionLogs
    )
  ) {
    const anchorLog =
      error.transactionLogs.find(
        (x) =>
          x.includes(
            "Error Code:"
          )
      );

    if (anchorLog) {
      return anchorLog
        .replace("Program log:", "")
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
    const result = await fn();

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
      `Expected transaction to fail: ${label}`
    );
  } catch (error) {
    if (
      error?.message?.startsWith(
        "Expected transaction to fail:"
      )
    ) {
      throw error;
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


// ============================================================
// PDA helpers
// ============================================================

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


function reputationPda(
  merchantAuthority
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("reputation"),
      merchantAuthority.toBuffer(),
    ],
    PROGRAM_ID
  )[0];
}


// ============================================================
// Funding
// ============================================================

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
// Merchant helpers
// ============================================================

async function createMerchant({
  authority,
  storeName = "Test Store",
  descriptionUri = "https://example.com/store.json",
  logoUri = "https://example.com/logo.png",
  bannerUri = "https://example.com/banner.png",
  shipsFrom = "Philippines",
  sellerDepositBps = 500,
  preferredContact = "email@example.com",
}) {
  const profile =
    merchantPda(
      authority.publicKey
    );

  await program.methods
    .createMerchant(
      storeName,
      descriptionUri,
      logoUri,
      bannerUri,
      shipsFrom,
      sellerDepositBps,
      preferredContact
    )
    .accountsStrict({
      merchantProfile: profile,
      authority:
        authority.publicKey,
      systemProgram:
        SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  return profile;
}


async function updateMerchant({
  authority,
  profile =
    merchantPda(
      authority.publicKey
    ),
  storeName = "Updated Store",
  descriptionUri = "https://example.com/store2.json",
  logoUri = "https://example.com/logo2.png",
  bannerUri = "https://example.com/banner2.png",
  shipsFrom = "Cavite",
  sellerDepositBps = 600,
  preferredContact = "updated@example.com",
  active = true,
}) {
  return program.methods
    .updateMerchant(
      storeName,
      descriptionUri,
      logoUri,
      bannerUri,
      shipsFrom,
      sellerDepositBps,
      preferredContact,
      active
    )
    .accountsStrict({
      merchantProfile: profile,
      authority:
        authority.publicKey,
    })
    .signers([authority])
    .rpc();
}


// ============================================================
// Product helpers
// ============================================================

async function createProduct({
  authority,
  merchantProfile =
    merchantPda(
      authority.publicKey
    ),
  productId,
  product =
    productPda(
      authority.publicKey,
      productId
    ),
  title = "Security Product",
  descriptionUri = "https://example.com/product.json",
  imageUris = [
    "https://example.com/product.png",
  ],
  category = "Security",
  price = new BN(
    100_000_000
  ),
  stock = 10,
}) {
  await program.methods
    .createProduct(
      new BN(productId),
      title,
      descriptionUri,
      imageUris,
      category,
      price,
      stock
    )
    .accountsStrict({
      merchantProfile,
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


async function updateProduct({
  authority,
  product,
  title = "Updated Product",
  descriptionUri = "https://example.com/updated.json",
  imageUris = [
    "https://example.com/updated.png",
  ],
  category = "Updated",
  price = new BN(
    200_000_000
  ),
  stock = 20,
  active = true,
}) {
  return program.methods
    .updateProduct(
      title,
      descriptionUri,
      imageUris,
      category,
      price,
      stock,
      active
    )
    .accountsStrict({
      product,
      authority:
        authority.publicKey,
    })
    .signers([authority])
    .rpc();
}


async function deleteProduct({
  authority,
  product,
}) {
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
    "SolBazaar Security Test - Batch 3"
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


  // ----------------------------------------------------------
  // Wallets
  // ----------------------------------------------------------

  const merchantA =
    Keypair.generate();

  const merchantB =
    Keypair.generate();

  const attacker =
    Keypair.generate();

  const thirdParty =
    Keypair.generate();


  await fund(merchantA);
  await fund(merchantB);
  await fund(attacker);
  await fund(thirdParty);


  // ==========================================================
  // 0
  // ==========================================================

  section(
    "0. Program check"
  );

  {
    const account =
      await connection.getAccountInfo(
        PROGRAM_ID
      );

    if (
      !account ||
      !account.executable
    ) {
      throw new Error(
        "SolBazaar is not executable"
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
    "1. Create two independent merchants"
  );

  const merchantAProfile =
    await expectAllowed(
      "Merchant A created",
      () =>
        createMerchant({
          authority: merchantA,
          storeName:
            "Merchant A Store",
        })
    );

  const merchantBProfile =
    await expectAllowed(
      "Merchant B created",
      () =>
        createMerchant({
          authority: merchantB,
          storeName:
            "Merchant B Store",
        })
    );

  console.log(
    `  A profile: ${merchantAProfile.toBase58()}`
  );

  console.log(
    `  B profile: ${merchantBProfile.toBase58()}`
  );

  if (
    merchantAProfile.equals(
      merchantBProfile
    )
  ) {
    throw new Error(
      "Merchant PDA collision"
    );
  }

  console.log(
    "✓ PASS: Merchant PDAs are isolated"
  );


  // ==========================================================
  // 2
  // ==========================================================

  section(
    "2. Same product_id across different merchants"
  );

  const SHARED_ID = 3001;

  const productA =
    productPda(
      merchantA.publicKey,
      SHARED_ID
    );

  const productB =
    productPda(
      merchantB.publicKey,
      SHARED_ID
    );

  await expectAllowed(
    "Merchant A creates product_id 3001",
    () =>
      createProduct({
        authority: merchantA,
        productId: SHARED_ID,
        title: "Product A",
      })
  );

  await expectAllowed(
    "Merchant B also creates product_id 3001",
    () =>
      createProduct({
        authority: merchantB,
        productId: SHARED_ID,
        title: "Product B",
      })
  );

  console.log(
    `  A product: ${productA.toBase58()}`
  );

  console.log(
    `  B product: ${productB.toBase58()}`
  );

  if (
    productA.equals(productB)
  ) {
    throw new Error(
      "Cross-merchant product PDA collision"
    );
  }

  console.log(
    "✓ PASS: Same product_id is safely namespaced per merchant"
  );


  // ==========================================================
  // 3
  // ==========================================================

  section(
    "3. Merchant-profile substitution during product creation"
  );

  const substitutionId =
    3002;

  const substitutionProduct =
    productPda(
      merchantA.publicKey,
      substitutionId
    );

  await expectBlocked(
    "Merchant A cannot create product using Merchant B profile",
    () =>
      createProduct({
        authority: merchantA,

        merchantProfile:
          merchantBProfile,

        productId:
          substitutionId,

        product:
          substitutionProduct,
      })
  );


  // ==========================================================
  // 4
  // ==========================================================

  section(
    "4. Cross-merchant product update"
  );

  const beforeA =
    await program.account.product.fetch(
      productA
    );

  await expectBlocked(
    "Merchant B cannot update Merchant A product",
    () =>
      updateProduct({
        authority: merchantB,
        product: productA,
        title:
          "HACKED BY MERCHANT B",
      })
  );

  const afterA =
    await program.account.product.fetch(
      productA
    );

  if (
    beforeA.title !==
    afterA.title
  ) {
    throw new Error(
      "Unauthorized update mutated product"
    );
  }

  console.log(
    "✓ PASS: Merchant A product unchanged"
  );


  // ==========================================================
  // 5
  // ==========================================================

  section(
    "5. Cross-merchant product deletion"
  );

  await expectBlocked(
    "Merchant B cannot delete Merchant A product",
    () =>
      deleteProduct({
        authority: merchantB,
        product: productA,
      })
  );

  {
    const account =
      await program.account.product.fetch(
        productA
      );

    console.log(
      `  active:  ${account.active}`
    );

    console.log(
      `  deleted: ${account.deleted}`
    );

    if (
      account.deleted
    ) {
      throw new Error(
        "Unauthorized delete succeeded"
      );
    }

    console.log(
      "✓ PASS: Product remains undeleted"
    );
  }


  // ==========================================================
  // 6
  // ==========================================================

  section(
    "6. Product merchant field integrity"
  );

  {
    const account =
      await program.account.product.fetch(
        productA
      );

    if (
      !account.merchant.equals(
        merchantA.publicKey
      )
    ) {
      throw new Error(
        "Product merchant mismatch"
      );
    }

    console.log(
      "✓ PASS: Product merchant initially correct"
    );
  }


  await expectAllowed(
    "Merchant A updates own product",
    () =>
      updateProduct({
        authority: merchantA,
        product: productA,
        title:
          "Merchant A Updated",
      })
  );

  {
    const account =
      await program.account.product.fetch(
        productA
      );

    if (
      !account.merchant.equals(
        merchantA.publicKey
      )
    ) {
      throw new Error(
        "update_product modified product.merchant"
      );
    }

    console.log(
      "✓ PASS: update_product cannot change product.merchant"
    );
  }


  // ==========================================================
  // 7
  // ==========================================================

  section(
    "7. Merchant authority field integrity"
  );

  const beforeMerchant =
    await program.account.merchantProfile.fetch(
      merchantAProfile
    );

  await expectAllowed(
    "Merchant A updates own profile",
    () =>
      updateMerchant({
        authority: merchantA,
        storeName:
          "Merchant A Updated Store",
      })
  );

  const afterMerchant =
    await program.account.merchantProfile.fetch(
      merchantAProfile
    );

  if (
    !beforeMerchant.authority.equals(
      afterMerchant.authority
    )
  ) {
    throw new Error(
      "Merchant authority was modified"
    );
  }

  console.log(
    "✓ PASS: update_merchant preserves authority"
  );


  // ==========================================================
  // 8
  // ==========================================================

  section(
    "8. Merchant profile account substitution"
  );

  await expectBlocked(
    "Merchant A cannot update Merchant B profile",
    () =>
      updateMerchant({
        authority: merchantA,
        profile:
          merchantBProfile,
        storeName:
          "TAKEOVER ATTEMPT",
      })
  );

  {
    const account =
      await program.account.merchantProfile.fetch(
        merchantBProfile
      );

    if (
      account.storeName ===
      "TAKEOVER ATTEMPT"
    ) {
      throw new Error(
        "Merchant profile takeover succeeded"
      );
    }

    console.log(
      "✓ PASS: Merchant B profile unchanged"
    );
  }


  // ==========================================================
  // 9
  // ==========================================================

  section(
    "9. Random/fake product account substitution"
  );

  const fakeProduct =
    Keypair.generate().publicKey;

  await expectBlocked(
    "Random account cannot be treated as Product",
    () =>
      updateProduct({
        authority: merchantA,
        product: fakeProduct,
      })
  );


  // ==========================================================
  // 10
  // ==========================================================

  section(
    "10. product_id = 0"
  );

  const zeroIdProduct =
    await expectAllowed(
      "product_id = 0 is supported",
      () =>
        createProduct({
          authority: merchantA,
          productId: 0,
          title:
            "Zero ID Product",
        })
    );

  {
    const account =
      await program.account.product.fetch(
        zeroIdProduct
      );

    console.log(
      `  product_id: ${account.productId.toString()}`
    );
  }


  // ==========================================================
  // 11
  // ==========================================================

  section(
    "11. product_id = u64::MAX"
  );

  const U64_MAX =
    new BN(
      "18446744073709551615"
    );

  const maxIdProduct =
    productPda(
      merchantA.publicKey,
      U64_MAX
    );

  await expectAllowed(
    "product_id = u64::MAX is supported",
    () =>
      createProduct({
        authority: merchantA,
        productId: U64_MAX,
        product: maxIdProduct,
        title:
          "Maximum ID Product",
      })
  );

  {
    const account =
      await program.account.product.fetch(
        maxIdProduct
      );

    console.log(
      `  product_id: ${account.productId.toString()}`
    );
  }


  // ==========================================================
  // 12
  // ==========================================================

  section(
    "12. Reputation PDA isolation"
  );

  const reputationA =
    reputationPda(
      merchantA.publicKey
    );

  const reputationB =
    reputationPda(
      merchantB.publicKey
    );

  if (
    reputationA.equals(
      reputationB
    )
  ) {
    throw new Error(
      "Reputation PDA collision"
    );
  }

  console.log(
    `  A reputation: ${reputationA.toBase58()}`
  );

  console.log(
    `  B reputation: ${reputationB.toBase58()}`
  );

  console.log(
    "✓ PASS: Reputation namespace isolated per merchant"
  );


  // ==========================================================
  // 13
  // ==========================================================

  section(
    "13. Third-party reputation initialization"
  );

  await expectAllowed(
    "Third party can initialize Merchant A reputation",
    () =>
      program.methods
        .initializeReputation()
        .accountsStrict({
          merchantProfile:
            merchantAProfile,

          reputation:
            reputationA,

          payer:
            thirdParty.publicKey,

          systemProgram:
            SystemProgram.programId,
        })
        .signers([
          thirdParty,
        ])
        .rpc()
  );

  {
    const account =
      await program.account.merchantReputation.fetch(
        reputationA
      );

    console.log(
      `  merchant: ${account.merchant.toBase58()}`
    );

    console.log(
      `  total reviews: ${account.totalReviews.toString()}`
    );

    console.log(
      "ℹ INFO: initialize_reputation is intentionally permissionless."
    );

    console.log(
      "  Third party pays the rent, but cannot choose or forge reputation values."
    );
  }


  // ==========================================================
  // 14
  // ==========================================================

  section(
    "14. Cross-merchant reputation substitution"
  );

  await expectBlocked(
    "Merchant B profile cannot initialize Merchant A reputation PDA",
    () =>
      program.methods
        .initializeReputation()
        .accountsStrict({
          merchantProfile:
            merchantBProfile,

          reputation:
            reputationA,

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


  // ==========================================================
  // 15
  // ==========================================================

  section(
    "15. verified / total_sold preservation"
  );

  const beforeState =
    await program.account.merchantProfile.fetch(
      merchantAProfile
    );

  await expectAllowed(
    "Normal merchant update",
    () =>
      updateMerchant({
        authority:
          merchantA,

        storeName:
          "Integrity Test Store",
      })
  );

  const afterState =
    await program.account.merchantProfile.fetch(
      merchantAProfile
    );

  console.log(
    `  verified before:   ${beforeState.verified}`
  );

  console.log(
    `  verified after:    ${afterState.verified}`
  );

  console.log(
    `  total_sold before: ${beforeState.totalSold}`
  );

  console.log(
    `  total_sold after:  ${afterState.totalSold}`
  );

  if (
    beforeState.verified !==
    afterState.verified
  ) {
    throw new Error(
      "update_merchant modified verified"
    );
  }

  if (
    Number(
      beforeState.totalSold
    ) !==
    Number(
      afterState.totalSold
    )
  ) {
    throw new Error(
      "update_merchant modified total_sold"
    );
  }

  console.log(
    "✓ PASS: Merchant update cannot modify verified or total_sold"
  );


  // ==========================================================
  // Done
  // ==========================================================

  section(
    "BATCH 3 COMPLETE"
  );

  console.log(
    "Tests completed:"
  );

  console.log(
    "  • Merchant PDA isolation"
  );

  console.log(
    "  • Product namespace isolation"
  );

  console.log(
    "  • Merchant-profile substitution"
  );

  console.log(
    "  • Cross-merchant update attack"
  );

  console.log(
    "  • Cross-merchant delete attack"
  );

  console.log(
    "  • Product merchant immutability"
  );

  console.log(
    "  • Merchant authority immutability"
  );

  console.log(
    "  • Fake Product account substitution"
  );

  console.log(
    "  • product_id 0 / u64::MAX"
  );

  console.log(
    "  • Reputation PDA isolation"
  );

  console.log(
    "  • Third-party reputation initialization"
  );

  console.log(
    "  • verified / total_sold preservation"
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