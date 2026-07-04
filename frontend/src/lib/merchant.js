import { program } from "./anchor";

export async function getMerchants() {

    const rawAccounts =
        await program.provider.connection.getProgramAccounts(
            program.programId
        );

    const merchants = [];

    for (const item of rawAccounts) {

        try {

            const merchant =
                program.coder.accounts.decode(
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
                location: merchant.location,
                verified: merchant.verified,
                active: merchant.active,
            });

        } catch {}

    }

    return merchants;

}