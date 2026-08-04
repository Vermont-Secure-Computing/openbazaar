import { GITHUB_REPO, DONATION_ADDRESS, SITE_NAME } from "../config/site";
import "./Footer.css";

export default function Footer() {
    async function copyDonationAddress() {
        try {
            await navigator.clipboard.writeText(
                DONATION_ADDRESS
            );
        } catch (error) {
            console.error(error);
        }
    }

    return (
        <footer className="footer">
            <div className="footer-inner">

                <div className="footer-column">
                    <h3>{SITE_NAME}</h3>

                    <p>
                        An open-source decentralized marketplace
                        built on Solana.
                    </p>
                </div>

                <div className="footer-column">
                    <h4>Donation Address</h4>

                    <div className="footer-address">
                        <code>{DONATION_ADDRESS}</code>

                        <button
                            type="button"
                            onClick={copyDonationAddress}
                        >
                            Copy
                        </button>
                    </div>
                </div>

                <div className="footer-column">
                    <h4>GitHub Repository</h4>

                    <a
                        href={GITHUB_REPO}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {GITHUB_REPO}
                    </a>
                </div>

            </div>

            <div className="footer-bottom">
                © {new Date().getFullYear()} {SITE_NAME}
            </div>
        </footer>
    );
}