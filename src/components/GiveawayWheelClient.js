"use client";

import { useMemo, useState } from "react";

const PRIZES = [
    { label: "$5 Off", detail: "Get $5 off your next purchase.", code: "WOLF5" },
    { label: "10% Off", detail: "Save 10% on one item.", code: "HOWL10" },
    { label: "$10 Off", detail: "Get $10 off your next purchase.", code: "DEN10" },
    { label: "$3 Bonus", detail: "$3 in bonus store credit.", code: "BONUS3" },
    { label: "15% Off", detail: "Save 15% on one sealed product.", code: "PACK15" },
    { label: "$20 Off", detail: "Get $20 off your next purchase.", code: "WILD20" },
    { label: "$7 Bonus", detail: "$7 in bonus store credit.", code: "BONUS7" },
    { label: "5% Off", detail: "Save 5% storewide.", code: "DEN5" },
];

const SEGMENT_COLORS = [
    "#d4af37",
    "#3a3a3a",
    "#b88f2b",
    "#242424",
    "#e0c26b",
    "#303030",
    "#c39b32",
    "#1f1f1f",
];

function buildWheelGradient(size) {
    const step = 360 / size;
    const stops = [];

    for (let i = 0; i < size; i += 1) {
        const start = i * step;
        const end = start + step;
        const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];

        stops.push(`${color} ${start}deg ${end}deg`);
    }

    return `conic-gradient(${stops.join(",")})`;
}

export default function GiveawayWheelClient() {
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [resultIndex, setResultIndex] = useState(null);

    const segmentAngle = 360 / PRIZES.length;
    const wheelBackground = useMemo(() => buildWheelGradient(PRIZES.length), []);

    const result = resultIndex === null ? null : PRIZES[resultIndex];

    const spin = () => {
        if (spinning) {
            return;
        }

        const extraTurns = 6 * 360;
        const randomDrift = Math.random() * 360;
        const nextRotation = rotation + extraTurns + randomDrift;
        const normalizedFinalRotation = ((nextRotation % 360) + 360) % 360;
        const pointerAngle = (360 - normalizedFinalRotation) % 360;
        const nextIndex = Math.floor(pointerAngle / segmentAngle) % PRIZES.length;

        setSpinning(true);
        setResultIndex(null);
        setRotation(nextRotation);

        window.setTimeout(() => {
            setResultIndex(nextIndex);
            setSpinning(false);
        }, 4300);
    };

    return (
        <section className="giveaway-wrap card">
            <h2>Spin The Wolf Wheel</h2>
            <p className="secondary">Tap spin to win a random discount or bonus dollar amount for in-store use.</p>

            <div className="giveaway-wheel-zone">
                <div className="giveaway-pointer" aria-hidden="true" />
                <div
                    className="giveaway-wheel"
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        background: wheelBackground,
                    }}
                    aria-label="Prize wheel"
                    role="img"
                >
                    {PRIZES.map((prize, index) => {
                        // conic-gradient starts at 12 o'clock, but CSS rotate(0deg)
                        // points to 3 o'clock, so subtract 90deg to align labels.
                        const angle = index * segmentAngle + segmentAngle / 2 - 90;

                        return (
                            <div
                                key={prize.code}
                                className="giveaway-segment-label"
                                style={{ transform: `rotate(${angle}deg)` }}
                            >
                                <span
                                    className="giveaway-segment-text"
                                    style={{ transform: `rotate(${-angle}deg)` }}
                                >
                                    {prize.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="giveaway-actions">
                <button className="button primary" onClick={spin} disabled={spinning}>
                    {spinning ? "Spinning..." : "Spin The Wheel"}
                </button>
            </div>

            {result && (
                <div className="giveaway-result" aria-live="polite">
                    <h3>You won: {result.label}</h3>
                    <p>{result.detail}</p>
                    <p>
                        Claim code: <strong>{result.code}</strong>
                    </p>
                </div>
            )}

            <div className="giveaway-prizes">
                {PRIZES.map((prize) => (
                    <span key={prize.code} className="chip">
                        {prize.label}
                    </span>
                ))}
            </div>
        </section>
    );
}
