import { useState } from "react";
import { BN, AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import idl from "../idl/sol_bazaar.json";

export default function EditProduct({ product, onUpdated }) {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [title, setTitle] = useState(product.title);
    const [description, setDescription] = useState(product.description);
    const [imageUri, setImageUri] = useState(product.imageUri);
    const [category, setCategory] = useState(product.category);
    const [price, setPrice] = useState( String(Number(product.price) / LAMPORTS_PER_SOL) );
    const [stock, setStock] = useState(product.stock);
    const [active, setActive] = useState(product.active);
    const priceLamports = new BN(
        Math.round(Number(price) * LAMPORTS_PER_SOL)
    );

    const updateProduct = async () => {
        const provider = new AnchorProvider(connection, wallet, {
            commitment: "confirmed",
        });

        const program = new Program(idl, provider);

        const productPda = new PublicKey(product.publicKey);

        const tx = await program.methods
            .updateProduct(
                title,
                description,
                imageUri,
                category,
                priceLamports,
                Number(stock),
                active
            )
            .accounts({
                product: productPda,
                authority: wallet.publicKey,
            })
            .rpc();

        alert("Product updated: " + tx);

        if (onUpdated) onUpdated();
    };

    const deleteProduct = async () => {
        const provider = new AnchorProvider(connection, wallet, {
            commitment: "confirmed",
        });

        const program = new Program(idl, provider);

        const tx = await program.methods
            .deleteProduct()
            .accounts({
                product: new PublicKey(product.publicKey),
                authority: wallet.publicKey,
            })
            .rpc();

        alert("Product deleted: " + tx);

        if (onUpdated) onUpdated();
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

            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <br /><br />

            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
            <br /><br />

            <input value={imageUri} onChange={(e) => setImageUri(e.target.value)} placeholder="Image URL" />
            <br /><br />

            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" />
            <br /><br />

            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" />
            <br /><br />

            <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Stock" />
            <br /><br />

            <label>
                <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                />
                Active
            </label>

            <br /><br />

            <button onClick={updateProduct}>Save Product</button>

            <button
                onClick={deleteProduct}
                style={{ marginLeft: 10 }}
            >
                Delete
            </button>
        </div>
    );
}