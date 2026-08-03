import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import { useNetwork } from "../context/NetworkContext";
import { useTheme } from "../context/themeContext";
import OrderNotificationBadge from "./OrderNotificationBadge";

function MainNavigation({ className, linkClassName, onNavigate }) {
    return (
        <nav className={className}>
            <NavLink
                to="/"
                end
                onClick={onNavigate}
                className={({ isActive }) =>
                    `${linkClassName}${isActive ? " active" : ""}`
                }
            >
                Marketplace
            </NavLink>

            <NavLink
                to="/dashboard"
                onClick={onNavigate}
                className={({ isActive }) =>
                    `${linkClassName}${isActive ? " active" : ""}`
                }
            >
                Dashboard
            </NavLink>

            <NavLink
                to="/orders"
                onClick={onNavigate}
                className={({ isActive }) =>
                    `${linkClassName} orders-link${isActive ? " active" : ""}`
                }
            >
                Orders
                <OrderNotificationBadge />
            </NavLink>

            <NavLink
                to="/instructions"
                onClick={onNavigate}
                className={({ isActive }) =>
                    `${linkClassName}${isActive ? " active" : ""}`
                }
            >
                Instructions
            </NavLink>
        </nav>
    );
}

function Brand({ onNavigate }) {
    const { isMainnet } = useNetwork();

    return (
        <div className="app-brand">
            <NavLink
                to="/"
                className="app-logo"
                onClick={onNavigate}
            >
                SolBazaar
            </NavLink>

            <span
                className={`app-network-badge ${
                    isMainnet ? "mainnet" : "devnet"
                }`}
            >
                {isMainnet ? "Mainnet" : "Devnet"}
            </span>
        </div>
    );
}

function MenuButton({ open, onClick }) {
    return (
        <button
            type="button"
            className={`header-menu-button${open ? " open" : ""}`}
            onClick={onClick}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
        >
            <span />
            <span />
            <span />
        </button>
    );
}

export default function AppHeader({ onOpenNetworkSettings }) {
    const { theme, toggleTheme } = useTheme();
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        if (!menuOpen) return;

        const closeOnEscape = event => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        };

        window.addEventListener("keydown", closeOnEscape);

        return () => {
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [menuOpen]);

    const closeMenu = () => {
        setMenuOpen(false);
    };

    const openNetworkSettings = () => {
        closeMenu();
        onOpenNetworkSettings();
    };

    const changeTheme = () => {
        toggleTheme();
        closeMenu();
    };

    return (
        <header className="app-header">
            <div className="desktop-header">
                <div className="desktop-header-inner">
                    <Brand />

                    <MainNavigation
                        className="desktop-nav"
                        linkClassName="desktop-nav-link"
                    />

                    <div className="desktop-actions">
                        <button
                            type="button"
                            className="header-action-button"
                            onClick={openNetworkSettings}
                        >
                            Network Settings
                        </button>

                        <button
                            type="button"
                            className="header-action-button"
                            onClick={toggleTheme}
                        >
                            {theme === "dark" ? "Light" : "Dark"}
                        </button>

                        <NavLink
                            to="/seller"
                            className="header-seller-link"
                        >
                            Become a Seller
                        </NavLink>

                        <WalletMultiButton />
                    </div>
                </div>
            </div>

            <div className="tablet-header">
                <div className="tablet-header-top">
                    <Brand onNavigate={closeMenu} />

                    <MenuButton
                        open={menuOpen}
                        onClick={() => setMenuOpen(current => !current)}
                    />
                </div>

                <MainNavigation
                    className="tablet-nav"
                    linkClassName="tablet-nav-link"
                    onNavigate={closeMenu}
                />

                {menuOpen && (
                    <div className="header-dropdown">
                        <button
                            type="button"
                            onClick={openNetworkSettings}
                        >
                            Network Settings
                        </button>

                        <button
                            type="button"
                            onClick={changeTheme}
                        >
                            Switch to {theme === "dark" ? "Light" : "Dark"} Mode
                        </button>

                        <NavLink
                            to="/seller"
                            onClick={closeMenu}
                        >
                            Become a Seller
                        </NavLink>

                        <div className="header-dropdown-wallet">
                            <WalletMultiButton />
                        </div>
                    </div>
                )}
            </div>

            <div className="mobile-header">
                <div className="mobile-header-top">
                    <Brand onNavigate={closeMenu} />

                    <MenuButton
                        open={menuOpen}
                        onClick={() => setMenuOpen(current => !current)}
                    />
                </div>

                {menuOpen && (
                    <div className="header-dropdown">
                        <button
                            type="button"
                            onClick={openNetworkSettings}
                        >
                            Network Settings
                        </button>

                        <button
                            type="button"
                            onClick={changeTheme}
                        >
                            Switch to {theme === "dark" ? "Light" : "Dark"} Mode
                        </button>

                        <NavLink
                            to="/seller"
                            onClick={closeMenu}
                        >
                            Become a Seller
                        </NavLink>

                        <div className="header-dropdown-wallet">
                            <WalletMultiButton />
                        </div>
                    </div>
                )}

                <MainNavigation
                    className="mobile-nav"
                    linkClassName="mobile-nav-link"
                    onNavigate={closeMenu}
                />
            </div>
        </header>
    );
}