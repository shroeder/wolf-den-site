import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ClosureBanner from "@/components/ClosureBanner";

export default function PublicLayout({ children }) {
    return (
        <>
            <ClosureBanner />
            <SiteHeader />
            <main className="shell content">{children}</main>
            <SiteFooter />
        </>
    );
}
