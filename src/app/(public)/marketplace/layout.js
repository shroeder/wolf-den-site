// Wraps every /marketplace/* page so the marketplace gets an app-like, denser mobile layout
// (scoped to `.mkt-app` in globals.css). Desktop is unaffected.
export default function MarketplaceLayout({ children }) {
    return <div className="mkt-app">{children}</div>;
}
