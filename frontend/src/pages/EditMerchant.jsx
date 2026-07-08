import { useState } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import idl from "../idl/sol_bazaar.json";

export default function EditMerchant({ merchant, onUpdated }) {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [storeName, setStoreName] = useState(merchant.storeName || "");
    const [descriptionUri, setDescriptionUri] = useState(merchant.descriptionUri || "");
    const [logoUri, setLogoUri] = useState(merchant.logoUri || "");
    const [bannerUri, setBannerUri] = useState(merchant.bannerUri || "");
    const [shipsFrom, setShipsFrom] = useState(merchant.shipsFrom || "");
    const [sellerDepositPercent, setSellerDepositPercent] =
        useState(String((merchant.sellerDepositBps || 1000) / 100));
    const [email, setEmail] = useState(merchant.email || "");
    const [phone, setPhone] = useState(merchant.phone || "");
    const [website, setWebsite] = useState(merchant.website || "");
    const [facebook, setFacebook] = useState(merchant.facebook || "");
    const [instagram, setInstagram] = useState(merchant.instagram || "");
    const [telegram, setTelegram] = useState(merchant.telegram || "");
    const [x, setX] = useState(merchant.x || "");

    const [active, setActive] = useState(merchant.active ?? true);

    const updateMerchant = async () => {
        if (!wallet.publicKey) {
            alert("Connect wallet first");
            return;
        }

        const provider = new AnchorProvider(connection, wallet, {
            commitment: "confirmed",
        });

        const program = new Program(idl, provider);

        const [merchantPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("merchant"), wallet.publicKey.toBuffer()],
            program.programId
        );

        const sellerDepositBps =
            Math.round(Number(sellerDepositPercent) * 100);

        const tx = await program.methods
            .updateMerchant(
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
                active
            )
            .accounts({
                merchantProfile: merchantPda,
                authority: wallet.publicKey,
            })
            .rpc();

        alert("Merchant updated: " + tx);

        if (onUpdated) onUpdated();
    };

    return (
        <div>
            <h2>Edit Store Profile</h2>

            <input placeholder="Store Name" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            <br /><br />

            <input placeholder="Description" value={descriptionUri} onChange={(e) => setDescriptionUri(e.target.value)} />
            <br /><br />

            <input placeholder="Logo URL" value={logoUri} onChange={(e) => setLogoUri(e.target.value)} />
            <br /><br />

            <input placeholder="Banner URL" value={bannerUri} onChange={(e) => setBannerUri(e.target.value)} />
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
            <br /><br />

            <input placeholder="Ships From e.g. Cavite, Philippines" value={shipsFrom} onChange={(e) => setShipsFrom(e.target.value)} />
            <br /><br />

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

            <label>
                <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                />
                Active
            </label>

            <br /><br />

            <button onClick={updateMerchant}>Save Store Profile</button>
        </div>
    );
}