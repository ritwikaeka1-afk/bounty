"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { createIdleClock, WARNING_MS } from "../../lib/idle-clock";

export function IdleSession({ userId, onTimeout }: { userId: string; onTimeout: () => void }) {
  const callback = useRef(onTimeout);
  callback.current = onTimeout;
  const [remaining, setRemaining] = useState<number | null>(null);
  const extend = useRef(() => {});
  useEffect(() => {
    let disposed = false, cleanup = () => {};
    void createClient().auth.getSession().then(({ data }) => {
      if (disposed || !data.session || data.session.user.id !== userId) return;
      // Session identity stays stable on token refresh, but changes on new login.
      const session = data.session;
      let identity = session.user.last_sign_in_at || userId;
      try {
        const payload = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (typeof payload.session_id === "string") identity = payload.session_id;
      } catch {}
      const key = `bounty:idle:${userId}:${identity}`;
      const storage = {
        getItem: (k: string) => localStorage.getItem(k),
        setItem: (k: string, v: string) => localStorage.setItem(k, v),
      };
      const clock = createIdleClock(key, storage);
      let channel: BroadcastChannel | null = null, ended = false, lastWrite = 0;
      try { channel = new BroadcastChannel(key); } catch {}
      const finish = () => {
        if (ended) return;
        ended = true; clock.expire(); channel?.postMessage({ type: "expired" });
        callback.current();
      };
      const check = () => {
        if (ended) return;
        const ms = clock.remaining();
        if (ms <= 0) { finish(); return; }
        setRemaining(ms <= WARNING_MS ? Math.ceil(ms / 1000) : null);
      };
      const active = (event?: Event) => {
        if (ended || document.visibilityState !== "visible" || (event && !event.isTrusted)) return;
        // Check before extending: waking a suspended tab cannot revive expiry.
        if (clock.remaining() <= 0) { finish(); return; }
        if (event && Date.now() - lastWrite < 1000) return;
        lastWrite = Date.now();
        clock.activity(); channel?.postMessage({ type: "activity", at: clock.timestamp() }); check();
      };
      extend.current = () => active();
      if (channel) channel.onmessage = event => {
        if (event.data?.type === "request") {
          check();
          if (!ended) channel?.postMessage({ type: "activity", at: clock.timestamp() });
          return;
        }
        if (event.data?.type === "expired") { finish(); return; }
        if (event.data?.type === "activity" && Number.isFinite(event.data.at)) clock.receive(event.data.at);
        check();
      };
      channel?.postMessage({ type: "request" });
      const onStorage = (event: StorageEvent) => { if (!event.key || event.key.startsWith(key)) check(); };
      const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchmove"];
      events.forEach(name => window.addEventListener(name, active, { passive: true, capture: true }));
      window.addEventListener("storage", onStorage);
      window.addEventListener("focus", check);
      window.addEventListener("pageshow", check);
      document.addEventListener("visibilitychange", check);
      const timer = window.setInterval(check, 1000);
      check();
      cleanup = () => {
        clearInterval(timer); channel?.close();
        events.forEach(name => window.removeEventListener(name, active, true));
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("focus", check);
        window.removeEventListener("pageshow", check);
        document.removeEventListener("visibilitychange", check);
      };
    }).catch(() => { if (!disposed) callback.current(); });
    return () => { disposed = true; cleanup(); };
  }, [userId]);
  return remaining === null ? null : <div className="idle-warning" role="status">
    <span>You’ll be signed out in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} due to inactivity.</span>
    <button className="primary" onClick={() => extend.current()}>Stay signed in</button>
  </div>;
}
