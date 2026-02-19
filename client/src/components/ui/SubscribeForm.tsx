// SubscribeForm.tsx
import React, { useState } from "react";

const SubscribeForm: React.FC = () => {
    const [email, setEmail] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        alert(`Subscribed with: ${email}`);
        setEmail("");
    };

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-md">
            <label htmlFor="subscribe-email" className="sr-only">
                Email address
            </label>

            <div className="flex w-full overflow-hidden rounded-2xl shadow ">
                {/* Input */}
                <input
                    id="subscribe-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email here"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-[70%] min-w-0 flex-1 bg-white px-4 py-3 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#FE3796]/40"
                />

                {/* Button */}
                <button
                    type="submit"
                    className="px-6 py-3 text-white font-medium transition bg-[#FE3796] hover:brightness-110 active:scale-[0.98]"
                >
                    Subscribe
                </button>
            </div>
        </form>
    );
};

export default SubscribeForm;
