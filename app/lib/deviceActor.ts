"use client";

const KEY = "pace:deviceActor";

export function getDeviceActor() {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const value = `Device ${suffix}`;
    localStorage.setItem(KEY, value);
    return value;
  } catch {
    return "";
  }
}

export function setDeviceActor(value: string) {
  if (typeof window === "undefined") return;
  try {
    const clean = value.trim().slice(0, 40);
    if (clean) localStorage.setItem(KEY, clean);
  } catch {}
}
