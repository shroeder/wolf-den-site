import ShopCartClient from "@/components/ShopCartClient";
import { notFound } from "next/navigation";

export const metadata = {
    title: "Your Cart",
    description: "Review your cart selections and checkout securely with Square.",
    alternates: {
        canonical: "/cart",
    },
};

export default function CartPage() {
    const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true" && process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
    const squareApplicationId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID || "";
    const squareLocationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || "";

    if (!paymentsEnabled) {
        notFound();
    }

    return (
        <div className="stack reveal">
            <ShopCartClient
                paymentsEnabled={paymentsEnabled}
                squareApplicationId={squareApplicationId}
                squareLocationId={squareLocationId}
            />
        </div>
    );
}
