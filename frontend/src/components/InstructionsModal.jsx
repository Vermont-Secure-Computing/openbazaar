import { useEffect, useState } from "react";
import InstructionsContent from "./InstructionsContent";
import "../pages/InstructionsPage.css";
import "./InstructionsModal.css";

const STORAGE_KEY = "solzaar:instructionsModalDismissed";

export default function InstructionsModal() {
    const [open, setOpen] = useState(false);
    const [doNotDisplayAgain, setDoNotDisplayAgain] = useState(false);

    useEffect(() => {
        const dismissed = localStorage.getItem(STORAGE_KEY) === "true";
        if (!dismissed) setOpen(true);
    }, []);

    useEffect(() => {
        if (!open) return;

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = event => {
            if (event.key === "Escape") closeModal();
        };

        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, doNotDisplayAgain]);

    const closeModal = () => {
        if (doNotDisplayAgain) {
            localStorage.setItem(STORAGE_KEY, "true");
        }
        setOpen(false);
    };

    if (!open) return null;

    return (
        <div className="instructions-modal-overlay">
            <section
                className="instructions-modal"
                role="dialog"
                aria-modal="true"
                aria-label="SolZaar instructions"
            >
                <header className="instructions-modal-top">
                    <span>Instructions</span>
                    <button
                        type="button"
                        className="instructions-modal-top-close"
                        onClick={closeModal}
                    >
                        Close
                    </button>
                </header>

                <div className="instructions-modal-content">
                    <InstructionsContent />
                </div>

                <footer className="instructions-modal-footer">
                    <label className="instructions-modal-checkbox">
                        <input
                            type="checkbox"
                            checked={doNotDisplayAgain}
                            onChange={event =>
                                setDoNotDisplayAgain(event.target.checked)
                            }
                        />
                        <span>Do not display again</span>
                    </label>

                    <button
                        type="button"
                        className="instructions-modal-footer-close"
                        onClick={closeModal}
                    >
                        Close
                    </button>
                </footer>
            </section>
        </div>
    );
}