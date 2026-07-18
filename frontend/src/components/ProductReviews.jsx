import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getProductReviews } from "../lib/review";

const shortAddress = (value) => {
  const text = value?.toBase58?.() || String(value || "");
  return text ? `${text.slice(0, 4)}...${text.slice(-4)}` : "";
};

export default function ProductReviews({ product, refreshToken = 0 }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [reviews, setReviews] = useState([]);
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReviews = useCallback(async () => {
    if (!product) return setLoading(false);
    try {
      setLoading(true);
      setError("");
      setReviews(await getProductReviews({ connection, wallet, product }));
    } catch (e) {
      console.error(e);
      setError(e?.message || "Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  }, [connection, wallet, product]);

  useEffect(() => { loadReviews(); }, [loadReviews, refreshToken]);

  const sorted = useMemo(() => {
    const rows = [...reviews];
    if (sort === "highest") rows.sort((a, b) => b.rating - a.rating || b.createdAt - a.createdAt);
    else if (sort === "lowest") rows.sort((a, b) => a.rating - b.rating || b.createdAt - a.createdAt);
    else rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  }, [reviews, sort]);

  const average = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <section className="product-reviews">
      <div className="reviews-heading">
        <div><h2>Product reviews</h2><p><strong>{average.toFixed(1)}</strong> ★ · {reviews.length} review{reviews.length === 1 ? "" : "s"}</p></div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Most recent</option>
          <option value="highest">Highest rating</option>
          <option value="lowest">Lowest rating</option>
        </select>
      </div>
      {loading && <p>Loading reviews...</p>}
      {error && <div><p className="review-error">{error}</p><button onClick={loadReviews}>Retry</button></div>}
      {!loading && !error && sorted.length === 0 && <p>No reviews yet.</p>}
      <div className="review-list">
        {sorted.map((review) => (
          <article className="review-card" key={review.publicKey.toBase58()}>
            <div className="review-card-header">
              <span className="review-stars">{"★".repeat(review.rating)}<span>{"★".repeat(5 - review.rating)}</span></span>
              <time>{new Date(review.createdAt * 1000).toLocaleDateString()}</time>
            </div>
            <p>{review.comment || "No written comment."}</p>
            <small>✓ Verified purchase · Buyer {shortAddress(review.reviewer)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
