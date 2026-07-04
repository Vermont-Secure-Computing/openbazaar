import { useState } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import idl from "../idl/sol_bazaar.json";

export default function CreateMerchant() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [storeName, setStoreName] = useState("");
    const [descriptionUri, setDescriptionUri] = useState("");
    const [logoUri, setLogoUri] = useState("");
    const [bannerUri, setBannerUri] = useState("");
    const [location, setLocation] = useState("");

    const createMerchant = async () => {
        if (!wallet.publicKey) {
            alert("Connect wallet first");
            return;
        }

        const provider = new AnchorProvider(connection, wallet, {
            commitment: "confirmed",
        });

        const program = new Program(idl, provider);

        const [merchantPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("merchant"),
                wallet.publicKey.toBuffer(),
            ],
            program.programId
        );

        const tx = await program.methods
            .createMerchant(
                storeName,
                descriptionUri,
                logoUri,
                bannerUri,
                location
            )
            .accounts({
                merchantProfile: merchantPda,
                authority: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        alert("Merchant created: " + tx);
    };

    return (
        <div style={{ padding: 24 }}>
            <h2>Create Merchant</h2>

            <input placeholder="Store Name" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            <br />

            <input placeholder="Description URL/Text" value={descriptionUri} onChange={(e) => setDescriptionUri(e.target.value)} />
            <br />

            <input placeholder="Logo Image URL" value={logoUri} onChange={(e) => setLogoUri(e.target.value)} />
            <br />

            <input placeholder="Banner Image URL" value={bannerUri} onChange={(e) => setBannerUri(e.target.value)} />
            <br />

            <input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
            <br />

            <button onClick={createMerchant}>
                Create Merchant
            </button>
        </div>
    );
}