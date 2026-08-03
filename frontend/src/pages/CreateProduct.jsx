import { useState } from "react";
import {
    BN,
    AnchorProvider,
    Program,
} from "@coral-xyz/anchor";
import {
    PublicKey,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";

import { solBazaarIdl as idl } from "../idl";

const MAX_IMAGES = 3;
const MAX_IMAGE_URI_BYTES = 250;

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

export default function CreateProduct() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [imageUris, setImageUris] = useState(Array(MAX_IMAGES).fill(""));
    const [category, setCategory] = useState("");
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [submitting, setSubmitting] =
        useState(false);

    const totalContentBytes =
        utf8ByteLength(title) +
        utf8ByteLength(description) +
        imageUris.reduce((total, imageUri) => total + utf8ByteLength(imageUri), 0) +
        utf8ByteLength(category);

    const transactionContentLimit = 500;

    const productTooLarge =
        totalContentBytes > transactionContentLimit;

    const updateImageUri = (index, value) => {
        setImageUris((current) =>
            current.map((imageUri, imageIndex) =>
                imageIndex === index ? value : imageUri
            )
        );
    };

    const createProduct = async () => {
        if (!wallet.publicKey) {
            alert("Connect wallet first.");
            return;
        }

        const cleanedTitle = title.trim();
        const cleanedDescription =
            description.trim();
        const cleanedImageUris = imageUris
            .map((imageUri) => imageUri.trim())
            .filter(Boolean);
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
            ["Category", cleanedCategory, 32],
        ];
        cleanedImageUris.forEach(
            (imageUri, index) => {
                limits.push([
                    `Image URL ${index + 1}`,
                    imageUri,
                    MAX_IMAGE_URI_BYTES,
                ]);
            }
        );

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
                    "Shorten the description or image URLs."
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
            setSubmitting(true);

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

            const productId = new BN(Date.now());

            const priceLamports = new BN(
                Math.round(
                    priceNumber *
                        LAMPORTS_PER_SOL
                )
            );

            const [merchantPda] =
                PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("merchant"),
                        wallet.publicKey.toBuffer(),
                    ],
                    program.programId
                );

            const [productPda] =
                PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("product"),
                        wallet.publicKey.toBuffer(),
                        productId.toArrayLike(
                            Buffer,
                            "le",
                            8
                        ),
                    ],
                    program.programId
                );

            const tx = await program.methods
                .createProduct(
                    productId,
                    cleanedTitle,
                    cleanedDescription,
                    cleanedImageUris,
                    cleanedCategory,
                    priceLamports,
                    stockNumber
                )
                .accounts({
                    merchantProfile: merchantPda,
                    product: productPda,
                    authority: wallet.publicKey,
                    systemProgram:
                        SystemProgram.programId,
                })
                .rpc();

            alert(`Product created: ${tx}`);

            setTitle("");
            setDescription("");
            setImageUris(Array(MAX_IMAGES).fill(""));
            setCategory("");
            setPrice("");
            setStock("");
        } catch (error) {
            console.error(
                "Create product error:",
                error
            );

            alert(
                error?.message ||
                    "Failed to create product."
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Create Product</h2>

            <label>Product Name</label>
            <br />

            <input
                placeholder="Product Name"
                value={title}
                maxLength={64}
                onChange={(event) =>
                    setTitle(event.target.value)
                }
            />

            <FieldCounter
                value={title}
                maxBytes={64}
            />

            <br />

            <label>Product Description</label>
            <br />

            <textarea
                placeholder="Describe the product, condition, size, materials, shipping details, and other important information."
                value={description}
                maxLength={200}
                rows={6}
                onChange={(event) =>
                    setDescription(
                        event.target.value
                    )
                }
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

            <label>
                Product Images (optional, up to 3)
            </label>

            {imageUris.map((imageUri, index) => (
                <div
                    key={index}
                    style={{ marginTop: 10 }}
                >
                    <input
                        placeholder={`Image URL ${index + 1}`}
                        value={imageUri}
                        maxLength={MAX_IMAGE_URI_BYTES}
                        onChange={(event) =>
                            updateImageUri(
                                index,
                                event.target.value
                            )
                        }
                    />

                    <FieldCounter
                        value={imageUri}
                        maxBytes={MAX_IMAGE_URI_BYTES}
                    />
                </div>
            ))}

            <br />

            <label>Category</label>
            <br />

            <input
                placeholder="Category"
                value={category}
                maxLength={32}
                onChange={(event) =>
                    setCategory(event.target.value)
                }
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
                placeholder="Price (SOL)"
                value={price}
                onChange={(event) =>
                    setPrice(event.target.value)
                }
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
                placeholder="Available Stock"
                value={stock}
                onChange={(event) =>
                    setStock(event.target.value)
                }
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
                        creating the product.
                    </div>
                )}
            </div>

            <button
                type="button"
                onClick={createProduct}
                disabled={
                    submitting ||
                    productTooLarge ||
                    !wallet.publicKey
                }
            >
                {submitting
                    ? "Creating..."
                    : "Create Product"}
            </button>
        </div>
    );
}