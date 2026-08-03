import { useState } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";

import { solBazaarIdl as idl } from "../idl";

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

export default function EditMerchant({
    merchant,
    onUpdated,
}) {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [storeName, setStoreName] = useState(
        merchant.storeName || ""
    );
    const [descriptionUri, setDescriptionUri] = useState(
        merchant.descriptionUri || ""
    );
    const [logoUri, setLogoUri] = useState(
        merchant.logoUri || ""
    );
    const [bannerUri, setBannerUri] = useState(
        merchant.bannerUri || ""
    );
    const [shipsFrom, setShipsFrom] = useState(
        merchant.shipsFrom || ""
    );
    const [sellerDepositPercent, setSellerDepositPercent] =
        useState(
            String(
                (merchant.sellerDepositBps ?? 1000) /
                    100
            )
        );
    const [preferredContact, setPreferredContact] = useState(
        merchant.preferredContact || ""
    );
    const [active, setActive] = useState(
        merchant.active ?? true
    );

    const totalProfileBytes =
        utf8ByteLength(storeName) +
        utf8ByteLength(descriptionUri) +
        utf8ByteLength(logoUri) +
        utf8ByteLength(bannerUri) +
        utf8ByteLength(shipsFrom) +
        utf8ByteLength(preferredContact);

    const transactionContentLimit = 950;
    const profileTooLarge =
        totalProfileBytes > transactionContentLimit;

    const updateMerchant = async () => {
        if (!wallet.publicKey) {
            alert("Connect wallet first");
            return;
        }

        const cleanedStoreName = storeName.trim();
        const cleanedDescription = descriptionUri.trim();
        const cleanedLogoUri = logoUri.trim();
        const cleanedBannerUri = bannerUri.trim();
        const cleanedShipsFrom = shipsFrom.trim();
        const cleanedPreferredContact =
            preferredContact.trim();

        const limits = [
            ["Store name", cleanedStoreName, 64],
            ["Seller description", cleanedDescription, 200],
            ["Logo URL", cleanedLogoUri, 200],
            ["Banner URL", cleanedBannerUri, 200],
            ["Ships from", cleanedShipsFrom, 64],
            [
                "Preferred contact",
                cleanedPreferredContact,
                300,
            ],
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
                "Store profile is too large for one Solana transaction.\n\n" +
                    `Current content: ${cleanedTotalBytes} bytes\n` +
                    `Recommended maximum: ${transactionContentLimit} bytes\n\n` +
                    "Shorten the description, URLs, or preferred contact."
            );
            return;
        }

        const depositPercent = Number(
            sellerDepositPercent
        );

        if (
            !Number.isFinite(depositPercent) ||
            depositPercent < 0 ||
            depositPercent > 100
        ) {
            alert(
                "Seller deposit must be between 0% and 100%."
            );
            return;
        }

        try {
            const provider = new AnchorProvider(
                connection,
                wallet,
                {
                    commitment: "confirmed",
                }
            );

            const program = new Program(idl, provider);

            const [merchantPda] =
                PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("merchant"),
                        wallet.publicKey.toBuffer(),
                    ],
                    program.programId
                );

            const sellerDepositBps = Math.round(
                depositPercent * 100
            );

            const tx = await program.methods
                .updateMerchant(
                    cleanedStoreName,
                    cleanedDescription,
                    cleanedLogoUri,
                    cleanedBannerUri,
                    cleanedShipsFrom,
                    sellerDepositBps,
                    cleanedPreferredContact,
                    active
                )
                .accounts({
                    merchantProfile: merchantPda,
                    authority: wallet.publicKey,
                })
                .rpc();

            alert("Merchant updated: " + tx);

            if (onUpdated) {
                onUpdated();
            }
        } catch (error) {
            console.error(
                "Update merchant error:",
                error
            );

            alert(
                error?.message ||
                    "Failed to update merchant."
            );
        }
    };

    return (
        <div>
            <h2>Edit Store Profile</h2>

            <label>Store Name</label>
            <br />
            <input
                placeholder="Store Name"
                value={storeName}
                maxLength={64}
                onChange={(event) =>
                    setStoreName(event.target.value)
                }
            />
            <FieldCounter
                value={storeName}
                maxBytes={64}
            />
            <br />

            <label>Seller Description</label>
            <br />
            <textarea
                value={descriptionUri}
                onChange={(event) =>
                    setDescriptionUri(event.target.value)
                }
                rows={5}
                maxLength={200}
                placeholder="Describe your store, products, shipping, and other important information."
                style={{
                    width: "100%",
                    maxWidth: 600,
                    padding: 10,
                    boxSizing: "border-box",
                    resize: "vertical",
                }}
            />
            <FieldCounter
                value={descriptionUri}
                maxBytes={200}
            />
            <br />

            <label>Logo URL</label>
            <br />
            <input
                placeholder="Logo URL"
                value={logoUri}
                maxLength={200}
                onChange={(event) =>
                    setLogoUri(event.target.value)
                }
            />
            <FieldCounter
                value={logoUri}
                maxBytes={200}
            />
            <br />

            <label>Banner URL</label>
            <br />
            <input
                placeholder="Banner URL"
                value={bannerUri}
                maxLength={200}
                onChange={(event) =>
                    setBannerUri(event.target.value)
                }
            />
            <FieldCounter
                value={bannerUri}
                maxBytes={200}
            />
            <br />

            <label>Seller Escrow Deposit %</label>
            <br />
            <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="Seller Escrow Deposit %"
                value={sellerDepositPercent}
                onChange={(event) =>
                    setSellerDepositPercent(
                        event.target.value
                    )
                }
            />
            <br />
            <br />

            <label>Ships From</label>
            <br />
            <input
                placeholder="Ships From e.g. Cavite, Philippines"
                value={shipsFrom}
                maxLength={64}
                onChange={(event) =>
                    setShipsFrom(event.target.value)
                }
            />
            <FieldCounter
                value={shipsFrom}
                maxBytes={64}
            />
            <br />

            <h3>Additional Information</h3>

            <textarea
                value={preferredContact}
                onChange={(event) =>
                    setPreferredContact(
                        event.target.value
                    )
                }
                rows={6}
                maxLength={300}
                placeholder={
                    "Example:\n\n" +
                    "Telegram: @johnshop\n\n" +
                    "or\n\n" +
                    "Email: john@example.com\n\n" +
                    "or\n\n" +
                    "GPG Fingerprint: xxxx xxxx xxxx"
                }
                style={{
                    width: "100%",
                    maxWidth: 600,
                    padding: 10,
                    boxSizing: "border-box",
                    resize: "vertical",
                }}
            />
            <FieldCounter
                value={preferredContact}
                maxBytes={300}
            />

            <div
                style={{
                    marginTop: 16,
                    marginBottom: 16,
                    padding: 12,
                    maxWidth: 600,
                    border: profileTooLarge
                        ? "1px solid #dc2626"
                        : "1px solid #ddd",
                    borderRadius: 8,
                    background: profileTooLarge
                        ? "#fef2f2"
                        : "#f9fafb",
                    color: profileTooLarge
                        ? "#dc2626"
                        : "#333",
                }}
            >
                <strong>
                    Combined transaction content:
                </strong>{" "}
                {totalProfileBytes}/
                {transactionContentLimit} recommended bytes

                {profileTooLarge && (
                    <div style={{ marginTop: 6 }}>
                        Shorten the description, URLs, or
                        preferred contact before saving.
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
                onClick={updateMerchant}
                disabled={profileTooLarge}
            >
                Save Store Profile
            </button>
        </div>
    );
}