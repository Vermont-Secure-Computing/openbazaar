import { Link } from "react-router-dom";

export default function ProductList({
    products,
    search,
    page,
    itemsPerPage,
    onPageChange,
    loading,
}) {
    const query = search.trim().toLowerCase();

    const filteredProducts = products.filter(product => {
        if (!query) return true;

        const title = product.title?.toLowerCase() || "";
        const description = product.description?.toLowerCase() || "";
        const category = product.category?.toLowerCase() || "";

        return (
            title.includes(query) ||
            description.includes(query) ||
            category.includes(query)
        );
    });

    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));

    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;

    const paginatedProducts = filteredProducts.slice(
        startIndex,
        startIndex + itemsPerPage
    );

    if (loading) {
        return (
            <div className="marketplace-message">
                Loading products...
            </div>
        );
    }

    if (filteredProducts.length === 0) {
        return (
            <div className="marketplace-message">
                No products found.
            </div>
        );
    }

    return (
        <section className="marketplace-products">
            <div className="marketplace-section-header">
                <h2>Products</h2>

                <span className="marketplace-result-count">
                    {filteredProducts.length}{" "}
                    {filteredProducts.length === 1 ? "product" : "products"}
                </span>
            </div>

            <div className="marketplace-product-grid">
                {paginatedProducts.map(product => {
                    const productAddress =
                        product.publicKey?.toBase58?.() ??
                        product.publicKey?.toString?.() ??
                        String(product.publicKey ?? "");

                    const image = Array.isArray(product.imageUris) && product.imageUris.length > 0 ? product.imageUris[0] : "";

                    return (
                        <Link
                            key={productAddress}
                            to={`/product/${productAddress}`}
                            className="marketplace-product-card"
                        >
                            <div className="marketplace-product-image-wrap">
                                {image ? (
                                    <img
                                        src={image}
                                        alt={product.title || "Product"}
                                        className="marketplace-product-image"
                                    />
                                ) : (
                                    <div className="marketplace-product-no-image">
                                        No Image
                                    </div>
                                )}
                            </div>

                            <div className="marketplace-product-body">
                                <h3>{product.title || "Untitled Product"}</h3>

                                <div className="marketplace-product-meta">
                                    <span>
                                        {Number(product.averageRating || 0).toFixed(1)} ★
                                    </span>

                                    <span>
                                        {Number(product.stock ?? 0)} available
                                    </span>
                                </div>

                                <strong className="marketplace-product-price">
                                    {Number(product.price) / 1_000_000_000} SOL
                                </strong>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {totalPages > 1 && (
                <div className="marketplace-pagination">
                    <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => onPageChange(currentPage - 1)}
                    >
                        Previous
                    </button>

                    <span>
                        Page {currentPage} of {totalPages}
                    </span>

                    <button
                        type="button"
                        disabled={currentPage === totalPages}
                        onClick={() => onPageChange(currentPage + 1)}
                    >
                        Next
                    </button>
                </div>
            )}
        </section>
    );
}