import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",

    use: {
        baseURL: "http://127.0.0.1:5173",
        headless: false,

        viewport: {
            width: 1440,
            height: 900,
        },

        // Preserve Burner Wallet localStorage/keypair
        storageState: "./e2e/.auth/localnet.json",
    },

    timeout: 30000,
});
