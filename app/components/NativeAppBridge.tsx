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
      if (callback.protocol !== "bounty:") return;
      window.location.assign(`${productionOrigin}/?${callback.searchParams.toString()}`);
    });

    return () => { void listener.then(handle => handle.remove()); };
  }, []);

  return null;
}

