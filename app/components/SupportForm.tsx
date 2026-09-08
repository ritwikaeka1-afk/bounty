"use client";

import { FormEvent, useState } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (
        siteKey: string,
        options: { action: string }
      ) => Promise<string>;
    };
  }
}

export function SupportForm() {
  const [status, setStatus] = useState("");

  async function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Sending...");

    const form = new FormData(event.currentTarget);
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

    if (!siteKey || !window.grecaptcha) {
      setStatus("Safety check is still loading. Please try again.");
      return;
    }

    window.grecaptcha.ready(async () => {
      const captchaToken = await window.grecaptcha!.execute(siteKey, {
        action: "support_submit",
      });

      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.get("subject"),
          message: form.get("message"),
          captchaToken,
        }),
      });

      const result = await response.json();
      setStatus(
        response.ok
          ? "Thanks — your request was received."
          : result.error || "Unable to send your request."
      );
    });
  }

  return (
    <form onSubmit={submitSupport}>
      <label>
        Subject
        <input name="subject" required maxLength={120} />
      </label>

      <label>
        How can we help?
        <textarea name="message" required maxLength={3000} rows={6} />
      </label>

      <button className="primary" type="submit">
        Send support request
      </button>

      <p>
        This form is protected by reCAPTCHA and the Google Privacy Policy and
        Terms of Service apply.
      </p>

      {status && <p role="status">{status}</p>}
    </form>
  );
}