"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";

const productionOrigin = "https://joinbounty.dev";

/** Routes magic-link callbacks from the operating system into the web app. */
export function NativeAppBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener("appUrlOpen", ({ url }) => {
      const callback = new URL(url);
      const isMagicLink = callback.protocol === "bounty:" && callback.hostname === "auth";
      const isVerifiedWebLink = callback.protocol === "https:" && callback.hostname === "joinbounty.dev";
      if (!isMagicLink && !isVerifiedWebLink) return;
      window.location.assign(isMagicLink ? `${productionOrigin}/?${callback.searchParams.toString()}` : callback.toString());
    });

    return () => { void listener.then(handle => handle.remove()); };
  }, []);

  return null;
}

