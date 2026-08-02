import { useEffect, useState } from "react";
import { Connection } from "@solana/web3.js";
import { useNetwork } from "../context/NetworkContext";

import "./NetworkSettingsModal.css";

export default function NetworkSettingsModal({ open, onClose }) {
    const {
        rpcUrl,
        setRpcUrl,
        resetRpcUrl,
        defaultRpcUrl,
        fallbackRpcUrls,
    } = useNetwork();

    const [input, setInput] = useState(rpcUrl);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState("");
    const [statusType, setStatusType] = useState("");

    useEffect(() => {
        if (!open) return;

        setInput(rpcUrl);
        setStatus("");
        setStatusType("");
    }, [open, rpcUrl]);

    useEffect(() => {
        if (!open) return;

        const handleEscape = event => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [open, onClose]);

    const testRpc = async value => {
        const url = String(value || "").trim();

        if (!url) {
            setStatus("Enter an RPC URL.");
            setStatusType("error");
            return false;
        }

        try {
            setTesting(true);
            setStatus("Testing RPC connection...");
            setStatusType("");

            const connection = new Connection(url, "confirmed");
            const version = await connection.getVersion();

            setStatus(
                `Connection successful. Solana core ${version["solana-core"] || "unknown"}.`
            );
            setStatusType("success");

            return true;
        } catch (error) {
            console.error("RPC test failed:", error);

            setStatus(
                error?.message ||
                "Unable to connect to this RPC endpoint."
            );
            setStatusType("error");

            return false;
        } finally {
            setTesting(false);
        }
    };

    const saveRpc = async event => {
        event.preventDefault();

        const nextRpcUrl = input.trim();
        const working = await testRpc(nextRpcUrl);

        if (!working) return;

        setRpcUrl(nextRpcUrl);
        setStatus("RPC saved and applied.");
        setStatusType("success");
    };

    const restoreDefault = () => {
        resetRpcUrl();
        setInput(defaultRpcUrl);
        setStatus("Default RPC restored.");
        setStatusType("success");
    };

    if (!open) return null;

    return (
        <div
            className="network-modal-backdrop"
            onMouseDown={event => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className="network-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="network-modal-title"
            >
                <div className="network-modal-header">
                    <div>
                        <h2 id="network-modal-title">Network Settings</h2>
                        <p>
                            Choose the Solana Devnet RPC used by the marketplace.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="network-modal-close"
                        onClick={onClose}
                        aria-label="Close network settings"
                    >
                        Close
                    </button>
                </div>

                <div className="network-modal-current">
                    <span>Current RPC</span>
                    <code title={rpcUrl}>{rpcUrl}</code>
                </div>

                <form onSubmit={saveRpc}>
                    <label htmlFor="network-rpc-url">
                        RPC URL
                    </label>

                    <input
                        id="network-rpc-url"
                        type="url"
                        value={input}
                        placeholder="https://your-solana-rpc.example"
                        disabled={testing}
                        onChange={event => {
                            setInput(event.target.value);
                            setStatus("");
                            setStatusType("");
                        }}
                    />

                    <p className="network-modal-help">
                        The selected RPC is stored only in this browser.
                    </p>

                    <div className="network-modal-actions">
                        <button
                            type="button"
                            className="network-modal-secondary"
                            disabled={testing}
                            onClick={() => testRpc(input)}
                        >
                            {testing ? "Testing..." : "Test RPC"}
                        </button>

                        <button
                            type="submit"
                            className="network-modal-primary"
                            disabled={testing}
                        >
                            Save
                        </button>

                        <button
                            type="button"
                            className="network-modal-secondary"
                            disabled={testing}
                            onClick={restoreDefault}
                        >
                            Restore Default
                        </button>
                    </div>
                </form>

                {status && (
                    <div
                        className={`network-modal-status ${
                            statusType ? `network-modal-status-${statusType}` : ""
                        }`}
                    >
                        {status}
                    </div>
                )}

                <p className="network-modal-warning">
                    RPC providers can observe wallet addresses, account requests,
                    and submitted transactions. Use a provider you trust.
                </p>
            </div>
        </div>
    );
}