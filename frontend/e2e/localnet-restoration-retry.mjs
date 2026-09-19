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

console.log(
    "Enabling one-shot stock restoration failure..."
);

await buyerPage.evaluate(() => {
    localStorage.setItem(
        "e2e:fail-next-stock-restoration",
        "true"
    );
});

const failureFlag =
    await buyerPage.evaluate(() =>
        localStorage.getItem(
            "e2e:fail-next-stock-restoration"
        )
    );

if (failureFlag !== "true") {
    throw new Error(
        "Unable to enable stock restoration failure hook."
    );
}

console.log(
    "✓ Next stock restoration will intentionally fail"
);

// Buyer withdraws before seller accepts.
console.log(
    "Starting buyer withdrawal..."
);

const withdrawButton =
    buyerPage.getByRole("button", {
        name: /Withdraw Order & Refund/,
    });

await withdrawButton.waitFor({
    state: "visible",
    timeout: 15000,
});

console.log(
    "✓ Withdraw action available before seller acceptance"
);

await withdrawButton.click();

// Withdrawal transaction preview.
const withdrawPreview =
    buyerPage.getByRole("dialog");

await withdrawPreview.waitFor({
    state: "visible",
    timeout: 10000,
});

await withdrawPreview
    .getByRole("heading", {
        name: "Withdraw Order",
        exact: true,
    })
    .waitFor({
        state: "visible",
    });

console.log(
    "✓ Withdraw transaction preview opened"
);

const confirmWithdraw =
    withdrawPreview.getByRole(
        "button",
        {
            name: "Withdraw & Continue to Wallet",
            exact: true,
        }
    );

console.log(
    "Confirming withdrawal..."
);

await confirmWithdraw.click();

await buyerPage.waitForTimeout(5000);

console.log(
    "URL AFTER WITHDRAW:",
    buyerPage.url()
);

console.log(
    "=== AFTER BUYER WITHDRAW ==="
);

console.log(
    await buyerPage
        .locator("body")
        .innerText()
);

console.log(
    "============================"
);

console.log(
    "Verifying exact product stock after cancellation..."
);

// We are currently on /orders.
// Navigate through the SPA only — do not reload.
await buyerPage
    .getByRole("link", {
        name: "Marketplace",
        exact: true,
    })
    .click();

await buyerPage.waitForTimeout(1000);

const productsTabAfterCancel =
    buyerPage.getByRole("button", {
        name: "Products",
        exact: true,
    });

if (
    await productsTabAfterCancel
        .isVisible()
        .catch(() => false)
) {
    await productsTabAfterCancel.click();
}

await buyerPage.waitForTimeout(1500);

const cancelledProductHref =
    `/product/${currentProductAddress}`;

let cancelledProductLink =
    buyerPage.locator(
        `a[href="${cancelledProductHref}"]`
    );

let cancelledProductLinkCount =
    await cancelledProductLink.count();

console.log(
    `Exact cancelled product links on current page: ${cancelledProductLinkCount}`
);

// Handle pagination.
if (cancelledProductLinkCount === 0) {
    const nextButtonAfterCancel =
        buyerPage.getByRole("button", {
            name: "Next",
            exact: true,
        });

    if (
        await nextButtonAfterCancel
            .isVisible()
            .catch(() => false)
    ) {
        console.log(
            "Exact cancelled product not on page 1; opening next page..."
        );

        await nextButtonAfterCancel.click();

        await buyerPage.waitForTimeout(1500);

        cancelledProductLink =
            buyerPage.locator(
                `a[href="${cancelledProductHref}"]`
            );

        cancelledProductLinkCount =
            await cancelledProductLink.count();
    }
}

if (cancelledProductLinkCount !== 1) {
    throw new Error(
        `Unable to find exact cancelled product ${currentProductAddress}`
    );
}

await cancelledProductLink.click();

await buyerPage.waitForURL(
    `**/product/${currentProductAddress}`,
    {
        timeout: 15000,
    }
);

await buyerPage.waitForTimeout(1500);

await buyerPage
    .getByText("18 available", {
        exact: true,
    })
    .waitFor({
        state: "visible",
        timeout: 15000,
    });

console.log(
    "✓ Exact product stock remains 18 after simulated restoration failure"
);

console.log(
    "✓ Cancellation/refund succeeded independently of stock restoration"
);

// Navigate to Orders through SPA.
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

await buyerPage.waitForTimeout(1500);

// UI displays:
// Order 6jCKjj...LJLSSe
const shortOrderLabel =
    `Order ${escrowAddress.slice(0, 6)}...${escrowAddress.slice(-6)}`;

console.log(
    "Looking for exact order:",
    shortOrderLabel
);

const orderLabel =
    buyerPage.getByText(
        shortOrderLabel,
        {
            exact: true,
        }
    );

await orderLabel.waitFor({
    state: "visible",
    timeout: 15000,
});

console.log(
    "✓ Exact cancelled order found"
);


const exactOrderCard =
    orderLabel.locator(
        "xpath=ancestor::button[contains(@class,'order-list-card')]"
    );

await exactOrderCard.waitFor({
    state: "visible",
    timeout: 15000,
});

console.log(
    "✓ Exact cancelled order card located"
);

await exactOrderCard.click();

await buyerPage.waitForURL(
    `**/orders/buyer/${escrowAddress}`,
    {
        timeout: 15000,
    }
);

console.log(
    "CANCELLED ORDER URL:",
    buyerPage.url()
);

console.log(
    "✓ Exact cancelled order opened through GUI"
);

await buyerPage.waitForTimeout(2000);

console.log(
    "=== CANCELLED ORDER DETAILS ==="
);

console.log(
    await buyerPage
        .locator("body")
        .innerText()
);

console.log(
    "==============================="
);

console.log(
    "Starting manual stock restoration retry..."
);

// Confirm we're really in the pending-restoration state.
await buyerPage
    .getByText(
        "Stock restoration is still pending.",
        {
            exact: true,
        }
    )
    .waitFor({
        state: "visible",
        timeout: 15000,
    });

console.log(
    "✓ UI confirms stock restoration is pending"
);

const restoreStockButton =
    buyerPage.getByRole("button", {
        name: "Restore Product Stock",
        exact: true,
    });

await restoreStockButton.waitFor({
    state: "visible",
    timeout: 15000,
});

console.log(
    "✓ Manual Restore Product Stock action available"
);

// The failure flag was one-shot and was removed when
// the automatic restoration intentionally failed.
// This click should now perform the real restoration.
await restoreStockButton.click();

console.log(
    "Restore Product Stock clicked..."
);

// Verify that the restoration receipt is reflected in the UI.
await buyerPage
    .getByText(
        "✓ Reserved product stock has been restored.",
        {
            exact: true,
        }
    )
    .waitFor({
        state: "visible",
        timeout: 30000,
    });

console.log(
    "✓ Manual stock restoration retry succeeded"
);

// A successfully restored order must no longer offer
// another stock-restoration action.
await expect(
    buyerPage.getByRole("button", {
        name: "Restore Product Stock",
        exact: true,
    })
).toHaveCount(0);

console.log(
    "✓ Restore Product Stock action removed after successful restoration"
);

console.log(
    "Verifying final product stock after manual restoration..."
);

// SPA navigation only — do not reload / goto.
await buyerPage
    .getByRole("link", {
        name: "Marketplace",
        exact: true,
    })
    .click();

await buyerPage.waitForTimeout(1000);

const productsTabAfterRestore =
    buyerPage.getByRole("button", {
        name: "Products",
        exact: true,
    });

if (
    await productsTabAfterRestore
        .isVisible()
        .catch(() => false)
) {
    await productsTabAfterRestore.click();
}

await buyerPage.waitForTimeout(1500);

const restoredProductHref =
    `/product/${currentProductAddress}`;

let restoredProductLink =
    buyerPage.locator(
        `a[href="${restoredProductHref}"]`
    );

let restoredProductLinkCount =
    await restoredProductLink.count();

console.log(
    `Exact restored product links on current page: ${restoredProductLinkCount}`
);

// Handle pagination without reloading the browser.
while (restoredProductLinkCount === 0) {
    const nextButton =
        buyerPage.getByRole("button", {
            name: "Next",
            exact: true,
        });

    const nextVisible =
        await nextButton
            .isVisible()
            .catch(() => false);

    const nextDisabled =
        nextVisible
            ? await nextButton.isDisabled()
            : true;

    if (!nextVisible || nextDisabled) {
        break;
    }

    console.log(
        "Exact restored product not on current page; opening next page..."
    );

    await nextButton.click();
    await buyerPage.waitForTimeout(1000);

    restoredProductLink =
        buyerPage.locator(
            `a[href="${restoredProductHref}"]`
        );

    restoredProductLinkCount =
        await restoredProductLink.count();
}

if (restoredProductLinkCount !== 1) {
    throw new Error(
        `Unable to find exact restored product ${currentProductAddress}`
    );
}

await restoredProductLink.click();

await buyerPage.waitForURL(
    `**/product/${currentProductAddress}`,
    {
        timeout: 15000,
    }
);

await buyerPage
    .getByText(
        "20 available",
        {
            exact: true,
        }
    )
    .waitFor({
        state: "visible",
        timeout: 15000,
    });

console.log(
    "✓ Exact product stock restored from 18 → 20"
);

console.log(
    "✓ GUI restoration failure + manual retry lifecycle PASSED"
);

console.log(
    await buyerPage
        .locator("body")
        .innerText()
);

console.log(
    "==========================="
);
} else {
    console.log(
        "✗ Buyer cannot see seller product"
    );

    await buyerPage.screenshot({
        path:
            "test-results/buyer-product-not-found.png",
        fullPage: true,
    });

    await buyerContext.close();
    await context.close();

    process.exitCode = 1;
    process.exit();
}


await buyerPage.screenshot({
    path:
        "test-results/buyer-marketplace.png",
    fullPage: true,
});

console.log(
    "✓ Buyer session ready"
);

}
