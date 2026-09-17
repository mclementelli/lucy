import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { SUPABASE_URL } from "../../../supabase";

export const runtime = "nodejs";

function localDate(timezone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "No autorizado." }, { status: 401 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!serviceKey || !publicKey || !privateKey || !subject) return Response.json({ error: "Backend Web Push incompleto." }, { status: 503 });
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from("lucy_push_subscriptions").select("id,subscription,reminder_time,timezone,last_sent_at").eq("enabled", true);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let sent = 0;
  for (const row of data ?? []) {
    const timezone = row.timezone || "America/La_Paz";
    const today = localDate(timezone);
    const alreadySentToday = row.last_sent_at && localDate(timezone, new Date(row.last_sent_at)) === today;
    if (alreadySentToday) continue;
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify({ title: "Lucy", body: "¿Cómo estuvo tu día? Cuéntaselo a Lucy.", url: "/" }));
      await admin.from("lucy_push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", row.id);
      sent += 1;
    } catch (pushError: unknown) {
      const statusCode = typeof pushError === "object" && pushError && "statusCode" in pushError ? Number(pushError.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await admin.from("lucy_push_subscriptions").delete().eq("id", row.id);
    }
  }
  return Response.json({ checked: data?.length ?? 0, sent, cadence: "daily-hobby" });
}
