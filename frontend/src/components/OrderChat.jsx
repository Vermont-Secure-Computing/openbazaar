import {  useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getOrderMessages, sendOrderMessage } from "../lib/chat";
import "./OrderChat.css";

function shortenAddress(address) {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function formatDate(timestamp) {
    if (!timestamp) return "";
    return new Date(timestamp * 1000).toLocaleString();
}

export default function OrderChat({ escrow,}) {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const walletAddress = wallet.publicKey?.toBase58() || "";
    const isBuyer = walletAddress === escrow.partyA;
    const isSeller = walletAddress === escrow.partyB;
    const canChat = isBuyer || isSeller;

    const loadMessages = async () => {
        try {
            setError("");

            const result = await getOrderMessages({
                connection,
                wallet,
                escrowAddress: escrow.publicKey,
            });

            setMessages(result);
        } catch (loadError) {
            console.error("Load chat error:", loadError);

            setError(loadError?.message || "Failed to load messages.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMessages();

        const intervalId = window.setInterval(loadMessages, 15_000);

        return () => {window.clearInterval(intervalId);};
    }, [
        escrow.publicKey,
        wallet.publicKey,
        connection,
    ]);

    const submitMessage = async (event) => {
        event.preventDefault();

        if (!canChat) {
            alert("Only the buyer or seller can send messages.");
            return;
        }

        const cleanMessage = message.trim();
        if (!cleanMessage) return;

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
            console.error("Send chat error:", sendError);

            setError(sendError?.message || "Failed to send message.");
        } finally {
            setSending(false);
        }
    };

    return (
        <section className="order-chat">
            <div className="order-chat-header">
                <h4>Order Chat</h4>
                <button type="button" onClick={loadMessages} disabled={loading}>
                    Refresh
                </button>
            </div>

            {error && <p className="order-chat-error">{error}</p>}

            <div className="order-chat-messages">
                {loading ? (
                    <p className="order-chat-empty">Loading messages...</p>
                ) : messages.length === 0 ? (
                    <p className="order-chat-empty">No messages yet.</p>
                ) : (
                    messages.map(chatMessage => {
                        const isMine = chatMessage.sender === walletAddress;
                        const senderLabel =
                            chatMessage.sender === escrow.partyA
                                ? "Buyer"
                                : chatMessage.sender === escrow.partyB
                                ? "Seller"
                                : shortenAddress(chatMessage.sender);

                        return (
                            <div
                                key={chatMessage.publicKey}
                                className={`order-chat-row${isMine ? " mine" : ""}`}
                            >
                                <div className={`order-chat-message${isMine ? " mine" : ""}`}>
                                    <div className="order-chat-sender">
                                        {isMine ? `You (${senderLabel})` : senderLabel}
                                    </div>
                                    <div className="order-chat-text">
                                        {chatMessage.message}
                                    </div>
                                    <div className="order-chat-date">
                                        {formatDate(chatMessage.createdAt)}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {canChat ? (
                <form className="order-chat-form" onSubmit={submitMessage}>
                    <textarea
                        value={message}
                        onChange={event => setMessage(event.target.value)}
                        maxLength={280}
                        rows={2}
                        placeholder="Type a message..."
                        disabled={sending}
                    />
                    <button type="submit" disabled={sending || !message.trim()}>
                        {sending ? "Sending..." : "Send"}
                    </button>
                </form>
            ) : (
                <p className="order-chat-disabled">
                    Only the buyer and seller can send messages.
                </p>
            )}

            <small className="order-chat-note">
                Each message creates an on-chain account. The sender pays the transaction fee and rent.
            </small>
        </section>
    );
}