"use client";

import { useEffect, useMemo, useState } from "react";

function initialStatus(signupLimit) {
    return {
        enabled: Boolean(signupLimit),
        capacity: signupLimit || 0,
        seatsTaken: 0,
        seatsRemaining: signupLimit || 0,
        isFull: false,
    };
}

export default function EventSignupClient({ eventSlug, eventTitle, signupLimit }) {
    const [status, setStatus] = useState(() => initialStatus(signupLimit));
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState("muted");

    const endpoint = useMemo(() => `/api/events/${eventSlug}/signup`, [eventSlug]);

    useEffect(() => {
        let ignore = false;

        async function loadStatus() {
            setLoading(true);
            setMessage("");

            try {
                const response = await fetch(endpoint, {
                    method: "GET",
                    cache: "no-store",
                });

                const data = await response.json();

                if (ignore) {
                    return;
                }

                if (!response.ok) {
                    throw new Error(data?.error || "Unable to load signup status.");
                }

                setStatus((prev) => ({
                    ...prev,
                    ...data,
                }));
            } catch (error) {
                if (!ignore) {
                    setMessage(error?.message || "Unable to load signup status.");
                    setMessageType("error");
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        if (!signupLimit) {
            return () => {
                ignore = true;
            };
        }

        loadStatus();

        return () => {
            ignore = true;
        };
    }, [endpoint, signupLimit]);

    if (!signupLimit) {
        return null;
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (status.isFull) {
            setMessage("This event is currently full.");
            setMessageType("error");
            return;
        }

        setSubmitting(true);
        setMessage("");

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ name, email }),
            });

            const data = await response.json();

            setStatus((prev) => ({
                ...prev,
                capacity: data.capacity ?? prev.capacity,
                seatsTaken: data.seatsTaken ?? prev.seatsTaken,
                seatsRemaining: data.seatsRemaining ?? prev.seatsRemaining,
                isFull: typeof data.isFull === "boolean" ? data.isFull : (data.seatsRemaining ?? prev.seatsRemaining) <= 0,
            }));

            if (!response.ok) {
                throw new Error(data?.message || data?.error || "Unable to complete signup.");
            }

            setMessage(data?.message || "Signup complete.");
            setMessageType("success");

            if (data.status === "created") {
                setName("");
                setEmail("");
            }
        } catch (error) {
            setMessage(error?.message || "Unable to complete signup.");
            setMessageType("error");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <section className="card">
            <h2>Event RSVP</h2>
            <p>
                Reserve your seat for {eventTitle}. Capacity is {status.capacity} players.
            </p>
            {loading ? (
                <p className="muted">Loading RSVP status...</p>
            ) : (
                <p>
                    <strong>{status.seatsRemaining}</strong> of <strong>{status.capacity}</strong> seats remaining.
                </p>
            )}
            {status.isFull && !loading ? (
                <p className="muted">This event is currently full. Join Discord for waitlist updates.</p>
            ) : null}
            <form className="contact-form" onSubmit={handleSubmit}>
                <label htmlFor="signup-name">Name</label>
                <input
                    id="signup-name"
                    name="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={80}
                    required
                />
                <label htmlFor="signup-email">Email</label>
                <input
                    id="signup-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                />
                <button className="button primary" type="submit" disabled={loading || submitting || status.isFull}>
                    {submitting ? "Submitting..." : "Reserve My Spot"}
                </button>
            </form>
            {message ? <p className={messageType === "error" ? "muted" : "statement-copy"}>{message}</p> : null}
        </section>
    );
}
