import { useState } from "react";
import {
    BN,
    AnchorProvider,
    Program,
} from "@coral-xyz/anchor";
import {
    PublicKey,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";

import idl from "../idl/sol_bazaar.json";

function utf8ByteLength(value) {
    return new TextEncoder().encode(
        String(value ?? "")
    ).length;
}

function FieldCounter({ value, maxBytes }) {
    const characters = String(value ?? "").length;
    const bytes = utf8ByteLength(value);
    const overLimit = bytes > maxBytes;

    return (
        <div
            style={{
                fontSize: 12,
                color: overLimit ? "#dc2626" : "#666",
                marginTop: 4,
            }}
        >
            {characters} characters · {bytes}/{maxBytes} bytes
            {overLimit ? " — too long" : ""}
        </div>
    );
}

export default function EditProduct({
    product,
    onUpdated,
}) {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [title, setTitle] = useState(
        product.title || ""
    );
    const [description, setDescription] = useState(
        product.description || ""
    );
    const [imageUri, setImageUri] = useState(
        product.imageUri || ""
    );
    const [category, setCategory] = useState(
        product.category || ""
    );
    const [price, setPrice] = useState(
        String(
            Number(product.price) /
                LAMPORTS_PER_SOL
        )
    );
    const [stock, setStock] = useState(
        String(product.stock ?? 0)
    );
    const [active, setActive] = useState(
        product.active ?? true
    );

    const [updating, setUpdating] =
        useState(false);
    const [deleting, setDeleting] =
        useState(false);

    const totalContentBytes =
        utf8ByteLength(title) +
        utf8ByteLength(description) +
        utf8ByteLength(imageUri) +
        utf8ByteLength(category);

    const transactionContentLimit = 500;

    const productTooLarge =
        totalContentBytes > transactionContentLimit;

    const updateProduct = async () => {
        if (!wallet.publicKey) {
            alert("Connect wallet first.");
            return;
        }

        const cleanedTitle = title.trim();
        const cleanedDescription =
            description.trim();
        const cleanedImageUri = imageUri.trim();
        const cleanedCategory = category.trim();

        if (!cleanedTitle) {
            alert("Product name is required.");
            return;
        }

        if (!cleanedDescription) {
            alert("Description is required.");
            return;
        }

        if (!cleanedCategory) {
            alert("Category is required.");
            return;
        }

        const limits = [
            ["Product name", cleanedTitle, 64],
            [
                "Product description",
                cleanedDescription,
                200,
            ],
            ["Image URL", cleanedImageUri, 250],
            ["Category", cleanedCategory, 32],
        ];

        for (const [label, value, maxBytes] of limits) {
            const bytes = utf8ByteLength(value);

            if (bytes > maxBytes) {
                alert(
                    `${label} must not exceed ${maxBytes} UTF-8 bytes.\n\n` +
                        `Current size: ${bytes} bytes.`
                );
                return;
            }
        }

        const cleanedTotalBytes = limits.reduce(
            (total, [, value]) =>
                total + utf8ByteLength(value),
            0
        );

        if (
            cleanedTotalBytes >
            transactionContentLimit
        ) {
            alert(
                "Product information is too large for one transaction.\n\n" +
                    `Current content: ${cleanedTotalBytes} bytes\n` +
                    `Recommended maximum: ${transactionContentLimit} bytes\n\n` +
                    "Shorten the description or image URL."
            );
            return;
        }

        const priceNumber = Number(price);
        const stockNumber = Number(stock);

        if (
            !Number.isFinite(priceNumber) ||
            priceNumber <= 0
        ) {
            alert("Enter a valid price in SOL.");
            return;
        }

        if (
            !Number.isInteger(stockNumber) ||
            stockNumber < 0
        ) {
            alert(
                "Enter a valid whole-number stock quantity."
            );
            return;
        }

        try {
            setUpdating(true);

            const provider = new AnchorProvider(
                connection,
                wallet,
                {
                    commitment: "confirmed",
                }
            );

            const program = new Program(
                idl,
                provider
            );

            const productPda = new PublicKey(
                product.publicKey
            );

            const priceLamports = new BN(
                Math.round(
                    priceNumber *
                        LAMPORTS_PER_SOL
                )
            );

            const tx = await program.methods
                .updateProduct(
                    cleanedTitle,
                    cleanedDescription,
                    cleanedImageUri,
                    cleanedCategory,
                    priceLamports,
                    stockNumber,
                    active
                )
                .accounts({
                    product: productPda,
                    authority: wallet.publicKey,
                })
                .rpc();

            alert("Product updated: " + tx);

            if (onUpdated) {
                onUpdated();
            }
        } catch (error) {
            console.error(
                "Update product error:",
                error
            );

            alert(
                error?.message ||
                    "Failed to update product."
            );
        } finally {
            setUpdating(false);
        }
    };

    const deleteProduct = async () => {
        if (!wallet.publicKey) {
            alert("Connect wallet first.");
            return;
        }

        const confirmed = window.confirm(
            `Delete "${product.title}"?\n\nThis action cannot be undone.`
        );

        if (!confirmed) {
            return;
        }

        try {
            setDeleting(true);

            const provider = new AnchorProvider(
                connection,
                wallet,
                {
                    commitment: "confirmed",
                }
            );

            const program = new Program(
                idl,
                provider
            );

            const tx = await program.methods
                .deleteProduct()
                .accounts({
                    product: new PublicKey(
                        product.publicKey
                    ),
                    authority: wallet.publicKey,
                })
                .rpc();

            alert("Product deleted: " + tx);

            if (onUpdated) {
                onUpdated();
            }
        } catch (error) {
            console.error(
                "Delete product error:",
                error
            );

            alert(
                error?.message ||
                    "Failed to delete product."
            );
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div
            style={{
                border: "1px solid #ddd",
                padding: 16,
                borderRadius: 12,
                marginBottom: 16,
            }}
        >
            <h3>{product.title}</h3>

            <label>Product Name</label>
            <br />

            <input
                value={title}
                maxLength={64}
                onChange={(event) =>
                    setTitle(event.target.value)
                }
                placeholder="Product Name"
            />

            <FieldCounter
                value={title}
                maxBytes={64}
            />

            <br />

            <label>Product Description</label>
            <br />

            <textarea
                value={description}
                maxLength={200}
                rows={6}
                onChange={(event) =>
                    setDescription(
                        event.target.value
                    )
                }
                placeholder="Describe the product, condition, size, materials, shipping details, and other important information."
                style={{
                    width: "100%",
                    maxWidth: 600,
                    padding: 10,
                    boxSizing: "border-box",
                    resize: "vertical",
                    fontFamily: "inherit",
                    fontSize: 14,
                }}
            />

            <FieldCounter
                value={description}
                maxBytes={200}
            />

            <br />

            <label>Image URL</label>
            <br />

            <input
                value={imageUri}
                maxLength={250}
                onChange={(event) =>
                    setImageUri(event.target.value)
                }
                placeholder="Image URL"
            />

            <FieldCounter
                value={imageUri}
                maxBytes={250}
            />

            <br />

            <label>Category</label>
            <br />

            <input
                value={category}
                maxLength={32}
                onChange={(event) =>
                    setCategory(event.target.value)
                }
                placeholder="Category"
            />

            <FieldCounter
                value={category}
                maxBytes={32}
            />

            <br />

            <label>Price in SOL</label>
            <br />

            <input
                type="number"
                min="0.000000001"
                step="0.000000001"
                value={price}
                onChange={(event) =>
                    setPrice(event.target.value)
                }
                placeholder="Price (SOL)"
            />

            <div
                style={{
                    fontSize: 12,
                    color: "#666",
                    marginTop: 4,
                }}
            >
                Minimum price: 0.000000001 SOL
            </div>

            <br />

            <label>Available Stock</label>
            <br />

            <input
                type="number"
                min="0"
                step="1"
                value={stock}
                onChange={(event) =>
                    setStock(event.target.value)
                }
                placeholder="Available Stock"
            />

            <div
                style={{
                    fontSize: 12,
                    color: "#666",
                    marginTop: 4,
                }}
            >
                Enter a whole number, such as 0, 1, 5,
                or 100.
            </div>

            <div
                style={{
                    marginTop: 16,
                    marginBottom: 16,
                    padding: 12,
                    maxWidth: 600,
                    border: productTooLarge
                        ? "1px solid #dc2626"
                        : "1px solid #ddd",
                    borderRadius: 8,
                    background: productTooLarge
                        ? "#fef2f2"
                        : "#f9fafb",
                    color: productTooLarge
                        ? "#dc2626"
                        : "#333",
                }}
            >
                <strong>
                    Combined product content:
                </strong>{" "}
                {totalContentBytes}/
                {transactionContentLimit} recommended bytes

                {productTooLarge && (
                    <div style={{ marginTop: 6 }}>
                        Shorten the product description,
                        image URL, or other fields before
                        saving.
                    </div>
                )}
            </div>

            <label>
                <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) =>
                        setActive(event.target.checked)
                    }
                />{" "}
                Active
            </label>

            <br />
            <br />

            <button
                type="button"
                onClick={updateProduct}
                disabled={
                    updating ||
                    deleting ||
                    productTooLarge
                }
            >
                {updating
                    ? "Saving..."
                    : "Save Product"}
            </button>

            <button
                type="button"
                onClick={deleteProduct}
                disabled={updating || deleting}
                style={{ marginLeft: 10 }}
            >
                {deleting
                    ? "Deleting..."
                    : "Delete"}
            </button>
        </div>
    );
}