import React, { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getMerchantReputation, initializeMerchantReputation } from "../lib/review";

export default function SellerReputation({ merchantAuthority, allowInitialize = false }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [reputation, setReputation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!merchantAuthority || !wallet.publicKey) return setLoading(false);
    try {
      setLoading(true);
      setError("");
      setReputation(await getMerchantReputation({ connection, wallet, merchantAuthority }));
    } catch (e) {
      console.error(e);
      setError(e?.message || "Unable to load seller reputation.");
    } finally {
      setLoading(false);
    }
  }, [connection, wallet, merchantAuthority]);

  useEffect(() => { load(); }, [load]);

  async function initialize() {
    try {
      setInitializing(true);
      setError("");
      await initializeMerchantReputation({ connection, wallet, merchantAuthority });
      await load();
    } catch (e) {
      console.error(e);
      setError(e?.error?.errorMessage || e?.message || "Unable to initialize reputation.");
    } finally {
      setInitializing(false);
    }
  }

  if (loading) return <p>Loading seller reputation...</p>;
  if (!reputation) return (
    <section className="seller-reputation">
      <h3>Seller reputation</h3><p>No seller reviews yet.</p>
      {allowInitialize && <button onClick={initialize} disabled={initializing || !wallet.publicKey}>{initializing ? "Initializing..." : "Initialize Reputation"}</button>}
      {error && <p className="review-error">{error}</p>}
    </section>
  );

  const rows = [[5,reputation.fiveStar],[4,reputation.fourStar],[3,reputation.threeStar],[2,reputation.twoStar],[1,reputation.oneStar]];
  return (
    <section className="seller-reputation">
      <h3>Seller reputation</h3>
      <div className="seller-rating-summary"><strong>{reputation.averageRating.toFixed(1)} ★</strong><span>{reputation.totalReviews} review{reputation.totalReviews === 1 ? "" : "s"}</span></div>
      <div className="rating-breakdown">
        {rows.map(([stars,count]) => {
          const percent = reputation.totalReviews ? count / reputation.totalReviews * 100 : 0;
          return <div className="rating-row" key={stars}><span>{stars} ★</span><progress max="100" value={percent}/><span>{count}</span></div>;
        })}
      </div>
      {error && <p className="review-error">{error}</p>}
    </section>
  );
}
