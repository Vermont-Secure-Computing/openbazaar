import { useState } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import idl from "../idl/sol_bazaar.json";

export default function CreateMerchant({ onCreated }) {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [storeName, setStoreName] = useState("");
    const [descriptionUri, setDescriptionUri] = useState("");
    const [logoUri, setLogoUri] = useState("");
    const [bannerUri, setBannerUri] = useState("");
    const [shipsFrom, setShipsFrom] = useState("");
    const [sellerDepositPercent, setSellerDepositPercent] = useState("10");

    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [website, setWebsite] = useState("");
    const [facebook, setFacebook] = useState("");
    const [instagram, setInstagram] = useState("");
    const [telegram, setTelegram] = useState("");
    const [x, setX] = useState("");
    const [preferredContact, setPreferredContact] = useState("");

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

        const sellerDepositBps =
            Math.round(Number(sellerDepositPercent) * 100);

        const tx = await program.methods
            .createMerchant(
                storeName,
                descriptionUri,
                logoUri,
                bannerUri,
                shipsFrom,
                sellerDepositBps,
                email || "",
                phone || "",
                website || "",
                facebook || "",
                instagram || "",
                telegram || "",
                x || "",
                preferredContact || ""
            )
            .accountsStrict({
                merchantProfile: merchantPda,
                authority: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        alert("Merchant created: " + tx);

        setStoreName("");
        setDescriptionUri("");
        setLogoUri("");
        setBannerUri("");
        setShipsFrom("");
        setEmail("");
        setPhone("");
        setWebsite("");
        setFacebook("");
        setInstagram("");
        setTelegram("");
        setX("");

        if (onCreated) onCreated();
    };

    return (
        <div style={{ padding: 24 }}>
            <h2>Create Merchant</h2>

            <input placeholder="Store Name" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            <br /><br />

            <input placeholder="Description" value={descriptionUri} onChange={(e) => setDescriptionUri(e.target.value)} />
            <br /><br />

            <input placeholder="Logo Image URL" value={logoUri} onChange={(e) => setLogoUri(e.target.value)} />
            <br /><br />

            <input placeholder="Banner Image URL" value={bannerUri} onChange={(e) => setBannerUri(e.target.value)} />
            <br /><br />

            <input placeholder="Ships From e.g. Cavite, Philippines" value={shipsFrom} onChange={(e) => setShipsFrom(e.target.value)} />
            <br /><br />

            <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="Seller Escrow Deposit %"
                value={sellerDepositPercent}
                onChange={(e) => setSellerDepositPercent(e.target.value)}
            />

            <h3>Optional Contact Details</h3>

            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <br /><br />

            <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <br /><br />

            <input placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
            <br /><br />

            <input placeholder="Facebook" value={facebook} onChange={(e) => setFacebook(e.target.value)} />
            <br /><br />

            <input placeholder="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
            <br /><br />

            <input placeholder="Telegram" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
            <br /><br />

            <input placeholder="X / Twitter" value={x} onChange={(e) => setX(e.target.value)} />
            <br /><br />

            <textarea
                placeholder={`Preferred Contact

            Example:
            Email: store@example.com
            Telegram: @myshop
            WhatsApp: +639171234567
            Facebook: facebook.com/myshop`}
                value={preferredContact}
                onChange={(e) => setPreferredContact(e.target.value)}
                rows={5}
                style={{
                    width: "100%",
                    maxWidth: "600px",
                    padding: "10px",
                    resize: "vertical",
                    fontFamily: "inherit",
                    fontSize: "14px",
                    boxSizing: "border-box",
                }}
            />
            <br /><br />

            <button onClick={createMerchant}>
                Create Merchant
            </button>
        </div>
    );
}