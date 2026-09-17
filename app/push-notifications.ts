"use client";

import { supabase } from "./supabase";

function decodeKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw error ?? new Error("No hay una sesión válida.");
  return data.session.access_token;
}

async function request(method: string, body?: unknown) {
  const response = await fetch("/api/push", {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo configurar la notificación.");
  return data;
}

export async function pushStatus() { return request("GET"); }

export async function enableDailyReminder(reminderTime: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Web Push no está disponible en este navegador.");
  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("El permiso de notificaciones no fue concedido.");
  }
  const registration = await navigator.serviceWorker.ready;
  const current = await registration.pushManager.getSubscription();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("El backend de notificaciones todavía no está configurado.");
  const subscription = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
  return request("POST", { subscription: subscription.toJSON(), reminderTime, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

export async function disableDailyReminder() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  }
  return request("DELETE");
}
