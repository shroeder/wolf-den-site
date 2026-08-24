import SpinWheel from "@/components/SpinWheel";
import ConsumableShelf from "@/components/ConsumableShelf";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily Spin · The Wolf Den" };

export default function SpinPage() {
    return (
        <div className="stack reveal">
            <SpinWheel />
            {/* Lucky Coin, Golden Ticket, Wheel Rewind — all of them buy spins of the wheel above. */}
            <ConsumableShelf feature="spin" title="Spins in your pack" />
        </div>
    );
}
