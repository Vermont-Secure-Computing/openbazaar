import {
    useEffect,
    useState,
} from "react";

import {
    useConnection,
    useWallet,
} from "@solana/wallet-adapter-react";

import {
    getOrderMessages,
    sendOrderMessage,
} from "../lib/chat";

function shortenAddress(address) {
    if (!address) {
        return "";
    }

    return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function formatDate(timestamp) {
    if (!timestamp) {
        return "";
    }

    return new Date(
        timestamp * 1000
    ).toLocaleString();
}

export default function OrderChat({
    escrow,
}) {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [messages, setMessages] =
        useState([]);

    const [message, setMessage] =
        useState("");

    const [loading, setLoading] =
        useState(true);

    const [sending, setSending] =
        useState(false);

    const [error, setError] =
        useState("");

    const walletAddress =
        wallet.publicKey?.toBase58() || "";

    const isBuyer =
        walletAddress === escrow.partyA;

    const isSeller =
        walletAddress === escrow.partyB;

    const canChat =
        isBuyer || isSeller;

    const loadMessages = async () => {
        try {
            setError("");

            const result =
                await getOrderMessages({
                    connection,
                    wallet,
                    escrowAddress:
                        escrow.publicKey,
                });

            setMessages(result);
        } catch (loadError) {
            console.error(
                "Load chat error:",
                loadError
            );

            setError(
                loadError?.message ||
                    "Failed to load messages."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMessages();

        const intervalId =
            window.setInterval(
                loadMessages,
                15_000
            );

        return () => {
            window.clearInterval(
                intervalId
            );
        };
    }, [
        escrow.publicKey,
        wallet.publicKey,
        connection,
    ]);

    const submitMessage = async (
        event
    ) => {
        event.preventDefault();

        if (!canChat) {
            alert(
                "Only the buyer or seller can send messages."
            );
            return;
        }

        const cleanMessage =
            message.trim();

        if (!cleanMessage) {
            return;
        }

        try {
            setSending(true);
            setError("");

            await sendOrderMessage({
                connection,
                wallet,
                escrowAddress:
                    escrow.publicKey,
                message: cleanMessage,
            });

            setMessage("");

            await loadMessages();
        } catch (sendError) {
            console.error(
                "Send chat error:",
                sendError
            );

            setError(
                sendError?.message ||
                    "Failed to send message."
            );
        } finally {
            setSending(false);
        }
    };

    return (
        <section
            style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop:
                    "1px solid #eee",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                        "space-between",
                    gap: 12,
                }}
            >
                <h4 style={{ margin: 0 }}>
                    Order Chat
                </h4>

                <button
                    type="button"
                    onClick={loadMessages}
                    disabled={loading}
                >
                    Refresh
                </button>
            </div>

            {error && (
                <p
                    style={{
                        color: "#dc2626",
                    }}
                >
                    {error}
                </p>
            )}

            <div
                style={{
                    marginTop: 16,
                    padding: 12,
                    minHeight: 140,
                    maxHeight: 360,
                    overflowY: "auto",
                    border:
                        "1px solid #ddd",
                    borderRadius: 12,
                    background: "#f9fafb",
                }}
            >
                {loading ? (
                    <p>
                        Loading messages...
                    </p>
                ) : messages.length === 0 ? (
                    <p
                        style={{
                            color: "#666",
                        }}
                    >
                        No messages yet.
                    </p>
                ) : (
                    messages.map(
                        (chatMessage) => {
                            const isMine =
                                chatMessage.sender ===
                                walletAddress;

                            const senderLabel =
                                chatMessage.sender ===
                                escrow.partyA
                                    ? "Buyer"
                                    : chatMessage.sender ===
                                        escrow.partyB
                                      ? "Seller"
                                      : shortenAddress(
                                            chatMessage.sender
                                        );

                            return (
                                <div
                                    key={
                                        chatMessage.publicKey
                                    }
                                    style={{
                                        display:
                                            "flex",
                                        justifyContent:
                                            isMine
                                                ? "flex-end"
                                                : "flex-start",
                                        marginBottom:
                                            12,
                                    }}
                                >
                                    <div
                                        style={{
                                            maxWidth:
                                                "75%",
                                            padding:
                                                "10px 12px",
                                            borderRadius:
                                                12,
                                            background:
                                                isMine
                                                    ? "#dbeafe"
                                                    : "#fff",
                                            border:
                                                "1px solid #ddd",
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize:
                                                    12,
                                                fontWeight:
                                                    700,
                                                marginBottom:
                                                    4,
                                            }}
                                        >
                                            {isMine
                                                ? `You (${senderLabel})`
                                                : senderLabel}
                                        </div>

                                        <div
                                            style={{
                                                whiteSpace:
                                                    "pre-wrap",
                                                overflowWrap:
                                                    "anywhere",
                                            }}
                                        >
                                            {
                                                chatMessage.message
                                            }
                                        </div>

                                        <div
                                            style={{
                                                marginTop:
                                                    6,
                                                fontSize:
                                                    11,
                                                color:
                                                    "#6b7280",
                                            }}
                                        >
                                            {formatDate(
                                                chatMessage.createdAt
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                    )
                )}
            </div>

            {canChat ? (
                <form
                    onSubmit={submitMessage}
                    style={{
                        marginTop: 12,
                        display: "flex",
                        gap: 10,
                    }}
                >
                    <textarea
                        value={message}
                        onChange={(event) =>
                            setMessage(
                                event.target.value
                            )
                        }
                        maxLength={280}
                        rows={2}
                        placeholder="Type a message..."
                        disabled={sending}
                        style={{
                            flex: 1,
                            resize: "vertical",
                            padding: 10,
                            borderRadius: 8,
                            border:
                                "1px solid #ccc",
                        }}
                    />

                    <button
                        type="submit"
                        disabled={
                            sending ||
                            !message.trim()
                        }
                    >
                        {sending
                            ? "Sending..."
                            : "Send"}
                    </button>
                </form>
            ) : (
                <p
                    style={{
                        color: "#6b7280",
                    }}
                >
                    Only the buyer and seller
                    can send messages.
                </p>
            )}

            <small
                style={{
                    display: "block",
                    marginTop: 8,
                    color: "#6b7280",
                }}
            >
                Each message creates an
                on-chain account. The sender
                pays the transaction fee and
                rent.
            </small>
        </section>
    );
}