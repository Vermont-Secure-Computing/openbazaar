import React from "react";

export default function StarRatingInput({ value, onChange, disabled = false }) {
  return (
    <div className="review-stars-input" role="radiogroup" aria-label="Product rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          type="button"
          key={star}
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          className={star <= value ? "star active" : "star"}
          disabled={disabled}
          onClick={() => onChange(star)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
