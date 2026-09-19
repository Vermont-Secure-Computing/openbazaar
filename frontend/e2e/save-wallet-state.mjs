import { chromium } from "@playwright/test";

const browser = await chromium.launch({
    headless: false,
});

const context = await browser.newContext();

const page = await context.newPage();

await page.addInitScript(() => {
    localStorage.setItem(
        "walletName",
        JSON.stringify("Burner Wallet")
    );
});

await page.goto("http://127.0.0.1:5173/");

const agreeButton = page.getByRole("button", {
    name: /agree|accept/i,
});

if (await agreeButton.isVisible().catch(() => false)) {
    await agreeButton.click();
}

await page.waitForTimeout(1500);

const walletButton = page.locator(
    ".wallet-adapter-button"
).first();

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

await context.storageState({
    path: "./e2e/.auth/localnet.json",
});

console.log(
    "✓ Saved Playwright Burner Wallet state"
);

await browser.close();
