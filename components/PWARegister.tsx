"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ed-install-dismissed-at";
const DISMISS_DAYS = 7;

export function PWARegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silent — SW registration shouldn't break the app
      });
    }

    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored) {
        const dismissedAt = parseInt(stored, 10);
        const daysSince = (Date.now() - dismissedAt) / 86400000;
        if (daysSince < DISMISS_DAYS) return;
      }
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "dismissed") {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setInstallEvent(null);
    setShowPrompt(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShowPrompt(false);
  }

  if (!showPrompt || !installEvent) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 400,
        margin: "0 auto",
        backgroundColor: "#fff",
        borderRadius: 12,
        border: "1px solid #e5edf5",
        boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 9999,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          backgroundColor: "#533afd",
          borderRadius: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        ED
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#061b31" }}>
          Install EquipDispatch
        </p>
        <p style={{ margin: 0, fontSize: 11, color: "#64748d", lineHeight: 1.4 }}>
          Launch from your home screen. Works offline.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        style={{
          background: "none",
          border: "none",
          color: "#94a3b8",
          fontSize: 13,
          cursor: "pointer",
          padding: "4px 8px",
        }}
      >
        Not now
      </button>
      <button
        type="button"
        onClick={handleInstall}
        style={{
          backgroundColor: "#533afd",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "7px 14px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Install
      </button>
    </div>
  );
}
