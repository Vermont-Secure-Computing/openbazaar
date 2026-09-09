import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC = "http://127.0.0.1:8899";

const SOLZAAR_IDL_PATH = path.join(__dirname, "sol_bazaar.json");

const solzaarIdl = JSON.parse(
  fs.readFileSync(SOLZAAR_IDL_PATH, "utf8")
);

const SOLZAAR_PROGRAM_ID = new PublicKey(solzaarIdl.address);

const walletPath =
  process.env.ANCHOR_WALLET ??
  path.join(os.homedir(), ".config/solana/id.json");

const walletData = JSON.parse(
  fs.readFileSync(walletPath, "utf8")
);

const payer = Keypair.fromSecretKey(
  Uint8Array.from(walletData)
);

const connection = new Connection(RPC, "confirmed");

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

const program = new anchor.Program(
  solzaarIdl,
  provider
);


// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function section(title) {
  console.log("\n============================================================");
  console.log(title);
  console.log("============================================================");
}

function shortError(err) {
  if (!err) return "Unknown error";

  if (err.error?.errorCode?.code) {
    return `${err.error.errorCode.code}: ${
      err.error.errorMessage ?? ""
    }`;
  }

  if (err.message) {
    return err.message.split("\n")[0];
  }

  return String(err);
}

async function expectBlocked(label, fn) {
  try {
    await fn();

    console.log(`✗ FAIL: ${label}`);
    console.log("  ↳ Transaction unexpectedly succeeded");

    return false;
  } catch (err) {
    console.log(`✓ BLOCKED: ${label}`);
    console.log(`  ↳ ${shortError(err)}`);

    return true;
  }
}

async function expectAllowed(label, fn) {
  try {
    const result = await fn();

    console.log(`✓ PASS: ${label}`);

    return result;
  } catch (err) {
    console.log(`✗ FAIL: ${label}`);
    console.log(`  ↳ ${shortError(err)}`);
    throw err;
  }
}

async function fund(keypair, sol = 5) {
  const sig = await connection.requestAirdrop(
    keypair.publicKey,
    sol * LAMPORTS_PER_SOL
  );

  const latest = await connection.getLatestBlockhash();

  await connection.confirmTransaction(
    {
      signature: sig,
      ...latest,
    },
    "confirmed"
  );
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
  const id = new BN(productId);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("product"),
      authority.toBuffer(),
      id.toArrayLike(Buffer, "le", 8),
    ],
    SOLZAAR_PROGRAM_ID
  )[0];
}

async function createMerchant({
  authority,
  storeName = "Security Batch 2 Store",
  descriptionUri = "https://example.com/store.json",
  logoUri = "https://example.com/logo.png",
  bannerUri = "https://example.com/banner.png",
  shipsFrom = "Philippines",
  sellerDepositBps = 1000,
  preferredContact = "security@example.com",
}) {
  const merchantProfile = merchantPda(
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
    .accounts({
      merchantProfile,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  return merchantProfile;
}

async function createProduct({
  authority,
  productId,
  title = "Batch 2 Product",
  descriptionUri = "https://example.com/product.json",
  imageUris = [
    "https://example.com/product.png",
  ],
  category = "Security",
  price = new BN(100_000_000),
  stock = 10,
}) {
  const merchantProfile = merchantPda(
    authority.publicKey
  );

  const product = productPda(
    authority.publicKey,
    productId
  );

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
    .accounts({
      merchantProfile,
      product,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  return product;
}

async function updateProduct({
  authority,
  product,
  title = "Updated Batch 2 Product",
  descriptionUri = "https://example.com/product-updated.json",
  imageUris = [
    "https://example.com/updated.png",
  ],
  category = "Security",
  price = new BN(200_000_000),
  stock = 10,
  active = true,
}) {
  await program.methods
    .updateProduct(
      title,
      descriptionUri,
      imageUris,
      category,
      price,
      stock,
      active
    )
    .accounts({
      product,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();
}

async function deleteProduct({
  authority,
  product,
}) {
  await program.methods
    .deleteProduct()
    .accounts({
      product,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();
}


// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

async function main() {
  section("SolBazaar Security Test - Batch 2");

  console.log(`RPC:       ${RPC}`);
  console.log(
    `Program:   ${SOLZAAR_PROGRAM_ID.toBase58()}`
  );
  console.log(
    `Provider:  ${payer.publicKey.toBase58()}`
  );


  // ----------------------------------------------------------
  // 0. Program check
  // ----------------------------------------------------------

  section("0. Program check");

  const programInfo =
    await connection.getAccountInfo(
      SOLZAAR_PROGRAM_ID
    );

  if (!programInfo?.executable) {
    throw new Error(
      "SolBazaar program is not executable locally"
    );
  }

  console.log(
    "✓ PASS: SolBazaar executable locally"
  );


  // ----------------------------------------------------------
  // 1. Main merchant
  // ----------------------------------------------------------

  section("1. Create main test merchant");

  const merchant = Keypair.generate();

  await fund(merchant);

  const merchantProfile =
    await createMerchant({
      authority: merchant,
    });

  console.log("✓ PASS: Main merchant created");
  console.log(
    `  merchant: ${merchant.publicKey.toBase58()}`
  );
  console.log(
    `  profile:  ${merchantProfile.toBase58()}`
  );


  // ----------------------------------------------------------
  // 2. Merchant exact maximum boundaries
  // ----------------------------------------------------------

  section("2. Merchant exact boundary values");

async function testMerchantBoundary(label, overrides) {
  const k = Keypair.generate();

  await fund(k);

  await expectAllowed(
    label,
    () =>
      createMerchant({
        authority: k,
        ...overrides,
      })
  );

  return program.account.merchantProfile.fetch(
    merchantPda(k.publicKey)
  );
}


// store_name = 64
{
  const account = await testMerchantBoundary(
    "store_name = exactly 64 characters",
    {
      storeName: "A".repeat(64),
    }
  );

  console.log(
    `  stored length: ${account.storeName.length}`
  );
}


// description_uri = 200
{
  const account = await testMerchantBoundary(
    "description_uri = exactly 200 characters",
    {
      descriptionUri: "D".repeat(200),
    }
  );

  console.log(
    `  stored length: ${account.descriptionUri.length}`
  );
}


// logo_uri = 200
{
  const account = await testMerchantBoundary(
    "logo_uri = exactly 200 characters",
    {
      logoUri: "L".repeat(200),
    }
  );

  console.log(
    `  stored length: ${account.logoUri.length}`
  );
}


// banner_uri = 200
{
  const account = await testMerchantBoundary(
    "banner_uri = exactly 200 characters",
    {
      bannerUri: "B".repeat(200),
    }
  );

  console.log(
    `  stored length: ${account.bannerUri.length}`
  );
}


// ships_from = 64
{
  const account = await testMerchantBoundary(
    "ships_from = exactly 64 characters",
    {
      shipsFrom: "S".repeat(64),
    }
  );

  console.log(
    `  stored length: ${account.shipsFrom.length}`
  );
}


// preferred_contact = 300
{
  const account = await testMerchantBoundary(
    "preferred_contact = exactly 300 characters",
    {
      preferredContact: "C".repeat(300),
    }
  );

  console.log(
    `  stored length: ${account.preferredContact.length}`
  );
}


// seller_deposit_bps = 10000
{
  const account = await testMerchantBoundary(
    "seller_deposit_bps = exactly 10000",
    {
      sellerDepositBps: 10000,
    }
  );

  console.log(
    `  stored BPS: ${account.sellerDepositBps}`
  );
}


  // ----------------------------------------------------------
  // 3. Store name > 64
  // ----------------------------------------------------------

  section("3. Oversized merchant store name");

  {
    const k = Keypair.generate();
    await fund(k);

    await expectBlocked(
      "Store name = 65 characters",
      () =>
        createMerchant({
          authority: k,
          storeName: "A".repeat(65),
        })
    );
  }


  // ----------------------------------------------------------
  // 4. Description > 200
  // ----------------------------------------------------------

  section("4. Oversized merchant description");

  {
    const k = Keypair.generate();
    await fund(k);

    await expectBlocked(
      "Merchant description = 201 characters",
      () =>
        createMerchant({
          authority: k,
          descriptionUri:
            "D".repeat(201),
        })
    );
  }


  // ----------------------------------------------------------
  // 5. seller_deposit_bps > 10000
  // ----------------------------------------------------------

  section("5. Invalid seller deposit percentage");

  {
    const k = Keypair.generate();
    await fund(k);

    await expectBlocked(
      "seller_deposit_bps = 10001",
      () =>
        createMerchant({
          authority: k,
          sellerDepositBps: 10001,
        })
    );
  }


  // ----------------------------------------------------------
  // 6. preferred_contact > 300
  // ----------------------------------------------------------

  section("6. Oversized preferred contact");

  {
    const k = Keypair.generate();
    await fund(k);

    await expectBlocked(
      "preferred_contact = 301 characters",
      () =>
        createMerchant({
          authority: k,
          preferredContact:
            "C".repeat(301),
        })
    );
  }


  // ----------------------------------------------------------
  // 7. Exact product field boundaries
  // ----------------------------------------------------------

  section("7. Product exact boundary values");

async function testProductBoundary(label, productId, overrides) {
  const product = await expectAllowed(
    label,
    () =>
      createProduct({
        authority: merchant,
        productId,
        ...overrides,
      })
  );

  return program.account.product.fetch(product);
}


// title = 64
{
  const account = await testProductBoundary(
    "title = exactly 64 characters",
    2001,
    {
      title: "T".repeat(64),
    }
  );

  console.log(
    `  stored length: ${account.title.length}`
  );
}


// description_uri = 200
{
  const account = await testProductBoundary(
    "description_uri = exactly 200 characters",
    2002,
    {
      descriptionUri: "D".repeat(200),
    }
  );

  console.log(
    `  stored length: ${account.descriptionUri.length}`
  );
}


// one image URI = 250
{
  const account = await testProductBoundary(
    "single image URI = exactly 250 characters",
    2003,
    {
      imageUris: [
        "I".repeat(250),
      ],
    }
  );

  console.log(
    `  image length: ${account.imageUris[0].length}`
  );
}


// exactly 3 normal images
{
  const account = await testProductBoundary(
    "exactly 3 image URIs",
    2004,
    {
      imageUris: [
        "https://example.com/a.png",
        "https://example.com/b.png",
        "https://example.com/c.png",
      ],
    }
  );

  console.log(
    `  image count: ${account.imageUris.length}`
  );
}


// category = 32
{
  const account = await testProductBoundary(
    "category = exactly 32 characters",
    2005,
    {
      category: "K".repeat(32),
    }
  );

  console.log(
    `  stored length: ${account.category.length}`
  );
}


// minimum valid price
{
  const account = await testProductBoundary(
    "price = 1 lamport",
    2006,
    {
      price: new BN(1),
    }
  );

  console.log(
    `  stored price: ${account.price.toString()}`
  );
}


// stock = 1
{
  const account = await testProductBoundary(
    "stock = 1",
    2007,
    {
      stock: 1,
    }
  );

  console.log(
    `  stored stock: ${account.stock}`
  );
}


  // ----------------------------------------------------------
  // 8. Title > 64
  // ----------------------------------------------------------

  section("8. Product title overflow");

  await expectBlocked(
    "Product title = 65 characters",
    () =>
      createProduct({
        authority: merchant,
        productId: 2101,
        title: "T".repeat(65),
      })
  );


  // ----------------------------------------------------------
  // 9. Description > 200
  // ----------------------------------------------------------

  section("9. Product description overflow");

  await expectBlocked(
    "Product description = 201 characters",
    () =>
      createProduct({
        authority: merchant,
        productId: 2102,
        descriptionUri:
          "D".repeat(201),
      })
  );


  // ----------------------------------------------------------
  // 10. Category > 32
  // ----------------------------------------------------------

  section("10. Product category overflow");

  await expectBlocked(
    "Product category = 33 characters",
    () =>
      createProduct({
        authority: merchant,
        productId: 2103,
        category: "K".repeat(33),
      })
  );


  // ----------------------------------------------------------
  // 11. Image URI > 250
  // ----------------------------------------------------------

  section("11. Image URI overflow");

  await expectBlocked(
    "Image URI = 251 characters",
    () =>
      createProduct({
        authority: merchant,
        productId: 2104,
        imageUris: [
          "I".repeat(251),
        ],
      })
  );


  // ----------------------------------------------------------
  // 12. Whitespace image
  // ----------------------------------------------------------

  section("12. Whitespace-only image URI");

  await expectBlocked(
    "Whitespace-only image URI",
    () =>
      createProduct({
        authority: merchant,
        productId: 2105,
        imageUris: [
          "        ",
        ],
      })
  );


  // ----------------------------------------------------------
  // 13. Zero stock
  // ----------------------------------------------------------

  section("13. Zero-stock product");

  const zeroStockProduct =
    await expectAllowed(
      "Product with stock = 0",
      () =>
        createProduct({
          authority: merchant,
          productId: 2106,
          stock: 0,
        })
    );

  const zeroStockAccount =
    await program.account.product.fetch(
      zeroStockProduct
    );

  console.log(
    `  stock: ${zeroStockAccount.stock}`
  );

  console.log(
    "ℹ INFO: Contract currently allows creation with stock = 0."
  );


  // ----------------------------------------------------------
  // 14. Maximum u32 stock
  // ----------------------------------------------------------

  section("14. Maximum u32 stock");

  const maxStock = 4_294_967_295;

  const maxStockProduct =
    await expectAllowed(
      "stock = u32::MAX",
      () =>
        createProduct({
          authority: merchant,
          productId: 2107,
          stock: maxStock,
        })
    );

  let maxStockAccount =
    await program.account.product.fetch(
      maxStockProduct
    );

  console.log(
    `  stock: ${maxStockAccount.stock}`
  );


  // ----------------------------------------------------------
  // 15. Maximum u64 price
  // ----------------------------------------------------------

  section("15. Maximum u64 price");

  const U64_MAX =
    new BN("18446744073709551615");

  const maxPriceProduct =
    await expectAllowed(
      "price = u64::MAX",
      () =>
        createProduct({
          authority: merchant,
          productId: 2108,
          price: U64_MAX,
          stock: 1,
        })
    );

  const maxPriceAccount =
    await program.account.product.fetch(
      maxPriceProduct
    );

  console.log(
    `  price: ${maxPriceAccount.price.toString()}`
  );


  // ----------------------------------------------------------
  // 16. Update can set stock directly
  // ----------------------------------------------------------

  section("16. Direct stock overwrite");

  const stockProduct =
    await createProduct({
      authority: merchant,
      productId: 2109,
      stock: 100,
    });

  let stockAccount =
    await program.account.product.fetch(
      stockProduct
    );

  console.log(
    `  before stock: ${stockAccount.stock}`
  );

  await expectAllowed(
    "Merchant can directly change stock 100 → 0",
    () =>
      updateProduct({
        authority: merchant,
        product: stockProduct,
        stock: 0,
      })
  );

  stockAccount =
    await program.account.product.fetch(
      stockProduct
    );

  console.log(
    `  after stock: ${stockAccount.stock}`
  );

  console.log(
    "ℹ INFO: update_product currently treats stock as an absolute merchant-controlled value."
  );


  // ----------------------------------------------------------
  // 17. Update cannot change sold
  // ----------------------------------------------------------

  section("17. sold field preservation");

  const soldBefore =
    Number(stockAccount.sold);

  await updateProduct({
    authority: merchant,
    product: stockProduct,
    title: "Sold Preservation Test",
    stock: 55,
  });

  const soldAfterAccount =
    await program.account.product.fetch(
      stockProduct
    );

  const soldAfter =
    Number(soldAfterAccount.sold);

  if (soldBefore === soldAfter) {
    console.log(
      "✓ PASS: update_product does not modify sold"
    );
  } else {
    console.log(
      "✗ FAIL: update_product changed sold unexpectedly"
    );
  }

  console.log(
    `  sold before: ${soldBefore}`
  );

  console.log(
    `  sold after:  ${soldAfter}`
  );


  // ----------------------------------------------------------
  // 18. update_product zero price
  // ----------------------------------------------------------

  section("18. Zero-price update");

  await expectBlocked(
    "Existing product cannot be updated to price = 0",
    () =>
      updateProduct({
        authority: merchant,
        product: stockProduct,
        price: new BN(0),
      })
  );


  // ----------------------------------------------------------
  // 19. Failed update must not mutate state
  // ----------------------------------------------------------

  section("19. Atomicity after rejected update");

  const beforeBadUpdate =
    await program.account.product.fetch(
      stockProduct
    );

  await expectBlocked(
    "Oversized title update rejected",
    () =>
      updateProduct({
        authority: merchant,
        product: stockProduct,
        title: "X".repeat(65),
        stock: 999999,
      })
  );

  const afterBadUpdate =
    await program.account.product.fetch(
      stockProduct
    );

  if (
    beforeBadUpdate.title ===
      afterBadUpdate.title &&
    Number(beforeBadUpdate.stock) ===
      Number(afterBadUpdate.stock)
  ) {
    console.log(
      "✓ PASS: Rejected update caused no partial state mutation"
    );
  } else {
    console.log(
      "✗ CRITICAL: State changed after rejected transaction"
    );
  }


  // ----------------------------------------------------------
  // 20. Delete product
  // ----------------------------------------------------------

  section("20. Product soft-delete");

  const deleteTestProduct =
    await createProduct({
      authority: merchant,
      productId: 2110,
      title: "Delete Test Product",
      stock: 5,
    });

  await expectAllowed(
    "Merchant can delete own product",
    () =>
      deleteProduct({
        authority: merchant,
        product:
          deleteTestProduct,
      })
  );

  let deletedAccount =
    await program.account.product.fetch(
      deleteTestProduct
    );

  console.log(
    `  active:  ${deletedAccount.active}`
  );

  console.log(
    `  deleted: ${deletedAccount.deleted}`
  );

  if (
    deletedAccount.active === false &&
    deletedAccount.deleted === true
  ) {
    console.log(
      "✓ PASS: delete_product sets active=false and deleted=true"
    );
  } else {
    console.log(
      "✗ FAIL: Unexpected delete state"
    );
  }


  // ----------------------------------------------------------
  // 21. Can deleted product be updated/reactivated?
  // ----------------------------------------------------------

  section("21. Deleted-product resurrection test");

  try {
    await updateProduct({
      authority: merchant,
      product: deleteTestProduct,

      title:
        "Resurrected Product",

      descriptionUri:
        "https://example.com/resurrected.json",

      imageUris: [
        "https://example.com/resurrected.png",
      ],

      category:
        "Security",

      price:
        new BN(100_000_000),

      stock: 10,

      active: true,
    });

    deletedAccount =
      await program.account.product.fetch(
        deleteTestProduct
      );

    console.log(
      "⚠ FINDING: Deleted product CAN be updated after delete."
    );

    console.log(
      `  active:  ${deletedAccount.active}`
    );

    console.log(
      `  deleted: ${deletedAccount.deleted}`
    );

    if (
      deletedAccount.active === true &&
      deletedAccount.deleted === true
    ) {
      console.log(
        "⚠ IMPORTANT: Product is now active=true AND deleted=true."
      );

      console.log(
        "  This is an inconsistent state."
      );
    }
  } catch (err) {
    console.log(
      "✓ BLOCKED: Deleted product cannot be updated/reactivated"
    );

    console.log(
      `  ↳ ${shortError(err)}`
    );
  }


  // ----------------------------------------------------------
  // 22. Delete twice
  // ----------------------------------------------------------

  section("22. Repeated delete");

  try {
    await deleteProduct({
      authority: merchant,
      product:
        deleteTestProduct,
    });

    console.log(
      "ℹ INFO: delete_product can be called repeatedly."
    );

    const state =
      await program.account.product.fetch(
        deleteTestProduct
      );

    console.log(
      `  active:  ${state.active}`
    );

    console.log(
      `  deleted: ${state.deleted}`
    );
  } catch (err) {
    console.log(
      `✓ BLOCKED: Second delete rejected: ${shortError(err)}`
    );
  }


  // ----------------------------------------------------------
  // Summary
  // ----------------------------------------------------------

  section("BATCH 2 COMPLETE");

  console.log(
    "Tests completed:"
  );

  console.log(
    "  • Merchant length boundaries"
  );

  console.log(
    "  • seller_deposit_bps boundary"
  );

  console.log(
    "  • Product length boundaries"
  );

  console.log(
    "  • Image URI validation"
  );

  console.log(
    "  • Zero/max stock"
  );

  console.log(
    "  • u64 max price"
  );

  console.log(
    "  • Direct stock overwrite"
  );

  console.log(
    "  • sold preservation"
  );

  console.log(
    "  • Failed-update atomicity"
  );

  console.log(
    "  • Soft delete"
  );

  console.log(
    "  • Deleted-product resurrection"
  );

  console.log(
    "  • Repeated delete"
  );
}


main()
  .then(() => {
    console.log("\nDONE");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nFATAL TEST ERROR");
    console.error(err);
    process.exit(1);
  });