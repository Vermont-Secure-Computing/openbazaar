import { program } from "./anchor";

export async function getMerchants() {
    const rawAccounts =
        await program.provider.connection.getProgramAccounts(
            program.programId
        );

    const merchants = [];

    for (const item of rawAccounts) {
        try {
            const merchant = program.coder.accounts.decode(
                "merchantProfile",
                item.account.data
            );

            merchants.push({
                publicKey: item.pubkey.toBase58(),
                authority: merchant.authority.toBase58(),
                storeName: merchant.storeName,
                descriptionUri: merchant.descriptionUri,
                logoUri: merchant.logoUri,
                bannerUri: merchant.bannerUri,
                shipsFrom: merchant.shipsFrom,
                sellerDepositBps: merchant.sellerDepositBps,
                email: merchant.email,
                phone: merchant.phone,
                website: merchant.website,
                facebook: merchant.facebook,
                instagram: merchant.instagram,
                telegram: merchant.telegram,
                x: merchant.x,
                active: merchant.active,
                verified: merchant.verified,
            });
        } catch {
            // ignore old merchant/product accounts
        }
    }

    return merchants.filter((m) => m.active);
}

export async function getMerchantByAuthority(authority) {
    const merchants = await getMerchants();

    return merchants.find(
        (merchant) => merchant.authority === authority
    );
}