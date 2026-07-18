import React, { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { hasOrderReview, submitProductReview } from "../lib/review";
import StarRatingInput from "./StarRatingInput";

export default function ReviewForm({ escrow, product, merchantAuthority, orderCompleted, onSubmitted, onStatusChange }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [checking, setChecking] = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!escrow) return setChecking(false);
      try {
        setChecking(true);
        const result = await hasOrderReview({ connection, escrow });
        if (!cancelled) {
          setAlreadyReviewed(result.exists);
          onStatusChange?.(result.exists);
        }
      } catch (error) {
        if (!cancelled) setMessage(error?.message || "Unable to check review.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [connection, escrow, onStatusChange]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!wallet.publicKey) return setMessage("Connect the buyer wallet first.");
    if (!orderCompleted) return setMessage("The order must be completed first.");

    try {
      setSubmitting(true);
      setMessage("");
      const result = await submitProductReview({
        connection,
        wallet,
        escrow,
        product,
        merchantAuthority,
        rating,
        comment,
      });
      setAlreadyReviewed(true);
      onStatusChange?.(true);
      setMessage(`Review submitted. Transaction: ${result.signature}`);
      if (onSubmitted) await onSubmitted(result);
    } catch (error) {
      console.error(error);
      setMessage(error?.error?.errorMessage || error?.message || "Unable to submit review.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!orderCompleted) return null;
  if (checking) return <p>Checking review status...</p>;
  if (alreadyReviewed) return <section className="review-form-card"><h3>Your review</h3><p>✓ You already reviewed this order.</p></section>;

  return (
    <section className="review-form-card">
      <h3>Review this product</h3>
      <p className="review-muted">Verified purchase · One review per completed order</p>
      <form onSubmit={handleSubmit}>
        <StarRatingInput value={rating} onChange={setRating} disabled={submitting} />
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={280}
          placeholder="Describe the product quality and your experience."
          rows={5}
          disabled={submitting}
        />
        <div className="review-form-footer">
          <span>{comment.length}/280</span>
          <button type="submit" disabled={submitting}>{submitting ? "Submitting..." : "Submit Review"}</button>
        </div>
      </form>
      {message && <p className="review-message">{message}</p>}
    </section>
  );
}
