import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { sendSupportTicket } from "../services/supportService";
import type { SupportTicketDTO } from "../services/supportService";

const Support: React.FC = () => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupportTicketDTO>({ mode: "onTouched" });

  const [responseMessage, setResponseMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const onSubmit = async (values: SupportTicketDTO) => {
    setResponseMessage("");
    setErrorMessage("");

    try {
      await sendSupportTicket(values);
      setResponseMessage("Support request sent! We will get back to you shortly.");
      reset();
    } catch (err) {
      setErrorMessage(
        (err as Error).message || "Unable to send support request. Please try again.",
      );
    }
  };

  return (
    <main className="min-h-screen bg-[#030712] p-6 text-white">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#0B0F1C]/70 p-8">
        <h1 className="text-3xl font-semibold">Contact Support</h1>
        <p className="mt-2 text-sm text-white/70">
          Tell us what is wrong and we’ll respond ASAP.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label htmlFor="support-name" className="text-sm font-medium">Name</label>
            <input
              id="support-name"
              {...register("name", { required: "Name is required" })}
              className="w-full rounded-lg border border-white/20 bg-[#020812] px-4 py-2 text-white focus:border-[#FE3796] focus:outline-none"
            />
            {errors.name && (
              <p className="text-xs text-red-400">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="support-email" className="text-sm font-medium">Email</label>
            <input
              id="support-email"
              {...register("email", {
                required: "Email is required",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Enter a valid email",
                },
              })}
              className="w-full rounded-lg border border-white/20 bg-[#020812] px-4 py-2 text-white focus:border-[#FE3796] focus:outline-none"
            />
            {errors.email && (
              <p className="text-xs text-red-400">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="support-subject" className="text-sm font-medium">Subject</label>
            <input
              id="support-subject"
              {...register("subject", { required: "Subject is required" })}
              className="w-full rounded-lg border border-white/20 bg-[#020812] px-4 py-2 text-white focus:border-[#FE3796] focus:outline-none"
            />
            {errors.subject && (
              <p className="text-xs text-red-400">{errors.subject.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="support-message" className="text-sm font-medium">Message</label>
            <textarea
              id="support-message"
              {...register("message", {
                required: "Message is required",
                minLength: { value: 12, message: "Please add detail" },
              })}
              rows={5}
              className="w-full rounded-lg border border-white/20 bg-[#020812] px-4 py-2 text-white focus:border-[#FE3796] focus:outline-none"
            />
            {errors.message && (
              <p className="text-xs text-red-400">{errors.message.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-[#FE3796] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#ff2f85] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Sending..." : "Send Support Request"}
          </button>

          {responseMessage && (
            <p className="text-sm text-green-400">{responseMessage}</p>
          )}
          {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
        </form>
      </div>
    </main>
  );
};

export default Support;
