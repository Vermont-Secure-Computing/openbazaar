import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useNavigate } from "react-router-dom";
import { getProduct } from "../lib/product";
import { getMerchants } from "../lib/merchant";
import { createBuyOrder } from "../lib/buyOrder";
import { getMerchantReputation } from "../lib/reputation";
import TransactionPreview from "../components/TransactionPreview";
import ProductReviews from "../components/ProductReviews";
import "../components/review.css";
import "../components/TransactionPreview.css";
import "./ProductPage.css";

export default function ProductPage() {
  const { product } = useParams();
  const { connection } = useConnection();
  const wallet = useWallet();

  const [item, setItem] = useState(null);
  const [merchant, setMerchant] = useState(null);
  const [buying, setBuying] = useState(false);
  const [reputation, setReputation] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [transactionPreviewOpen, setTransactionPreviewOpen] = useState(false);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerPrice, setOfferPrice] = useState("");
  const [checkoutMode, setCheckoutMode] = useState("buy");
  const [offeredLamports, setOfferedLamports] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const p = await getProduct(product);

        if (cancelled) {
          return;
        }

        setItem(p);
        setSelectedImageIndex(0);

        if (!p) {
          return;
        }

        const merchants = await getMerchants();

        if (cancelled) {
          return;
        }

        const productMerchant =
          p.merchant?.toBase58?.() ??
          p.merchant?.toString?.() ??
          String(p.merchant ?? "");

        const matchedMerchant = merchants.find((entry) => {
          const authority =
            entry.authority?.toBase58?.() ??
            entry.authority?.toString?.() ??
            String(entry.authority ?? "");

          return authority === productMerchant;
        });

        setMerchant(matchedMerchant || null);

        if (matchedMerchant) {
          const rep = await getMerchantReputation({
            connection,
            wallet,
            merchantAuthority: matchedMerchant.authority,
          });

          if (!cancelled) {
            setReputation(rep);
          }
        }
      } catch (error) {
        console.error("Failed to load product:", error);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [product, connection]);

  if (!item) {
    return <div style={{ padding: 24 }}>Loading product...</div>;
  }

  const productImages = Array.isArray(item.imageUris)
    ? item.imageUris.filter(
        (imageUri) => typeof imageUri === "string" && imageUri.trim(),
      )
    : item.imageUri
      ? [item.imageUri]
      : [];

  const selectedImage =
    productImages[selectedImageIndex] || productImages[0] || null;

  const unitPriceLamports = Number(item.price ?? 0);

  const availableStock = Number(item.stock ?? 0);

  const safeQuantity =
    Number.isInteger(quantity) && quantity >= 1
      ? Math.min(quantity, Math.max(availableStock, 1))
      : 1;

  const productPriceLamports = unitPriceLamports * safeQuantity;

  const depositBps = Number(
    item.sellerDepositBpsOverride ?? merchant?.sellerDepositBps ?? 2000,
  );

  const calculatedDepositLamports = Math.floor(
    (productPriceLamports * depositBps) / 10_000,
  );

  const securityDepositLamports =
    calculatedDepositLamports === 0 ? 1 : calculatedDepositLamports;

  const buyerTotalLamports = productPriceLamports + securityDepositLamports;

  /**
   * Variables for product page design enhancement
   */
  const soldCount = Number(item.sold ?? 0);
  const averageRating = Number(item.averageRating ?? reputation?.average ?? 0);
  const totalReviews = Number(
    item.totalReviews ?? reputation?.totalReviews ?? 0,
  );

  const stockLabel =
    availableStock <= 0
      ? "Out of Stock"
      : availableStock <= 5
        ? `Only ${availableStock} left`
        : "In Stock";

  const stockColor =
    availableStock <= 0
      ? "#fca5a5"
      : availableStock <= 5
        ? "#fcd34d"
        : "#86efac";

  const stockBackground =
    availableStock <= 0
      ? "#450a0a"
      : availableStock <= 5
        ? "#422006"
        : "#052e16";

  const buyDisabled =
    availableStock <= 0 ||
    buying ||
    !merchant ||
    !Number.isInteger(Number(quantity)) ||
    Number(quantity) < 1 ||
    Number(quantity) > availableStock;

  const buyNow = async () => {
    if (!wallet.publicKey) {
      alert("Connect your wallet first.");
      return;
    }

    if (!item || !merchant) {
      alert("Product or merchant information is unavailable.");
      return;
    }

    const stock = Number(item.stock ?? 0);

    if (stock <= 0) {
      alert("This product is out of stock.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      alert("Enter a valid quantity.");
      return;
    }

    if (quantity > stock) {
      alert(`Only ${stock} item${stock === 1 ? "" : "s"} available.`);
      return;
    }

    const buyerAddress = wallet.publicKey.toBase58();

    const sellerAddress =
      merchant.authority?.toBase58?.() ??
      merchant.authority?.toString?.() ??
      merchant.authority;

    if (!sellerAddress) {
      alert("Merchant wallet address is unavailable.");
      return;
    }

    if (buyerAddress === sellerAddress) {
      alert("You cannot buy your own product.");
      return;
    }

    setCheckoutMode("buy");
    setOfferedLamports(null);

    setTransactionPreviewOpen(true);
  };

  const confirmBuy = async () => {
    setTransactionPreviewOpen(false);
    try {
      setBuying(true);

      /*
       * One wallet signing:
       *
       * 1. Create external escrow
       * 2. Deposit product price + buyer bond
       * 3. Create SolBazaar PurchaseOffer
       *
       * OrderRecord is created only when seller accepts.
       */
      const orderResult = await createBuyOrder({
        connection,
        wallet,
        product: item,
        merchant,
        quantity,
        checkoutMode,
        offeredUnitPriceLamports:
          checkoutMode === "offer" ? offeredLamports : null,
      });

      console.log("Order created:", orderResult);

      const escrowAddress = orderResult?.escrowPda;
      const purchaseOfferAddress = orderResult?.purchaseOffer;
      const signature = orderResult?.signature;

      if (!escrowAddress) {
        throw new Error("Escrow address was not returned.");
      }

      if (!purchaseOfferAddress) {
        throw new Error("PurchaseOffer address was not returned.");
      }

      console.log("Redirecting to PurchaseOffer details:", {
        escrowAddress,
        purchaseOfferAddress,
        signature,
      });

      navigate(`/orders/buyer/${escrowAddress}`, {
        replace: true,
        state: {
          newlyCreated: true,
          signature,
          purchaseOfferAddress,
        },
      });
    } catch (error) {
      console.error("Buy now error:", error);

      const message =
        error?.error?.errorMessage ||
        error?.message ||
        "Failed to create escrow order.";

      alert(message);
    } finally {
      setBuying(false);
    }
  };

  return (
    <main className="product-page">
      <div className="product-shell">
        <Link to="/" className="product-back">
          ← Back to Marketplace
        </Link>

        <div className="product-layout">
          <section>
            <div className="product-card">
              <div className="product-image-wrap">
                {soldCount > 0 && (
                  <span className="product-sold-badge">{soldCount} sold</span>
                )}

                {selectedImage ? (
                  <img
                    src={selectedImage}
                    alt={`${item.title} image ${selectedImageIndex + 1}`}
                    className="product-image"
                  />
                ) : (
                  <div className="product-no-image">No product image</div>
                )}

                {productImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="product-gallery-arrow previous"
                      aria-label="Previous image"
                      onClick={() =>
                        setSelectedImageIndex((current) =>
                          current === 0
                            ? productImages.length - 1
                            : current - 1,
                        )
                      }
                    >
                      ‹
                    </button>

                    <button
                      type="button"
                      className="product-gallery-arrow next"
                      aria-label="Next image"
                      onClick={() =>
                        setSelectedImageIndex((current) =>
                          current === productImages.length - 1
                            ? 0
                            : current + 1,
                        )
                      }
                    >
                      ›
                    </button>

                    <span className="product-image-counter">
                      {selectedImageIndex + 1} / {productImages.length}
                    </span>
                  </>
                )}
              </div>
            </div>

            {productImages.length > 1 && (
              <div className="product-thumbnails">
                {productImages.map((imageUri, index) => (
                  <button
                    key={`${imageUri}-${index}`}
                    type="button"
                    aria-label={`View image ${index + 1}`}
                    className={`product-thumbnail ${selectedImageIndex === index ? "active" : ""}`}
                    onClick={() => setSelectedImageIndex(index)}
                  >
                    <img
                      src={imageUri}
                      alt={`${item.title} thumbnail ${index + 1}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="product-card product-purchase">
            <div className="product-badges">
              <span
                className="product-badge stock"
                style={{
                  "--stock-color": stockColor,
                  "--stock-background": stockBackground,
                }}
              >
                {stockLabel}
              </span>

              {merchant?.shipsFrom && (
                <span className="product-badge shipping">
                  Ships from {merchant.shipsFrom}
                </span>
              )}
            </div>

            <h1 className="product-title">{item.title}</h1>

            <div className="product-rating">
              <span className="product-stars">★</span>
              <strong>{averageRating.toFixed(1)}</strong>
              <span>
                ({totalReviews} review{totalReviews === 1 ? "" : "s"})
              </span>
              <span>{soldCount} sold</span>
            </div>

            <h2 className="product-price">
              {(unitPriceLamports / LAMPORTS_PER_SOL).toFixed(3)} SOL
            </h2>

            <p className="product-muted product-price-label">Price per item</p>

            <div className="product-meta">
              <div className="product-meta-item">
                <span className="product-meta-label">Category</span>
                <strong>{item.category || "Uncategorized"}</strong>
              </div>

              <div className="product-meta-item">
                <span className="product-meta-label">Stock</span>
                <strong style={{ color: stockColor }}>
                  {availableStock} item{availableStock === 1 ? "" : "s"}
                </strong>
              </div>
            </div>

            {availableStock > 0 && (
              <div className="product-quantity">
                <div>
                  <strong>Quantity</strong>
                  <div className="product-available">
                    {availableStock} available
                  </div>
                </div>

                <div className="quantity-controls">
                  <button
                    type="button"
                    disabled={buying || Number(quantity) <= 1}
                    onClick={() =>
                      setQuantity((current) => Math.max(1, Number(current) - 1))
                    }
                  >
                    −
                  </button>

                  <input
                    type="number"
                    min="1"
                    max={availableStock}
                    step="1"
                    value={quantity}
                    disabled={buying}
                    onChange={(event) => {
                      const value = event.target.value;

                      if (value === "") {
                        setQuantity("");
                        return;
                      }

                      const nextQuantity = Number(value);

                      if (Number.isInteger(nextQuantity)) {
                        setQuantity(
                          Math.min(Math.max(nextQuantity, 1), availableStock),
                        );
                      }
                    }}
                    onBlur={() => {
                      const parsed = Number(quantity);

                      if (!Number.isInteger(parsed) || parsed < 1) {
                        setQuantity(1);
                      } else if (parsed > availableStock) {
                        setQuantity(availableStock);
                      }
                    }}
                  />

                  <button
                    type="button"
                    disabled={buying || Number(quantity) >= availableStock}
                    onClick={() =>
                      setQuantity((current) =>
                        Math.min(Number(current) + 1, availableStock),
                      )
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            <div className="escrow-notice">
              <strong>Escrow Protection</strong>
              <p>
                Payment is released to the seller only after you confirm
                delivery.
              </p>
            </div>

            <div className="product-breakdown">
              <div className="product-breakdown-header">
                <strong>Order Summary</strong>
              </div>
              <div className="product-breakdown-row">
                <span className="product-muted">
                  Product{safeQuantity > 1 ? ` * ${safeQuantity}` : ""}
                </span>
                <strong>
                  {(productPriceLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
                </strong>
              </div>
              <div className="product-breakdown-row">
                <span className="product-muted">
                  Refundable buyer deposit ({(depositBps / 100).toFixed(1)}%)
                </span>
                <strong>
                  {(securityDepositLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
                </strong>
              </div>

              <div className="product-total">
                <strong>You will need</strong>
                <strong>
                  {(buyerTotalLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
                </strong>
              </div>

              <p className="product-deposit-note">
                The buyer deposit is held in escrow and returned when the order
                completes normally.
              </p>
            </div>

            <button
              type="button"
              className="product-buy-button"
              onClick={buyNow}
              disabled={buyDisabled}
            >
              {availableStock <= 0
                ? "Out of Stock"
                : buying
                  ? "Creating Order..."
                  : `Buy ${safeQuantity} ${safeQuantity === 1 ? "Item" : "Items"}`}
            </button>

            <button
              type="button"
              className="product-buy-button"
              style={{
                marginTop: 12,
                background: "transparent",
                border: "1px solid #38bdf8",
                color: "#38bdf8",
              }}
              onClick={() => {
                setOfferPrice("");
                setOfferModalOpen(true);
              }}
              disabled={buyDisabled}
            >
              Make Offer
            </button>

            <div className="product-after-buy">
              <strong>What happens after you buy?</strong>

              <ol>
                <li>
                  Your payment and refundable deposit are locked in escrow.
                </li>

                <li>
                  The seller accepts the order and provides their required
                  deposit.
                </li>

                <li>The seller prepares and sends your order.</li>

                <li>
                  After receiving it, you confirm receipt to complete the order.
                </li>
              </ol>

              <Link to="/instructions" className="product-learn-more">
                Learn how escrow works →
              </Link>
            </div>
          </aside>
        </div>

        <div className="product-details-grid">
          <section className="product-card product-section">
            <h2 className="product-section-title">Description</h2>
            <p className="product-description">
              {item.description || "No description provided."}
            </p>
          </section>

          <section className="product-card product-section">
            <div className="seller-title-row">
              <h2 className="product-section-title">Sold by</h2>
            </div>

            {merchant ? (
              <>
                <div className="seller-header">
                  <div className="seller-avatar">
                    {(merchant.storeName || "S").slice(0, 1).toUpperCase()}
                  </div>

                  <div className="seller-info">
                    <div className="seller-name-row">
                      <strong className="seller-name">
                        {merchant.storeName}
                      </strong>

                      <span className="seller-rating-inline">
                        ★ {averageRating.toFixed(1)}
                      </span>
                    </div>

                    <div className="seller-review-count">
                      {totalReviews} review
                      {totalReviews === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                <div className="seller-stats seller-stats-compact">
                  <div className="seller-stat">
                    <strong>{soldCount}</strong>
                    <div className="seller-stat-label">Sold</div>
                  </div>

                  <div className="seller-stat">
                    <strong>{merchant.shipsFrom || "—"}</strong>
                    <div className="seller-stat-label">Ships from</div>
                  </div>
                </div>

                <Link
                  to={`/merchant/${merchant.authority}`}
                  className="seller-visit-link"
                >
                  Visit Store
                </Link>
              </>
            ) : (
              <p className="product-muted">
                Seller information is unavailable.
              </p>
            )}
          </section>
        </div>

        <section className="product-reviews">
          <ProductReviews product={item.publicKey || product} />
        </section>
      </div>

      {offerModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="offer-title"
            style={{
              background: "#142033",
              color: "#fff",
              padding: 24,
              borderRadius: 12,
              width: "100%",
              maxWidth: 420,
              display: "grid",
              gap: 14,
            }}
          >
            <h2 id="offer-title">Make an Offer</h2>

            <p>
              Listed price: {(unitPriceLamports / LAMPORTS_PER_SOL).toFixed(4)}{" "}
              SOL
            </p>

            <label htmlFor="offer-price">Your offer per item (SOL)</label>

            <input
              id="offer-price"
              type="text"
              inputMode="decimal"
              placeholder="0.040"
              value={offerPrice}
              onChange={(event) => setOfferPrice(event.target.value)}
              style={{
                padding: 12,
                borderRadius: 8,
                color: "#111",
              }}
            />

            <p>Quantity: {safeQuantity}</p>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setOfferModalOpen(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  backgroundColor: "#334155",
                  color: "#ffffff",
                  border: "1px solid #64748b",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    if (!wallet.publicKey) {
                      throw new Error("Connect your wallet first.");
                    }

                    if (!merchant || !item) {
                      throw new Error("Product or merchant unavailable.");
                    }

                    if (
                      !Number.isInteger(quantity) ||
                      quantity < 1 ||
                      quantity > availableStock
                    ) {
                      throw new Error(
                        "Invalid quantity or insufficient stock.",
                      );
                    }

                    const sellerAddress =
                      merchant.authority?.toBase58?.() ??
                      merchant.authority?.toString?.() ??
                      String(merchant.authority ?? "");

                    if (wallet.publicKey.toBase58() === sellerAddress) {
                      throw new Error("You cannot offer on your own product.");
                    }

                    // Convert SOL to lamports precisely
                    const input = offerPrice.trim();

                    if (!/^\d+(\.\d{1,9})?$/.test(input)) {
                      throw new Error("Enter a valid SOL amount.");
                    }

                    const [whole, fraction = ""] = input.split(".");

                    const lamports =
                      BigInt(whole) * 1000000000n +
                      BigInt(fraction.padEnd(9, "0"));

                    const listed = BigInt(item.price.toString());

                    if (lamports <= 0n || lamports >= listed) {
                      throw new Error(
                        "Offer must be greater than zero and below the listed price.",
                      );
                    }

                    setOfferedLamports(lamports.toString());
                    setCheckoutMode("offer");
                    setOfferModalOpen(false);
                    setTransactionPreviewOpen(true);
                  } catch (error) {
                    alert(error.message);
                  }
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  backgroundColor: "#0284c7",
                  color: "#ffffff",
                  border: "1px solid #0284c7",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Review Offer
              </button>
            </div>
          </div>
        </div>
      )}

      <TransactionPreview
        open={transactionPreviewOpen}
        title={checkoutMode === "offer" ? "Confirm Offer" : "Confirm Purchase"}
        description={
          checkoutMode === "offer"
            ? `You are offering ${offerPrice} SOL per item for ${safeQuantity} item${safeQuantity === 1 ? "" : "s"}.`
            : `You are about to purchase ${safeQuantity} item${safeQuantity === 1 ? "" : "s"} at the listed price.`
        }
        rows={(() => {
          const price =
            checkoutMode === "offer" && offeredLamports !== null
              ? BigInt(offeredLamports)
              : BigInt(item.price.toString());

          const total = price * BigInt(safeQuantity);

          const calculatedDeposit = (total * BigInt(depositBps)) / 10000n;

          const deposit = calculatedDeposit > 0n ? calculatedDeposit : 1n;

          const required = total + deposit;

          const toSol = (value) =>
            (Number(value) / LAMPORTS_PER_SOL).toFixed(4) + " SOL";

          return [
            {
              label:
                checkoutMode === "offer"
                  ? "Offered unit price"
                  : "Listed unit price",
              value: toSol(price),
            },
            {
              label: `Product total × ${safeQuantity}`,
              value: toSol(total),
            },
            {
              label: "Refundable buyer deposit",
              value: toSol(deposit),
            },
            {
              label: "Total required",
              value: toSol(required),
              emphasis: true,
            },
          ];
        })()}
        explanation={
          checkoutMode === "offer"
            ? "Your negotiated offer and refundable buyer deposit will be locked in escrow. The seller must accept your offer before the order proceeds."
            : "Your payment and refundable buyer deposit will be locked in escrow. The seller must accept before the order proceeds."
        }
        processing={buying}
        confirmLabel="Continue to Wallet"
        onConfirm={confirmBuy}
        onCancel={() => {
          if (!buying) {
            setTransactionPreviewOpen(false);
          }
        }}
      />
    </main>
  );
}
