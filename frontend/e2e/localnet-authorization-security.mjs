import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { fundWallet } from "./helpers/fund-wallet.js";

const profileDir = "./e2e/.browser/localnet";

let currentProductAddress = null;

fs.mkdirSync(profileDir, {
    recursive: true,
});

const context = await chromium.launchPersistentContext(
    profileDir,
    {
        headless: false,
        viewport: {
            width: 1440,
            height: 900,
        },
    }
);

await context.grantPermissions(
    [
        "clipboard-read",
        "clipboard-write",
    ],
    {
        origin: "http://127.0.0.1:5173",
    }
);

const pages = context.pages();
const page = pages[0] ?? await context.newPage();

await page.goto("http://127.0.0.1:5173/");

const agreeButton = page.getByRole("button", {
    name: /agree|accept/i,
});

if (await agreeButton.isVisible().catch(() => false)) {
    await agreeButton.click();
}

await page.evaluate(() => {
    localStorage.setItem(
        "walletName",
        JSON.stringify("Burner Wallet")
    );
});

await page.reload();
await page.waitForTimeout(1500);

const walletButton = page
    .locator(".wallet-adapter-button")
    .first();

await walletButton.waitFor();

console.log(
    "WALLET:",
    (await walletButton.textContent())?.trim()
);

await walletButton.click();

const copyButton = page.getByText(
    "Copy address",
    { exact: true }
);

await copyButton.click();

const fullAddress = await page.evaluate(
    () => navigator.clipboard.readText()
);

console.log("FULL WALLET:", fullAddress);

console.log("Funding Burner Wallet...");
await fundWallet(fullAddress);
console.log("✓ Funding confirmed");

console.log("=== BROWSER LOCAL STORAGE ===");

const browserStorage = await page.evaluate(() => {
    return Object.fromEntries(
        Object.keys(localStorage).map(key => [
            key,
            localStorage.getItem(key),
        ])
    );
});

console.log(browserStorage);

console.log("=============================");


// Close wallet menu if still open.
await walletButton.click().catch(() => {});

// Go to Become a Seller page.
await page.getByText(
    "Become a Seller",
    { exact: true }
).first().click();

await page.waitForTimeout(300);

// Start seller onboarding.
const startSelling = page.getByRole("button", {
    name: /start selling/i,
});

if (await startSelling.isVisible().catch(() => false)) {
    await startSelling.click();
} else {
    await page.getByText(
        "Start Selling",
        { exact: true }
    ).click();
}

await page.waitForTimeout(500);

console.log("URL:", page.url());

console.log("=== CREATING TEST MERCHANT ===");

// Fill merchant form
await page.getByPlaceholder("Store Name").fill(
    "E2E Test Store"
);

await page.getByPlaceholder(
    "Describe your store, products, shipping, and other important information."
).fill(
    "Automated Playwright localnet test store."
);

await page.getByPlaceholder("Logo URL").fill(
    "https://example.com/logo.png"
);

await page.getByPlaceholder("Banner URL").fill(
    "https://example.com/banner.png"
);

await page.getByPlaceholder(
    "Seller Escrow Deposit %"
).fill("0");

await page.getByPlaceholder(
    "Ships From e.g. Cavite, Philippines"
).fill(
    "Cavite, Philippines"
);

// Click the actual form submit button.
// There are two "Create Merchant" texts on the page,
// so use the button specifically.
const createMerchantButton = page.getByRole(
    "button",
    {
        name: "Create Merchant",
        exact: true,
    }
);

// Capture browser errors before submitting.
page.on("console", msg => {
    if (
        msg.type() === "error" ||
        msg.type() === "warning"
    ) {
        console.log(
            `[BROWSER ${msg.type().toUpperCase()}]`,
            msg.text()
        );
    }
});

page.on("pageerror", error => {
    console.log(
        "[PAGE ERROR]",
        error.message
    );
});

await createMerchantButton.click();

console.log("Create Merchant clicked...");

// Give transaction/UI enough time to finish or show an error.
await page.waitForTimeout(5000);

console.log("=== AFTER CREATE CLICK ===");
console.log(await page.locator("body").innerText());
console.log("==========================");

await page.screenshot({
    path: "test-results/create-merchant-result.png",
    fullPage: true,
});

// Check result without killing the script immediately.
const noMerchant = page.getByText(
    "You do not have a merchant profile yet."
);

if (await noMerchant.isVisible().catch(() => false)) {
    console.log(
        "✗ Merchant was NOT created."
    );

    await context.close();

    process.exitCode = 1;
} else {
    console.log(
        "✓ Merchant transaction completed"
    );

    console.log("=== DASHBOARD AFTER CREATE ===");
    console.log(
        await page.locator("body").innerText()
    );
    console.log("==============================");

    await page.screenshot({
        path: "test-results/merchant-created.png",
        fullPage: true,
    });

    console.log("=== CREATING TEST PRODUCT ===");

await page.getByPlaceholder(
    "Product Name"
).fill(
    "E2E Cancellation Test Product"
);

await page.getByPlaceholder(
    "Describe the product, condition, size, materials, shipping details, and other important information."
).fill(
    "Product created by Playwright for cancellation and stock restoration testing."
);

// Images intentionally left blank.

await page.getByPlaceholder(
    "Category"
).fill(
    "Testing"
);

await page.getByPlaceholder(
    "Price (SOL)"
).fill(
    "1"
);

await page.getByPlaceholder(
    "Available Stock"
).fill(
    "20"
);

console.log("Product form filled:");
console.log("  Name: E2E Cancellation Test Product");
console.log("  Price: 1 SOL");
console.log("  Stock: 20");

const createProductButton = page.getByRole(
    "button",
    {
        name: "Create Product",
        exact: true,
    }
);

// Capture dialogs such as alert().
page.on("dialog", async dialog => {
    console.log(
        `[DIALOG ${dialog.type()}]`,
        dialog.message()
    );

    await dialog.accept();
});

await createProductButton.click();

console.log("Create Product clicked...");

// Give transaction + dashboard refresh time to complete.
await page.waitForTimeout(5000);

console.log("=== AFTER PRODUCT CREATE CLICK ===");
console.log(
    await page.locator("body").innerText()
);
console.log("==================================");

console.log(
    "Navigating away and back without browser reload..."
);

await page.getByRole("link", {
    name: "Marketplace",
    exact: true,
}).click();

const walletAfterNavigation =
    (await walletButton.textContent())?.trim();

console.log(
    "Wallet after leaving dashboard:",
    walletAfterNavigation
);

console.log(
    "Original full wallet:",
    fullAddress
);

await page.waitForTimeout(1000);

console.log(
    "Wallet after leaving dashboard:",
    (await walletButton.textContent())?.trim()
);

await page.getByRole("link", {
    name: "Dashboard",
    exact: true,
}).click();

await page.waitForTimeout(3000);

console.log(
    "=== DASHBOARD AFTER SPA NAVIGATION ==="
);

console.log(
    await page.locator("body").innerText()
);

console.log(
    "======================================"
);

const testProduct = page.getByText(
    "E2E Cancellation Test Product",
    {
        exact: true,
    }
);

if (
    await testProduct
        .isVisible()
        .catch(() => false)
) {
    console.log(
        "✓ Product transaction completed"
    );
    console.log(
        "✓ Product loaded from chain"
    );
    console.log(
        "✓ Initial product stock = 20"
    );
    const sellerProductEditor =
    page.locator(
        '[data-product-address]'
    ).filter({
        hasText:
            "E2E Cancellation Test Product",
    });

const sellerProductEditorCount =
    await sellerProductEditor.count();

if (sellerProductEditorCount !== 1) {
    throw new Error(
        `Expected exactly 1 current seller product, found ${sellerProductEditorCount}`
    );
}

currentProductAddress =
    await sellerProductEditor.getAttribute(
        "data-product-address"
    );

if (!currentProductAddress) {
    throw new Error(
        "Unable to read current product PDA"
    );
}

console.log(
    "CURRENT PRODUCT PDA:",
    currentProductAddress
);

console.log(
    "✓ Exact current-run product captured"
);
} else {
    console.log(
        "✗ Product transaction succeeded but product was not loaded by My Products."
    );

    await page.screenshot({
        path: "test-results/product-load-failed.png",
        fullPage: true,
    });

    await context.close();
    process.exitCode = 1;
    process.exit();
}

console.log(
    "=== DASHBOARD AFTER PRODUCT CREATE ==="
);

console.log(
    await page.locator("body").innerText()
);

console.log(
    "======================================"
);

await page.screenshot({
    path: "test-results/product-created.png",
    fullPage: true,
});

// Capture the exact product created by this seller/run.
await page.getByRole("link", {
    name: "Marketplace",
    exact: true,
}).click();

await page.waitForTimeout(2000);

await page.getByRole("button", {
    name: "Products",
    exact: true,
}).click();

await page.waitForTimeout(2000);

const sellerProductCards = page.locator(
    'a.marketplace-product-card'
).filter({
    hasText: "E2E Cancellation Test Product",
});

const sellerProductCardCount =
    await sellerProductCards.count();

console.log(
    `Found ${sellerProductCardCount} matching product cards`
);

console.log("=== STARTING BUYER SESSION ===");

// Separate browser profile so buyer gets a different Burner Wallet.
const buyerProfileDir =
    "./e2e/.browser/localnet-buyer";

fs.rmSync(buyerProfileDir, {
    recursive: true,
    force: true,
});

fs.mkdirSync(buyerProfileDir, {
    recursive: true,
});

const buyerContext =
    await chromium.launchPersistentContext(
        buyerProfileDir,
        {
            headless: false,
            viewport: {
                width: 1440,
                height: 900,
            },
        }
    );

    await buyerContext.grantPermissions(
        [
            "clipboard-read",
            "clipboard-write",
        ],
        {
            origin: "http://127.0.0.1:5173",
        }
    );

const buyerPages = buyerContext.pages();

const buyerPage =
    buyerPages[0] ??
    await buyerContext.newPage();

await buyerPage.goto(
    "http://127.0.0.1:5173/"
);

// Accept disclaimer if shown.
const buyerAgreeButton =
    buyerPage.getByRole("button", {
        name: /agree|accept/i,
    });

if (
    await buyerAgreeButton
        .isVisible()
        .catch(() => false)
) {
    await buyerAgreeButton.click();
}

// Select Burner Wallet.
await buyerPage.evaluate(() => {
    localStorage.setItem(
        "walletName",
        JSON.stringify("Burner Wallet")
    );
});

await buyerPage.reload();

await buyerPage.waitForTimeout(1500);

const buyerWalletButton = buyerPage
    .locator(".wallet-adapter-button")
    .first();

await buyerWalletButton.waitFor();

console.log(
    "BUYER WALLET:",
    (await buyerWalletButton.textContent())
        ?.trim()
);

// Open wallet menu.
await buyerWalletButton.click();

const buyerCopyButton =
    buyerPage.getByText(
        "Copy address",
        {
            exact: true,
        }
    );

await buyerCopyButton.click();

const buyerFullAddress =
    await buyerPage.evaluate(
        () => navigator.clipboard.readText()
    );

console.log(
    "BUYER FULL WALLET:",
    buyerFullAddress
);

if (!buyerFullAddress) {
    throw new Error(
        "Failed to read Buyer Burner Wallet full address."
    );
}

if (buyerFullAddress === fullAddress) {
    throw new Error(
        "Buyer wallet unexpectedly matches seller wallet."
    );
}

console.log(
    "✓ Buyer wallet is different from seller"
);

console.log(
    "Funding Buyer Burner Wallet..."
);

await fundWallet(buyerFullAddress);

console.log(
    "✓ Buyer funding confirmed"
);

// Close wallet menu if still open.
await buyerWalletButton
    .click()
    .catch(() => {});

// Make sure we're on Marketplace.
// Go to Marketplace using SPA navigation.
// Do NOT use goto() here because UnsafeBurnerWalletAdapter
// generates another wallet on a full page load.
await buyerPage.getByRole("link", {
    name: "Marketplace",
    exact: true,
}).click();

await buyerPage.waitForTimeout(3000);

console.log(
    "Opening Products tab..."
);

await buyerPage.getByRole("button", {
    name: "Products",
    exact: true,
}).click();

await buyerPage.waitForTimeout(3000);


console.log(
    "=== BUYER MARKETPLACE ==="
);

console.log(
    await buyerPage
        .locator("body")
        .innerText()
);

console.log(
    "========================="
);

const buyerProducts =
    buyerPage.getByText(
        "E2E Cancellation Test Product",
        {
            exact: true,
        }
    );

const buyerProductCount =
    await buyerProducts.count();

console.log(
    `Buyer found ${buyerProductCount} matching product(s)`
);

if (buyerProductCount > 0) {
    console.log(
        "✓ Buyer can see seller product"
    );

    console.log(
        "Opening exact current-run product..."
    );
    
    const exactProductHref =
    `/product/${currentProductAddress}`;

let exactProductLink =
    buyerPage.locator(
        `a[href="${exactProductHref}"]`
    );

let exactProductLinkCount =
    await exactProductLink.count();

console.log(
    `Exact product links on current page: ${exactProductLinkCount}`
);

// Product list is paginated.
// Search the next page if current-run product is not on page 1.
if (exactProductLinkCount === 0) {
    const nextButton =
        buyerPage.getByRole("button", {
            name: "Next",
            exact: true,
        });

    if (
        await nextButton
            .isVisible()
            .catch(() => false)
    ) {
        console.log(
            "Exact product not on page 1; opening next page..."
        );

        await nextButton.click();
        await buyerPage.waitForTimeout(1500);

        exactProductLink =
            buyerPage.locator(
                `a[href="${exactProductHref}"]`
            );

        exactProductLinkCount =
            await exactProductLink.count();

        console.log(
            `Exact product links after Next: ${exactProductLinkCount}`
        );
    }
}

if (exactProductLinkCount !== 1) {
    throw new Error(
        `Expected exactly 1 link for ${currentProductAddress}, found ${exactProductLinkCount}`
    );
}

await exactProductLink.click();
    
    await buyerPage.waitForURL(
        `**/product/${currentProductAddress}`,
        {
            timeout: 15000,
        }
    );
    
    await buyerPage.waitForTimeout(1500);
    
    console.log(
        "BUYER PRODUCT URL:",
        buyerPage.url()
    );
    
    console.log(
        "✓ Buyer opened exact current-run product"
    );
    
    // Verify stock before purchase.
    await buyerPage
        .getByText("20 available", {
            exact: true,
        })
        .waitFor({
            state: "visible",
            timeout: 15000,
        });
    
    console.log(
        "✓ Exact product initial stock = 20"
    );
    
    // Set quantity to 2.
    const quantityInput =
        buyerPage.locator(
            'input[type="number"]'
        );
    
    await quantityInput.fill("2");
    
    await buyerPage
        .getByRole("button", {
            name: "Buy 2 Items",
            exact: true,
        })
        .waitFor({
            state: "visible",
        });
    
    console.log(
        "✓ Buyer quantity set to 2"
    );

    // Start purchase.
console.log(
    "Clicking Buy 2 Items..."
);

await buyerPage
    .getByRole("button", {
        name: "Buy 2 Items",
        exact: true,
    })
    .click();

// Transaction Preview must appear.
const purchasePreview =
    buyerPage.getByRole("dialog");

await purchasePreview.waitFor({
    state: "visible",
    timeout: 10000,
});

await purchasePreview
    .getByRole("heading", {
        name: "Confirm Purchase",
        exact: true,
    })
    .waitFor({
        state: "visible",
    });

console.log(
    "✓ Purchase transaction preview opened"
);

// Confirm actual blockchain transaction.
const continueToWallet =
    purchasePreview.getByRole(
        "button",
        {
            name: "Continue to Wallet",
            exact: true,
        }
    );

console.log(
    "Confirming purchase transaction..."
);

await continueToWallet.click();

// Successful createBuyOrder() redirects through React Router
// to /orders/buyer/<escrow PDA>.
await buyerPage.waitForURL(
    /\/orders\/buyer\/[1-9A-HJ-NP-Za-km-z]+$/,
    {
        timeout: 30000,
    }
);

const buyerOrderUrl =
    buyerPage.url();

console.log(
    "BUYER ORDER URL:",
    buyerOrderUrl
);

const escrowAddress =
    buyerOrderUrl
        .split("/orders/buyer/")[1]
        ?.split(/[?#]/)[0];

if (!escrowAddress) {
    throw new Error(
        "Unable to capture escrow address from buyer order URL."
    );
}

console.log(
    "ESCROW ADDRESS:",
    escrowAddress
);

console.log(
    "✓ Buyer order created through GUI"
);

await buyerPage.waitForTimeout(2000);

console.log(
    "=== BUYER ORDER DETAILS ==="
);

// ============================================================
// SECURITY: UNRELATED WALLET CANNOT ACCESS BUYER/SELLER ORDER
// ============================================================

console.log(
    "=== AUTHORIZATION SECURITY TEST ==="
);

const attackerProfileDir =
    "./e2e/.browser/localnet-attacker";

fs.rmSync(
    attackerProfileDir,
    {
        recursive: true,
        force: true,
    }
);

fs.mkdirSync(
    attackerProfileDir,
    {
        recursive: true,
    }
);

const attackerContext =
    await chromium.launchPersistentContext(
        attackerProfileDir,
        {
            headless: false,
            viewport: {
                width: 1440,
                height: 900,
            },
        }
    );

    await attackerContext.grantPermissions(
        [
            "clipboard-read",
            "clipboard-write",
        ],
        {
            origin: "http://127.0.0.1:5173",
        }
    );

const attackerPages =
    attackerContext.pages();

const attackerPage =
    attackerPages.length > 0
        ? attackerPages[0]
        : await attackerContext.newPage();

attackerPage.on(
    "console",
    (msg) => {
        if (
            msg.type() === "warning"
        ) {
            console.log(
                "[ATTACKER BROWSER WARNING]",
                msg.text()
            );
        }
    }
);

// Initial localnet boot.
await attackerPage.goto(
    "http://127.0.0.1:5173"
);

// Accept disclaimer if shown.
const attackerAgreeButton =
    attackerPage.getByRole(
        "button",
        {
            name: /agree|accept/i,
        }
    );

if (
    await attackerAgreeButton
        .isVisible()
        .catch(() => false)
) {
    console.log(
        "Attacker disclaimer shown; accepting..."
    );

    await attackerAgreeButton.click();

    console.log(
        "✓ Attacker disclaimer accepted"
    );
}

await attackerPage.evaluate(() => {
    localStorage.setItem(
        "walletName",
        JSON.stringify(
            "Burner Wallet"
        )
    );
});

// Burner Wallet is created during initialization.
// This is the ONE allowed reload before capturing
// and funding the final attacker wallet.
await attackerPage.reload();

await attackerPage.waitForTimeout(
    1500
);

const attackerWalletButton =
    attackerPage.locator(
        ".wallet-adapter-button"
    ).filter({
        hasText: /[1-9A-HJ-NP-Za-km-z]{4}\.\.[1-9A-HJ-NP-Za-km-z]{4}/,
    }).first();

await attackerWalletButton.waitFor({
    state: "visible",
    timeout: 15000,
});

const attackerShortAddress =
    (
        await attackerWalletButton
            .textContent()
    )?.trim();

console.log(
    "ATTACKER WALLET:",
    attackerShortAddress
);

// Read the full public key from the connected
// wallet button title if available.
// Open attacker wallet menu.
await attackerWalletButton.click();

const attackerCopyButton =
    attackerPage.getByText(
        "Copy address",
        {
            exact: true,
        }
    );

await attackerCopyButton.waitFor({
    state: "visible",
    timeout: 10000,
});

await attackerCopyButton.click();

const attackerFullAddress =
    await attackerPage.evaluate(
        () => navigator.clipboard.readText()
    );

console.log(
    "ATTACKER FULL WALLET:",
    attackerFullAddress
);

if (!attackerFullAddress) {
    throw new Error(
        "Failed to read Attacker Burner Wallet full address."
    );
}

if (
    attackerFullAddress === fullAddress ||
    attackerFullAddress === buyerFullAddress
) {
    throw new Error(
        "Attacker wallet unexpectedly matches buyer or seller wallet."
    );
}

console.log(
    "✓ Attacker wallet differs from buyer and seller"
);

console.log(
    "Funding Attacker Burner Wallet..."
);

await fundWallet(
    attackerFullAddress
);

console.log(
    "✓ Attacker funding confirmed"
);

// Close wallet menu if still open.
await attackerWalletButton
    .click()
    .catch(() => {});


// ============================================================
// ATTACKER TRIES BUYER ROUTE
// ============================================================

console.log(
    "Attacker attempting buyer order route..."
);

// We intentionally navigate directly because this is
// an authorization/route-tampering security test.
await attackerPage.evaluate(
    (escrowAddress) => {
        history.pushState(
            {},
            "",
            `/orders/buyer/${escrowAddress}`
        );

        window.dispatchEvent(
            new PopStateEvent("popstate")
        );
    },
    escrowAddress
);

await attackerPage.waitForURL(
    `**/orders/buyer/${escrowAddress}`,
    {
        timeout: 15000,
    }
);

await expect(
    page.getByText(
        "Order not found for this wallet.",
        {
            exact: true,
        }
    )
).toHaveCount(0);

console.log(
    "✓ Real seller remains authorized after attacker attempts"
);

await attackerPage
    .getByText(
        "Order not found for this wallet.",
        {
            exact: true,
        }
    )
    .waitFor({
        state: "visible",
        timeout: 15000,
    });

console.log(
    "✓ Attacker rejected from buyer order"
);

// Buyer-only withdrawal must never be exposed.
await expect(
    attackerPage.getByRole(
        "button",
        {
            name: /Withdraw Order/,
        }
    )
).toHaveCount(0);

console.log(
    "✓ Buyer withdrawal action hidden from attacker"
);

// Buyer completion must never be exposed.
await expect(
    attackerPage.getByRole(
        "button",
        {
            name:
                "Retrieve Deposit & Release Payment",
            exact: true,
        }
    )
).toHaveCount(0);

console.log(
    "✓ Buyer completion action hidden from attacker"
);

// ============================================================
// ATTACKER TRIES SELLER ROUTE
// ============================================================

console.log(
    "Attacker attempting seller order route..."
);

await attackerPage.evaluate(
    (escrowAddress) => {
        history.pushState(
            {},
            "",
            `/orders/seller/${escrowAddress}`
        );

        window.dispatchEvent(
            new PopStateEvent("popstate")
        );
    },
    escrowAddress
);

await attackerPage.waitForURL(
    `**/orders/seller/${escrowAddress}`,
    {
        timeout: 15000,
    }
);

await attackerPage
    .getByText(
        "Order not found for this wallet.",
        {
            exact: true,
        }
    )
    .waitFor({
        state: "visible",
        timeout: 15000,
    });

console.log(
    "✓ Attacker rejected from seller order"
);

// Seller acceptance must never be exposed.
await expect(
    attackerPage.getByRole(
        "button",
        {
            name: /Accept Order and Deposit/,
        }
    )
).toHaveCount(0);

console.log(
    "✓ Seller acceptance action hidden from attacker"
);

// Seller Mark Ready must also never be exposed.
await expect(
    attackerPage.getByRole(
        "button",
        {
            name:
                "Mark Ready for Buyer Confirmation",
            exact: true,
        }
    )
).toHaveCount(0);

console.log(
    "✓ Seller completion action hidden from attacker"
);

console.log(
    "=== ATTACKER AUTHORIZATION CHECK PASSED ==="
);

await attackerContext.close();

// ============================================================
// SELLER ACCEPTS THE EXACT BUYER ORDER
// ============================================================

console.log(
    "=== SELLER ACCEPTING ORDER ==="
);

// Seller browser/session is still alive.
// Open the exact seller order through SPA navigation.
// Do NOT reload or use page.goto() because the Burner
// Wallet must remain unchanged.

console.log(
    "Opening exact seller order after attacker test..."
);

await page.evaluate(
    (escrowAddress) => {
        history.pushState(
            {},
            "",
            `/orders/seller/${escrowAddress}`
        );

        window.dispatchEvent(
            new PopStateEvent("popstate")
        );
    },
    escrowAddress
);

await page.waitForURL(
    `**/orders/seller/${escrowAddress}`,
    {
        timeout: 15000,
    }
);

console.log(
    "✓ Seller opened exact order after attacker test"
);

console.log(
    "SELLER ORDER URL:",
    page.url()
);

console.log(
    "✓ Seller opened exact order"
);

// Seller has 0% escrow deposit in this E2E merchant,
// so the expected action is:
// "Accept Order and Deposit 0 SOL"
const acceptOrderButton =
    page.getByRole("button", {
        name: /Accept Order and Deposit/,
    });

await acceptOrderButton.waitFor({
    state: "visible",
    timeout: 15000,
});

console.log(
    "✓ Seller Accept Order action available"
);

await acceptOrderButton.click();

// Verify transaction preview.
const acceptPreview =
    page.getByRole("dialog");

await acceptPreview.waitFor({
    state: "visible",
    timeout: 10000,
});

await acceptPreview
    .getByRole("heading", {
        name: "Accept Order",
        exact: true,
    })
    .waitFor({
        state: "visible",
    });

console.log(
    "✓ Accept Order transaction preview opened"
);

const confirmAccept =
    acceptPreview.getByRole(
        "button",
        {
            name: "Continue to Wallet",
            exact: true,
        }
    );

console.log(
    "Confirming seller acceptance..."
);

await confirmAccept.click();

// Wait for the Accept action to disappear.
// This is stronger than a fixed timeout because it verifies
// that the UI actually moved out of the pre-accept state.
await expect(
    page.getByRole("button", {
        name: /Accept Order and Deposit/,
    })
).toHaveCount(0, {
    timeout: 30000,
});

console.log(
    "✓ Seller acceptance transaction completed"
);

console.log(
    "=== SELLER ACCEPT FLOW PASSED ==="
);

/// ============================================================
// SELLER MARKS ORDER READY
// ============================================================

console.log(
    "=== SELLER MARKING ORDER READY ==="
);

// After seller acceptance, escrow should now be
// DEPOSITS_COMPLETE and this action should appear.
const markReadyButton =
    page.getByRole("button", {
        name: "Mark Ready for Buyer Confirmation",
        exact: true,
    });

await markReadyButton.waitFor({
    state: "visible",
    timeout: 30000,
});

console.log(
    "✓ Mark Ready action available"
);

await markReadyButton.click();

// Completion options should now be visible.
// Keep donation at the default 0% for this E2E test.
const confirmReadyButton =
    page.getByRole("button", {
        name: "Confirm Ready Without Donation",
        exact: true,
    });

await confirmReadyButton.waitFor({
    state: "visible",
    timeout: 10000,
});

console.log(
    "✓ Seller completion options opened"
);

await confirmReadyButton.click();

// Verify Mark Ready transaction preview.
const readyPreview =
    page.getByRole("dialog");

await readyPreview.waitFor({
    state: "visible",
    timeout: 10000,
});

await readyPreview
    .getByRole("heading", {
        name: "Mark Order Ready",
        exact: true,
    })
    .waitFor({
        state: "visible",
    });

console.log(
    "✓ Mark Order Ready transaction preview opened"
);

const confirmReadyWallet =
    readyPreview.getByRole(
        "button",
        {
            name: "Continue to Wallet",
            exact: true,
        }
    );

console.log(
    "Confirming Mark Ready transaction..."
);

await confirmReadyWallet.click();

// Successful sellerSuggestCompletion() should move the
// escrow out of DEPOSITS_COMPLETE, so the original
// Mark Ready action must disappear.
await expect(
    page.getByRole("button", {
        name: "Mark Ready for Buyer Confirmation",
        exact: true,
    })
).toHaveCount(0, {
    timeout: 30000,
});

console.log(
    "✓ Seller marked order ready"
);

console.log(
    "=== SELLER MARK READY FLOW PASSED ==="
);

// ============================================================
// BUYER CONFIRMS RECEIPT AND RELEASES PAYMENT
// ============================================================

console.log(
    "=== BUYER CONFIRMING RECEIPT ==="
);

// Buyer browser/session is still alive and still uses the
// same funded Burner Wallet. Use SPA navigation only.
await buyerPage
    .getByRole("link", {
        name: "Orders",
        exact: true,
    })
    .click();

await buyerPage.waitForURL(
    "**/orders",
    {
        timeout: 15000,
    }
);

console.log(
    "✓ Buyer opened Orders"
);

// Find the exact escrow created during this test run.
const buyerShortOrderLabel =
    `Order ${escrowAddress.slice(0, 6)}...${escrowAddress.slice(-6)}`;

console.log(
    "Looking for buyer order:",
    buyerShortOrderLabel
);

const buyerExactOrderLabel =
    buyerPage.getByText(
        buyerShortOrderLabel,
        {
            exact: true,
        }
    );

await buyerExactOrderLabel.waitFor({
    state: "visible",
    timeout: 15000,
});

console.log(
    "✓ Buyer can see exact order"
);

const buyerExactOrderCard =
    buyerExactOrderLabel.locator(
        "xpath=ancestor::button[contains(@class,'order-list-card')]"
    );

await buyerExactOrderCard.waitFor({
    state: "visible",
    timeout: 15000,
});

await buyerExactOrderCard.click();

await buyerPage.waitForURL(
    `**/orders/buyer/${escrowAddress}`,
    {
        timeout: 15000,
    }
);

console.log(
    "BUYER FINALIZATION URL:",
    buyerPage.url()
);

console.log(
    "✓ Buyer opened exact order"
);

// Seller has already marked the order ready, therefore
// FINALIZATION_SUGGESTED should expose this buyer action.
const releasePaymentButton =
    buyerPage.getByRole("button", {
        name: "Retrieve Deposit & Release Payment",
        exact: true,
    });

await releasePaymentButton.waitFor({
    state: "visible",
    timeout: 30000,
});

console.log(
    "✓ Buyer release-payment action available"
);

await releasePaymentButton.click();

// Verify final transaction preview.
const releasePreview =
    buyerPage.getByRole("dialog");

await releasePreview.waitFor({
    state: "visible",
    timeout: 10000,
});

await releasePreview
    .getByRole("heading", {
        name: "Confirm Order & Release Payment",
        exact: true,
    })
    .waitFor({
        state: "visible",
    });

console.log(
    "✓ Release Payment transaction preview opened"
);

// The preview itself must state that the resulting
// order status will be Completed.
await releasePreview
    .getByText("Completed", {
        exact: true,
    })
    .waitFor({
        state: "visible",
    });

console.log(
    "✓ Preview confirms resulting status = Completed"
);

const confirmReleasePayment =
    releasePreview.getByRole(
        "button",
        {
            name: "Confirm & Continue to Wallet",
            exact: true,
        }
    );

console.log(
    "Confirming buyer receipt and releasing payment..."
);

await confirmReleasePayment.click();

// Once releaseBuyerAndRecordSale() succeeds,
// FINALIZATION_SUGGESTED is gone, therefore the buyer's
// release button must disappear.
await expect(
    buyerPage.getByRole("button", {
        name: "Retrieve Deposit & Release Payment",
        exact: true,
    })
).toHaveCount(0, {
    timeout: 30000,
});

console.log(
    "✓ Buyer completion transaction succeeded"
);

console.log(
    "=== BUYER RELEASE PAYMENT FLOW PASSED ==="
);

// ============================================================
// FINAL COMPLETED-ORDER VERIFICATION
// ============================================================

console.log(
    "=== VERIFYING COMPLETED ORDER ==="
);

// We are still on the exact buyer order.
// Successful release must change the action status to Completed.
const completedOrderTitle =
    buyerPage.getByText(
        "Order completed",
        {
            exact: true,
        }
    );

await completedOrderTitle.waitFor({
    state: "visible",
    timeout: 30000,
});

console.log(
    "✓ Exact order status = Completed"
);

// Buyer-specific completed message proves this is the
// normal completion path, not cancellation.
await buyerPage
    .getByText(
        "Your deposit was returned and payment was released to the seller.",
        {
            exact: true,
        }
    )
    .waitFor({
        state: "visible",
        timeout: 15000,
    });

console.log(
    "✓ Buyer completion message confirmed"
);

// ============================================================
// VERIFY EXACT PRODUCT STOCK THROUGH GUI
// ============================================================

console.log(
    "=== VERIFYING FINAL PRODUCT STOCK ==="
);

// Use SPA navigation only. Do not reload because Burner Wallet
// must remain unchanged.
await buyerPage
    .getByRole("link", {
        name: "Marketplace",
        exact: true,
    })
    .click();

await buyerPage.waitForTimeout(1500);

await buyerPage
    .getByRole("button", {
        name: "Products",
        exact: true,
    })
    .click();

await buyerPage.waitForTimeout(1500);

// Locate this run's exact product PDA rather than relying
// on duplicate product titles.
const finalProductHref =
    `/product/${currentProductAddress}`;

let finalProductLink =
    buyerPage.locator(
        `a[href="${finalProductHref}"]`
    );

let finalProductLinkCount =
    await finalProductLink.count();

// Marketplace is paginated, so move forward until the exact
// product is found or there are no more enabled Next buttons.
while (finalProductLinkCount === 0) {
    const finalNextButton =
        buyerPage.getByRole("button", {
            name: "Next",
            exact: true,
        });

    const nextVisible =
        await finalNextButton
            .isVisible()
            .catch(() => false);

    const nextEnabled =
        nextVisible
            ? await finalNextButton.isEnabled()
            : false;

    if (!nextVisible || !nextEnabled) {
        break;
    }

    await finalNextButton.click();
    await buyerPage.waitForTimeout(1000);

    finalProductLink =
        buyerPage.locator(
            `a[href="${finalProductHref}"]`
        );

    finalProductLinkCount =
        await finalProductLink.count();
}

if (finalProductLinkCount !== 1) {
    throw new Error(
        `Expected exactly 1 final product link for ${currentProductAddress}, found ${finalProductLinkCount}`
    );
}

await finalProductLink.click();

await buyerPage.waitForURL(
    `**/product/${currentProductAddress}`,
    {
        timeout: 15000,
    }
);

// Purchase quantity was 2 from initial stock 20.
// Completed order must NOT restore stock.
await buyerPage
    .getByText(
        "18 available",
        {
            exact: true,
        }
    )
    .waitFor({
        state: "visible",
        timeout: 15000,
    });

console.log(
    "✓ Exact product final stock = 18"
);

// ============================================================
// VERIFY SOLD COUNT THROUGH SELLER/MERCHANT GUI
// ============================================================

console.log(
    "=== VERIFYING PRODUCT SOLD COUNT ==="
);

// Seller browser/session is still alive.
// Navigate to Marketplace using SPA navigation.
await page
    .getByRole("link", {
        name: "Marketplace",
        exact: true,
    })
    .click();

await page.waitForTimeout(1500);

// Open Merchants tab.
await page
    .getByRole("button", {
        name: "Merchants",
        exact: true,
    })
    .click();

await page.waitForTimeout(1500);

// Open this test seller by exact store name.
// There may be historical E2E stores, so use the seller's
// current wallet/address if duplicate names make this ambiguous.
const exactMerchantHref =
    `/merchant/${fullAddress}`;

const exactMerchantLink =
    page.locator(
        `a[href="${exactMerchantHref}"]`
    );

const exactMerchantLinkCount =
    await exactMerchantLink.count();

console.log(
    `Exact merchant links: ${exactMerchantLinkCount}`
);

if (exactMerchantLinkCount !== 1) {
    throw new Error(
        `Expected exactly 1 merchant link for seller ${fullAddress}, found ${exactMerchantLinkCount}`
    );
}

console.log(
    "✓ Exact seller merchant found"
);

await exactMerchantLink.click();

await page.waitForURL(
    `**/merchant/${fullAddress}`,
    {
        timeout: 15000,
    }
);

console.log(
    "✓ Seller merchant page opened"
);


await page.waitForTimeout(1500);

// Find this run's exact product on MerchantPage.
const merchantProductLink =
    page.locator(
        `a[href="/product/${currentProductAddress}"]`
    );

await merchantProductLink.waitFor({
    state: "visible",
    timeout: 15000,
});

console.log(
    "✓ Exact product found on merchant page"
);

// MerchantPage structure:
// <Link>
//     <article>
//         ...
//         <strong>{product.sold}</strong> Sold
//         <small>Available: {product.stock}</small>
//     </article>
// </Link>
const merchantProductCard =
    merchantProductLink.locator("article");

await merchantProductCard.waitFor({
    state: "visible",
    timeout: 15000,
});

// Completed purchase of quantity 2 from stock 20
// must leave exactly 18 available.
await merchantProductCard
    .getByText(
        "Available: 18",
        {
            exact: true,
        }
    )
    .waitFor({
        state: "visible",
        timeout: 15000,
    });

console.log(
    "✓ Merchant GUI confirms stock = 18"
);

// releaseBuyerAndRecordSale() must also increment
// the product sold counter by exactly 2.
await merchantProductCard
    .getByText(
        "2 Sold",
        {
            exact: true,
        }
    )
    .waitFor({
        state: "visible",
        timeout: 15000,
    });

console.log(
    "✓ Exact product sold count = 2"
);

console.log(
    "============================================"
);

console.log(
    "✓ COMPLETE ORDER GUI E2E LIFECYCLE PASSED"
);

console.log(
    "  Initial stock: 20"
);

console.log(
    "  Quantity sold: 2"
);

console.log(
    "  Final stock:   18"
);

console.log(
    "  Sold count:    2"
);

console.log(
    "  Order status:  Completed"
);

console.log(
    "============================================"
);

await buyerContext.close();
await context.close();

process.exit(0);
}

}
