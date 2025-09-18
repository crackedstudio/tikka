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
        <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-md overflow-hidden rounded-2xl shadow"
        >
            {/* Input */}
            <input
                type="email"
                placeholder="Enter your email here"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 px-4 py-3 text-sm text-black focus:outline-none bg-white"
            />

            {/* Button */}
            <button
                type="submit"
                className="px-6 py-3 text-white font-medium transition bg-[#FE3796] "
            >
                Subscribe
            </button>
        </form>
    );
};

export default SubscribeForm;
