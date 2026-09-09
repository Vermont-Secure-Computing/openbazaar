import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} = anchor.web3;


// ============================================================
// CONFIG
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

const SOLZAAR_PROGRAM_ID = new PublicKey(solzaarIdl.address);
const ESCROW_PROGRAM_ID = new PublicKey(escrowIdl.address);

// ============================================================
// LOAD LOCAL SOLANA CLI WALLET
// ============================================================

const walletPath = path.join(
  os.homedir(),
  ".config",
  "solana",
  "id.json"
);

const secret = JSON.parse(fs.readFileSync(walletPath, "utf8"));

const payerKeypair = Keypair.fromSecretKey(
  Uint8Array.from(secret)
);

const connection = new Connection(RPC, "confirmed");

const wallet = new anchor.Wallet(payerKeypair);

const provider = new anchor.AnchorProvider(
  connection,
  wallet,
  {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  }
);

anchor.setProvider(provider);

const solzaar = new anchor.Program(
  solzaarIdl,
  provider
);

const escrow = new anchor.Program(
  escrowIdl,
  provider
);

// ============================================================
// HELPERS
// ============================================================

function section(title) {
  console.log("\n============================================================");
  console.log(title);
  console.log("============================================================");
}

function ok(name) {
  console.log(`✓ PASS: ${name}`);
}

function fail(name, err = "") {
  console.error(`✗ FAIL: ${name}`);

  if (err) {
    console.error(
      String(err?.message || err)
        .split("\n")
        .slice(0, 6)
        .join("\n")
    );
  }
}

function expectedFail(name, err) {
  console.log(`✓ BLOCKED: ${name}`);

  const message = String(err?.message || err)
    .split("\n")
    .slice(0, 4)
    .join("\n");

  console.log(`  ↳ ${message}`);
}

async function mustFail(name, fn) {
  try {
    await fn();

    fail(
      name,
      "Transaction unexpectedly succeeded. Possible security issue."
    );

    return false;
  } catch (err) {
    expectedFail(name, err);
    return true;
  }
}

async function mustPass(name, fn) {
  try {
    const result = await fn();
    ok(name);
    return result;
  } catch (err) {
    fail(name, err);
    throw err;
  }
}

async function airdrop(pubkey, sol = 5) {
  const sig = await connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(sig, "confirmed");
}

function u64Seed(value) {
  return new BN(value).toArrayLike(
    Buffer,
    "le",
    8
  );
}

// ============================================================
// PDA HELPERS
// ============================================================

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
      u64Seed(productId),
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

// ============================================================
// TEST WALLETS
// ============================================================

const merchant = Keypair.generate();
const attacker = Keypair.generate();

const merchantProfile = merchantPda(
  merchant.publicKey
);

const attackerMerchantProfile = merchantPda(
  attacker.publicKey
);

const PRODUCT_ID = new BN(1001);

const product = productPda(
  merchant.publicKey,
  PRODUCT_ID
);

const reputation = reputationPda(
  merchant.publicKey
);

// ============================================================
// MERCHANT DEFAULT DATA
// ============================================================

const merchantData = {
  storeName: "Security Test Store",
  descriptionUri: "https://example.com/store.json",
  logoUri: "https://example.com/logo.png",
  bannerUri: "https://example.com/banner.png",
  shipsFrom: "Cavite",
  sellerDepositBps: 1000,
  preferredContact: "test@example.com",
};

// ============================================================
// MAIN
// ============================================================

async function main() {
  section("SolBazaar local security test");

  console.log("RPC:       ", RPC);
  console.log("SolBazaar: ", SOLZAAR_PROGRAM_ID.toBase58());
  console.log("Escrow:    ", ESCROW_PROGRAM_ID.toBase58());
  console.log("Provider:  ", payerKeypair.publicKey.toBase58());
  console.log("Merchant:  ", merchant.publicKey.toBase58());
  console.log("Attacker:  ", attacker.publicKey.toBase58());

  // ----------------------------------------------------------
  // Check programs
  // ----------------------------------------------------------

  section("0. Program checks");

  const solzaarProgramInfo =
    await connection.getAccountInfo(
      SOLZAAR_PROGRAM_ID
    );

  if (!solzaarProgramInfo?.executable) {
    throw new Error(
      `SolBazaar program is not executable locally: ${SOLZAAR_PROGRAM_ID}`
    );
  }

  ok("SolBazaar program exists locally");

  const escrowProgramInfo =
    await connection.getAccountInfo(
      ESCROW_PROGRAM_ID
    );

  if (escrowProgramInfo?.executable) {
    ok("Escrow program exists locally");
  } else {
    console.log(
      "⚠ Escrow program not loaded locally. Fine for this first test batch."
    );
  }

  // ----------------------------------------------------------
  // Fund accounts
  // ----------------------------------------------------------

  section("1. Funding test wallets");

  await airdrop(merchant.publicKey, 10);
  await airdrop(attacker.publicKey, 10);

  ok("Merchant funded");
  ok("Attacker funded");

  // ==========================================================
  // CREATE MERCHANT
  // ==========================================================

  section("2. Create merchant");

  await mustPass(
    "Legitimate merchant can create profile",
    async () => {
      return await solzaar.methods
        .createMerchant(
          merchantData.storeName,
          merchantData.descriptionUri,
          merchantData.logoUri,
          merchantData.bannerUri,
          merchantData.shipsFrom,
          merchantData.sellerDepositBps,
          merchantData.preferredContact
        )
        .accounts({
          merchantProfile,
          authority: merchant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    }
  );

  const merchantAccount =
    await solzaar.account.merchantProfile.fetch(
      merchantProfile
    );

  console.log(
    "  store:",
    merchantAccount.storeName
  );

  console.log(
    "  authority:",
    merchantAccount.authority.toBase58()
  );

  // ==========================================================
  // DUPLICATE MERCHANT
  // ==========================================================

  section("3. Duplicate merchant PDA");

  await mustFail(
    "Same authority cannot create merchant twice",
    async () => {
      return await solzaar.methods
        .createMerchant(
          "Duplicate Store",
          merchantData.descriptionUri,
          merchantData.logoUri,
          merchantData.bannerUri,
          merchantData.shipsFrom,
          merchantData.sellerDepositBps,
          merchantData.preferredContact
        )
        .accounts({
          merchantProfile,
          authority: merchant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    }
  );

  // ==========================================================
  // ATTACKER UPDATE MERCHANT
  // ==========================================================

  section("4. Unauthorized merchant update");

  await mustFail(
    "Attacker cannot update another merchant profile",
    async () => {
      return await solzaar.methods
        .updateMerchant(
          "HACKED STORE",
          "https://evil.example/store.json",
          "https://evil.example/logo.png",
          "https://evil.example/banner.png",
          "Attacker Location",
          0,
          "attacker@example.com",
          true
        )
        .accounts({
          merchantProfile,
          authority: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();
    }
  );

  // Verify store wasn't changed
  const merchantAfterAttack =
    await solzaar.account.merchantProfile.fetch(
      merchantProfile
    );

  if (
    merchantAfterAttack.storeName ===
    merchantData.storeName
  ) {
    ok("Merchant data unchanged after attack");
  } else {
    fail(
      "Merchant data changed after unauthorized attack"
    );
  }

  // ==========================================================
  // CREATE PRODUCT
  // ==========================================================

  section("5. Create product");

  await mustPass(
    "Merchant can create product",
    async () => {
      return await solzaar.methods
        .createProduct(
          PRODUCT_ID,
          "Security Test Product",
          "https://example.com/product.json",
          [
            "https://example.com/1.jpg",
            "https://example.com/2.jpg",
          ],
          "Testing",
          new BN(100_000_000),
          10
        )
        .accounts({
          merchantProfile,
          product,
          authority: merchant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    }
  );

  const productAccount =
    await solzaar.account.product.fetch(product);

  console.log(
    "  product:",
    productAccount.title
  );

  console.log(
    "  stock:",
    productAccount.stock
  );

  // ==========================================================
  // DUPLICATE PRODUCT
  // ==========================================================

  section("6. Duplicate product ID");

  await mustFail(
    "Same merchant cannot reuse product ID",
    async () => {
      return await solzaar.methods
        .createProduct(
          PRODUCT_ID,
          "Duplicate Product",
          "https://example.com/product2.json",
          ["https://example.com/1.jpg"],
          "Testing",
          new BN(100_000_000),
          5
        )
        .accounts({
          merchantProfile,
          product,
          authority: merchant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    }
  );

  // ==========================================================
  // ATTACKER UPDATE PRODUCT
  // ==========================================================

  section("7. Unauthorized product update");

  await mustFail(
    "Attacker cannot update merchant's product",
    async () => {
      return await solzaar.methods
        .updateProduct(
          "HACKED PRODUCT",
          "https://evil.example/product.json",
          ["https://evil.example/hacked.jpg"],
          "Hacked",
          new BN(1),
          999999,
          true
        )
        .accounts({
          product,
          authority: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();
    }
  );

  const productAfterAttack =
    await solzaar.account.product.fetch(product);

  if (
    productAfterAttack.title ===
    "Security Test Product"
  ) {
    ok("Product unchanged after attack");
  } else {
    fail(
      "Unauthorized attacker changed product"
    );
  }

  // ==========================================================
  // ATTACKER DELETE PRODUCT
  // ==========================================================

  section("8. Unauthorized product delete");

  await mustFail(
    "Attacker cannot delete merchant's product",
    async () => {
      return await solzaar.methods
        .deleteProduct()
        .accounts({
          product,
          authority: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();
    }
  );

  // ==========================================================
  // INVALID PRICE
  // ==========================================================

  section("9. Zero-price product");

  const ZERO_PRICE_ID = new BN(2001);

  const zeroPriceProduct = productPda(
    merchant.publicKey,
    ZERO_PRICE_ID
  );

  await mustFail(
    "Product with price = 0 is rejected",
    async () => {
      return await solzaar.methods
        .createProduct(
          ZERO_PRICE_ID,
          "Free Exploit Product",
          "https://example.com/free.json",
          ["https://example.com/free.jpg"],
          "Testing",
          new BN(0),
          10
        )
        .accounts({
          merchantProfile,
          product: zeroPriceProduct,
          authority: merchant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    }
  );

  // ==========================================================
  // TOO MANY IMAGES
  // ==========================================================

  section("10. Image-count validation");

  const TOO_MANY_IMAGES_ID = new BN(2002);

  const tooManyImagesProduct = productPda(
    merchant.publicKey,
    TOO_MANY_IMAGES_ID
  );

  await mustFail(
    "More than 3 product images is rejected",
    async () => {
      return await solzaar.methods
        .createProduct(
          TOO_MANY_IMAGES_ID,
          "Image Attack",
          "https://example.com/product.json",
          [
            "https://example.com/1.jpg",
            "https://example.com/2.jpg",
            "https://example.com/3.jpg",
            "https://example.com/4.jpg",
          ],
          "Testing",
          new BN(100_000_000),
          10
        )
        .accounts({
          merchantProfile,
          product: tooManyImagesProduct,
          authority: merchant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    }
  );

  // ==========================================================
  // EMPTY IMAGE URI
  // ==========================================================

  section("11. Empty image URI");

  const EMPTY_IMAGE_ID = new BN(2003);

  const emptyImageProduct = productPda(
    merchant.publicKey,
    EMPTY_IMAGE_ID
  );

  await mustFail(
    "Empty product image URL is rejected",
    async () => {
      return await solzaar.methods
        .createProduct(
          EMPTY_IMAGE_ID,
          "Empty Image Test",
          "https://example.com/product.json",
          [""],
          "Testing",
          new BN(100_000_000),
          10
        )
        .accounts({
          merchantProfile,
          product: emptyImageProduct,
          authority: merchant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    }
  );

  // ==========================================================
  // INACTIVE MERCHANT
  // ==========================================================

  section("12. Inactive merchant");

  await mustPass(
    "Merchant can deactivate own store",
    async () => {
      return await solzaar.methods
        .updateMerchant(
          merchantData.storeName,
          merchantData.descriptionUri,
          merchantData.logoUri,
          merchantData.bannerUri,
          merchantData.shipsFrom,
          merchantData.sellerDepositBps,
          merchantData.preferredContact,
          false
        )
        .accounts({
          merchantProfile,
          authority: merchant.publicKey,
        })
        .signers([merchant])
        .rpc();
    }
  );

  const INACTIVE_PRODUCT_ID = new BN(2004);

  const inactiveProduct = productPda(
    merchant.publicKey,
    INACTIVE_PRODUCT_ID
  );

  await mustFail(
    "Inactive merchant cannot create product",
    async () => {
      return await solzaar.methods
        .createProduct(
          INACTIVE_PRODUCT_ID,
          "Should Not Exist",
          "https://example.com/no.json",
          ["https://example.com/no.jpg"],
          "Testing",
          new BN(100_000_000),
          5
        )
        .accounts({
          merchantProfile,
          product: inactiveProduct,
          authority: merchant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    }
  );

  // Reactivate
  await mustPass(
    "Merchant can reactivate store",
    async () => {
      return await solzaar.methods
        .updateMerchant(
          merchantData.storeName,
          merchantData.descriptionUri,
          merchantData.logoUri,
          merchantData.bannerUri,
          merchantData.shipsFrom,
          merchantData.sellerDepositBps,
          merchantData.preferredContact,
          true
        )
        .accounts({
          merchantProfile,
          authority: merchant.publicKey,
        })
        .signers([merchant])
        .rpc();
    }
  );

  // ==========================================================
  // REPUTATION
  // ==========================================================

  section("13. Reputation initialization");

  await mustPass(
    "Reputation account can initialize",
    async () => {
      return await solzaar.methods
        .initializeReputation()
        .accounts({
          merchantProfile,
          reputation,
          payer: payerKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
  );

  const reputationAccount =
    await solzaar.account.merchantReputation.fetch(
      reputation
    );

  console.log(
    "  reviews:",
    reputationAccount.totalReviews.toString()
  );

  console.log(
    "  rating total:",
    reputationAccount.totalRating.toString()
  );

  // ==========================================================
  // DUPLICATE REPUTATION
  // ==========================================================

  section("14. Duplicate reputation");

  await mustFail(
    "Same merchant cannot initialize reputation twice",
    async () => {
      return await solzaar.methods
        .initializeReputation()
        .accounts({
          merchantProfile,
          reputation,
          payer: payerKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
  );

  // ==========================================================
  // FINAL STATE
  // ==========================================================

  section("FINAL STATE");

  const finalMerchant =
    await solzaar.account.merchantProfile.fetch(
      merchantProfile
    );

  const finalProduct =
    await solzaar.account.product.fetch(
      product
    );

  console.log(
    "Merchant:",
    finalMerchant.storeName
  );

  console.log(
    "Merchant authority:",
    finalMerchant.authority.toBase58()
  );

  console.log(
    "Merchant active:",
    finalMerchant.active
  );

  console.log(
    "Product:",
    finalProduct.title
  );

  console.log(
    "Product price:",
    finalProduct.price.toString()
  );

  console.log(
    "Product stock:",
    finalProduct.stock
  );

  section("DONE");

  console.log(
    "First SolBazaar non-escrow security test batch completed."
  );
}

// ============================================================
// RUN
// ============================================================

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nFATAL ERROR:");
    console.error(err);
    process.exit(1);
  });

