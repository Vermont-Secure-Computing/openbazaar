import { BN, AnchorProvider, Program } from "@coral-xyz/anchor";
import {
    PublicKey,
    SystemProgram,
} from "@solana/web3.js";

import idl from "../idl/sol_bazaar.json";

function createProgram(connection, wallet) {
    const provider = new AnchorProvider(
        connection,
        wallet,
        {
            commitment: "confirmed",
        }
    );

    return new Program(idl, provider);
}

export async function sendOrderMessage({
    connection,
    wallet,
    escrowAddress,
    message,
}) {
    if (!wallet.publicKey) {
        throw new Error("Connect wallet first.");
    }

    const cleanMessage = message.trim();

    if (!cleanMessage) {
        throw new Error("Message cannot be empty.");
    }

    if (new TextEncoder().encode(cleanMessage).length > 280) {
        throw new Error(
            "Message must not exceed 280 bytes."
        );
    }

    const program = createProgram(
        connection,
        wallet
    );

    const escrowPublicKey =
        new PublicKey(escrowAddress);

    /*
     * Timestamp plus random suffix.
     * This reduces the chance that buyer and seller
     * generate the same message ID simultaneously.
     */
    const timestamp = BigInt(Date.now());
    const randomPart = BigInt(
        Math.floor(Math.random() * 1000)
    );

    const messageIdBigInt =
        timestamp * 1000n + randomPart;

    const messageId = new BN(
        messageIdBigInt.toString()
    );

    const [chatMessagePda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("message"),
                escrowPublicKey.toBuffer(),
                messageId.toArrayLike(
                    Buffer,
                    "le",
                    8
                ),
            ],
            program.programId
        );

    const signature = await program.methods
        .sendMessage(
            messageId,
            cleanMessage
        )
        .accounts({
            sender: wallet.publicKey,
            escrow: escrowPublicKey,
            chatMessage: chatMessagePda,
            systemProgram:
                SystemProgram.programId,
        })
        .rpc();

    return {
        signature,
        messageId: messageId.toString(),
        chatMessagePda:
            chatMessagePda.toBase58(),
    };
}

export async function getOrderMessages({
    connection,
    wallet,
    escrowAddress,
}) {
    if (!escrowAddress) {
        return [];
    }

    const program = createProgram(
        connection,
        wallet
    );

    /*
     * ChatMessage layout:
     *
     * 8 bytes  account discriminator
     * 32 bytes escrow public key
     *
     * Therefore, escrow starts at offset 8.
     */
    const rawAccounts =
        await connection.getProgramAccounts(
            program.programId,
            {
                commitment: "confirmed",
                filters: [
                    {
                        memcmp: {
                            offset: 8,
                            bytes: escrowAddress,
                        },
                    },
                ],
            }
        );

    const messages = [];

    for (const item of rawAccounts) {
        try {
            const account =
                program.coder.accounts.decode(
                    "chatMessage",
                    item.account.data
                );

            messages.push({
                publicKey:
                    item.pubkey.toBase58(),

                escrow:
                    account.escrow.toBase58(),

                sender:
                    account.sender.toBase58(),

                message:
                    account.message,

                createdAt:
                    Number(
                        account.createdAt.toString()
                    ),

                messageId:
                    account.messageId.toString(),
            });
        } catch (error) {
            console.warn(
                "Unable to decode chat account:",
                item.pubkey.toBase58(),
                error
            );
        }
    }

    messages.sort((a, b) => {
        const first = BigInt(a.messageId);
        const second = BigInt(b.messageId);

        if (first < second) return -1;
        if (first > second) return 1;
        return 0;
    });

    return messages;
}