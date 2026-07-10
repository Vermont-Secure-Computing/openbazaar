import { useState } from "react";
import { BN, AnchorProvider, Program } from "@coral-xyz/anchor";
import {
    PublicKey,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";

import idl from "../idl/sol_bazaar.json";

export default function CreateProduct() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [image, setImage] = useState("");
    const [category, setCategory] = useState("");
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const createProduct = async () => {
        if (!wallet.publicKey) {
            alert("Connect wallet first");
            return;
        }

        const priceNumber = Number(price);
        const stockNumber = Number(stock);

        if (!title.trim()) {
            alert("Product name is required.");
            return;
        }

        if (!description.trim()) {
            alert("Description is required.");
            return;
        }

        if (!category.trim()) {
            alert("Category is required.");
            return;
        }

        if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
            alert("Enter a valid price in SOL.");
            return;
        }

        if (!Number.isInteger(stockNumber) || stockNumber < 0) {
            alert("Enter a valid whole-number stock quantity.");
            return;
        }

        try {
            setSubmitting(true);

            const provider = new AnchorProvider(connection, wallet, {
                commitment: "confirmed",
            });

            const program = new Program(idl, provider);

            const productId = new BN(Date.now());

            const priceLamports = new BN(
                Math.round(priceNumber * LAMPORTS_PER_SOL)
            );

            const [merchantPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("merchant"),
                    wallet.publicKey.toBuffer(),
                ],
                program.programId
            );

            const [productPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("product"),
                    wallet.publicKey.toBuffer(),
                    productId.toArrayLike(Buffer, "le", 8),
                ],
                program.programId
            );

            const tx = await program.methods
                .createProduct(
                    productId,
                    title.trim(),
                    description.trim(),
                    image.trim(),
                    category.trim(),
                    priceLamports,
                    stockNumber
                )
                .accounts({
                    merchantProfile: merchantPda,
                    product: productPda,
                    authority: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            alert(`Product created: ${tx}`);

            setTitle("");
            setDescription("");
            setImage("");
            setCategory("");
            setPrice("");
            setStock("");
        } catch (error) {
            console.error("Create product error:", error);
            alert(error?.message || "Failed to create product.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Create Product</h2>

            <input
                placeholder="Product Name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
            />

            <br />
            <br />

            <input
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />

            <br />
            <br />

            <input
                placeholder="Image URL"
                value={image}
                onChange={(e) => setImage(e.target.value)}
            />

            <br />
            <br />

            <input
                placeholder="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
            />

            <br />
            <br />

            <input
                type="number"
                min="0.000000001"
                step="0.000000001"
                placeholder="Price (SOL)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
            />

            <br />
            <br />

            <input
                type="number"
                min="0"
                step="1"
                placeholder="Available Stock"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
            />

            <br />
            <br />

            <button
                onClick={createProduct}
                disabled={submitting}
            >
                {submitting ? "Creating..." : "Create Product"}
            </button>
        </div>
    );
}

