import {
    AnchorProvider,
    Program,
} from "@coral-xyz/anchor";

import {
    PublicKey,
} from "@solana/web3.js";

import idl from "../idl/sol_bazaar.json";

function getProgram(connection, wallet) {
    const provider = new AnchorProvider(
        connection,
        wallet,
        {
            commitment: "confirmed",
        }
    );

    return new Program(idl, provider);
}

export function getReputationPda(
    merchantAuthority,
    programId
) {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from("reputation"),
            new PublicKey(merchantAuthority).toBuffer(),
        ],
        programId
    )[0];
}

export async function getMerchantReputation({
    connection,
    wallet,
    merchantAuthority,
}) {
    const program = getProgram(connection, wallet);

    const reputationPda = getReputationPda(
        merchantAuthority,
        program.programId
    );

    try {
        const account =
            await program.account.merchantReputation.fetch(
                reputationPda
            );

        const totalReviews = Number(
            account.totalReviews
        );

        const totalRating = Number(
            account.totalRating
        );

        return {
            publicKey:
                reputationPda.toBase58(),

            merchant:
                account.merchant.toBase58(),

            totalReviews,

            totalRating,

            average:
                totalReviews === 0
                    ? 0
                    : totalRating / totalReviews,

            fiveStar: Number(account.fiveStar),
            fourStar: Number(account.fourStar),
            threeStar: Number(account.threeStar),
            twoStar: Number(account.twoStar),
            oneStar: Number(account.oneStar),
        };
    } catch (e) {
        return null;
    }
}