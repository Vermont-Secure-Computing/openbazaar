import { program } from "./anchor";

export async function getProducts() {
    const rawAccounts =
        await program.provider.connection.getProgramAccounts(
            program.programId
        );

    const products = [];

    for (const item of rawAccounts) {
        try {
            const product = program.coder.accounts.decode(
                "product",
                item.account.data
            );

            products.push({
                publicKey: item.pubkey.toBase58(),
                merchant: product.merchant.toBase58(),
                productId: product.productId.toString(),
                title: product.title,
                description: product.descriptionUri,
                imageUri: product.imageUri,
                category: product.category,
                price: product.price.toString(),
                stock: product.stock,
                sold: product.sold,
                active: product.active,
                deleted: product.deleted,
                updatedAt: product.updatedAt.toString(),
            });
        } catch {
            // ignore non-product / old accounts
        }
    }

    return products.filter((p) => p.active && !p.deleted);
}

export async function getProductsByMerchant(merchant) {
    const products = await getProducts();

    return products.filter(
        (product) => product.merchant === merchant
    );
}

export async function getProduct(publicKey) {
    const products = await getProducts();

    return products.find(
        (product) => product.publicKey === publicKey
    );
}