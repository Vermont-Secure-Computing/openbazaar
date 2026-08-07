import { useEffect, useState } from "react";
import "./DisclaimerModal.css";

const DISCLAIMER_KEY = "solzaar_disclaimer_accepted";

export default function DisclaimerModal() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const accepted = localStorage.getItem(DISCLAIMER_KEY);
        if (!accepted) setShow(true);
    }, []);

    const accept = () => {
        localStorage.setItem(DISCLAIMER_KEY, "true");
        setShow(false);
    };

    if (!show) return null;

    return (
        <div className="disclaimer-overlay">
            <section className="disclaimer-modal" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
                <div className="disclaimer-heading">
                    <div className="disclaimer-warning">!</div>

                    <div>
                        <h2 id="disclaimer-title">SOLZAAR - UNFILTERED ACCESS</h2>
                        <p>
                            This is a permissionless, serverless interface to a public Solana program. There is no backend, no admin keys, and no ability to censor, reverse, or modify any transaction once submitted.
                        </p>
                    </div>
                </div>

                <div className="disclaimer-agreement">
                    <strong>By continuing, you agree that:</strong>

                    <ul>
                        <li>All on-chain content is the sole responsibility of its originator.</li>
                        <li>We are not liable for any content, losses, or smart contract exploits.</li>
                        <li>You assume 100% of the risk associated with interacting with this contract.</li>
                    </ul>
                </div>

                <div className="disclaimer-actions">
                    <button type="button" onClick={accept}>I Agree</button>
                </div>
            </section>
        </div>
    );
}