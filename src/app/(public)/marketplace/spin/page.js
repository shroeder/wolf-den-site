import SpinWheel from "@/components/SpinWheel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily Spin · The Wolf Den" };

export default function SpinPage() {
    return (
        <div className="stack reveal">
            <SpinWheel />
        </div>
    );
}
