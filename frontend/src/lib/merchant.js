import { getReadOnlyProgram } from "./anchor";

export async function getMerchants() {
    const program = getReadOnlyProgram();

    const rawAccounts = await program.provider.connection.getProgramAccounts(
        program.programId
    );

    console.log("Total program accounts:", rawAccounts.length);

    const merchants = [];

    for (const item of rawAccounts) {
        try {
            const merchant = program.coder.accounts.decode(
                    "merchantProfile",
                    item.account.data
                );
            
            console.log("merchant details from getMerchant: ", merchant)
            merchants.push({
                publicKey: item.pubkey.toBase58(),
                authority: merchant.authority.toBase58(),
                storeName: merchant.storeName,
                descriptionUri: merchant.descriptionUri,
                logoUri: merchant.logoUri,
                bannerUri: merchant.bannerUri,
                shipsFrom: merchant.shipsFrom,
                sellerDepositBps: merchant.sellerDepositBps,
                preferredContact: merchant.preferredContact,
                totalSold: Number(merchant.totalSold),
                active: merchant.active,
                verified: merchant.verified,
            });
        } catch (error) {
            console.warn(
                "Skipped incompatible account:",
                item.pubkey.toBase58(),
                "size:",
                item.account.data.length,
                error.message
            );
        }
    }

    console.log("Successfully decoded merchants:", merchants);

    console.table(
        merchants.map((merchant) => ({
            storeName: merchant.storeName,
            active: merchant.active,
        }))
    );
    
    return merchants.filter((merchant) => merchant.active);
}

export async function getMerchantByAuthority(authority) {
    const merchants = await getMerchants();

    return merchants.find(
        merchant => merchant.authority === authority
    );
}