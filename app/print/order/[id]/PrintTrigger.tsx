"use client";

import { useEffect } from "react";

export default function PrintTrigger() {
  useEffect(() => {
    const reprint = document.getElementById("reprint-btn");
    const close = document.getElementById("close-btn");
    if (reprint) reprint.addEventListener("click", () => window.print());
    if (close) close.addEventListener("click", () => window.close());

    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);

  return null;
}
