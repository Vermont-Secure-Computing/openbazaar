import { useState } from "react";
import { BN, AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

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

    const createProduct = async () => {
        if (!wallet.publicKey) {
            alert("Connect wallet first");
            return;
        }

        const provider = new AnchorProvider(connection, wallet, {
            commitment: "confirmed",
        });

        const program = new Program(idl, provider);

        const productId = new BN(Date.now());
        const priceBn = new BN(price);
        const stockNumber = Number(stock);

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
                title,
                description,
                image,
                category,
                priceBn,
                stockNumber
            )
            .accounts({
                merchantProfile: merchantPda,
                product: productPda,
                authority: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        alert("Product created: " + tx);

        setTitle("");
        setDescription("");
        setImage("");
        setCategory("");
        setPrice("");
        setStock("");
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Create Product</h2>

            <input
                placeholder="Product Name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
            />

            <br /><br />

            <input
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />

            <br /><br />

            <input
                placeholder="Image URL"
                value={image}
                onChange={(e) => setImage(e.target.value)}
            />

            <br /><br />

            <input
                placeholder="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
            />

            <br /><br />

            <input
                type="number"
                placeholder="Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
            />

            <br /><br />

            <input
                type="number"
                placeholder="Available Stock"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
            />

            <br /><br />

            <button onClick={createProduct}>
                Create Product
            </button>
        </div>
    );
}