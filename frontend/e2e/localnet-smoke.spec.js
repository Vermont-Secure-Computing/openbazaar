import { test, expect } from "@playwright/test";

test("SolBazaar localnet loads with Burner Wallet", async ({ page }) => {
    // WalletProvider expects JSON-encoded wallet name.
    await page.addInitScript(() => {
        localStorage.setItem(
            "walletName",
            JSON.stringify("Burner Wallet")
        );
    });

    await page.goto("/");

    // Actual application title.
    await expect(page).toHaveTitle(/SolBazaar/i);

    // Accept disclaimer if it appears.
    const agreeButton = page.getByRole("button", {
        name: /agree|accept/i,
    });

    if (await agreeButton.isVisible().catch(() => false)) {
        console.log("Disclaimer found - clicking Agree...");
        await agreeButton.click();
    }

    // Allow Burner Wallet auto-connect.
    await page.waitForTimeout(1500);

    console.log("PAGE:", await page.title());
    console.log("URL:", page.url());

    await page.screenshot({
        path: "test-results/localnet-home.png",
        fullPage: true,
    });

    const walletButton = page.locator(
        ".wallet-adapter-button"
    ).first();

    await expect(walletButton).toBeVisible();

    const walletText =
        (await walletButton.textContent())?.trim();

        await walletButton.click();

        await page.waitForTimeout(500);
        
        const bodyText = await page.locator("body").innerText();
        
        console.log("=== WALLET MENU ===");
        console.log(bodyText);
        console.log("===================");

    expect(walletText).not.toMatch(
        /connect wallet|select wallet/i
    );

    console.log("✓ Burner Wallet connected");
    console.log("✓ SolBazaar GUI loaded");
});
