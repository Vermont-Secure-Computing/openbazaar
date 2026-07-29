import { program } from "./anchor";

function addressToString(value) {
    if (!value) return "";

    if (typeof value === "string") {
        return value;
    }

    if (typeof value.toBase58 === "function") {
        return value.toBase58();
    }

    return value.toString?.() || "";
}

async function getProductReviewStats() {
    const stats = new Map();

    try {
        const reviewAccounts =
            await program.account.merchantReview.all();

        for (const { account } of reviewAccounts) {
            const productAddress = addressToString(
                account.product
            );

            if (!productAddress) {
                continue;
            }

            const rating = Number(account.rating);

            const current = stats.get(
                productAddress
            ) || {
                totalReviews: 0,
                totalRating: 0,
            };

            current.totalReviews += 1;
            current.totalRating += rating;

            stats.set(productAddress, current);
        }
    } catch (error) {
        console.error(
            "Failed to load product review stats:",
            error
        );
    }

    return stats;
}

export async function getProducts() {
    const [rawAccounts, reviewStats] =
        await Promise.all([
            program.provider.connection.getProgramAccounts(
                program.programId
            ),
            getProductReviewStats(),
        ]);

    const products = [];

    for (const item of rawAccounts) {
        try {
            const product =
                program.coder.accounts.decode(
                    "product",
                    item.account.data
                );

            const publicKey =
                item.pubkey.toBase58();

            const stats = reviewStats.get(
                publicKey
            ) || {
                totalReviews: 0,
                totalRating: 0,
            };

            const averageRating =
                stats.totalReviews > 0
                    ? stats.totalRating /
                      stats.totalReviews
                    : 0;

            products.push({
                publicKey,
                merchant:
                    product.merchant.toBase58(),
                productId:
                    product.productId.toString(),
                title: product.title,
                description:
                    product.descriptionUri,
                imageUri: product.imageUri,
                category: product.category,
                price: product.price.toString(),
                stock: Number(product.stock),
                sold: Number(product.sold),
                active: product.active,
                deleted: product.deleted,
                updatedAt:
                    product.updatedAt.toString(),

                totalReviews:
                    stats.totalReviews,
                averageRating,
            });
        } catch {
            // Ignore non-product and old accounts.
        }
    }

    return products.filter(
        (product) =>
            product.active && !product.deleted
    );
}

export async function getProductsByMerchant(
    merchant
) {
    const products = await getProducts();

    return products.filter(
        (product) =>
            product.merchant ===
            addressToString(merchant)
    );
}

export async function getProduct(publicKey) {
    const products = await getProducts();

    return products.find(
        (product) =>
            product.publicKey ===
            addressToString(publicKey)
    );
}