import { authenticatedClient, authError } from "../../server-supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { client, user } = await authenticatedClient(request);
    const { data, error } = await client.from("lucy_push_subscriptions").select("id,enabled,reminder_time,timezone,updated_at").eq("user_id", user.id).eq("enabled", true).maybeSingle();
    if (error) throw error;
    return Response.json({ configured: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), active: Boolean(data), subscription: data });
  } catch (error) { return authError(error); }
}

export async function POST(request: Request) {
  try {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return Response.json({ error: "El backend Web Push no está configurado." }, { status: 503 });
    const { client, user } = await authenticatedClient(request);
    const body = await request.json();
    const endpoint = body.subscription?.endpoint;
    if (typeof endpoint !== "string" || !body.subscription?.keys?.p256dh || !body.subscription?.keys?.auth) return Response.json({ error: "Suscripción no válida." }, { status: 400 });
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(body.reminderTime) ? `${body.reminderTime}:00` : "20:00:00";
    const row = { user_id: user.id, endpoint, subscription: body.subscription, enabled: true, reminder_time: time, timezone: String(body.timezone || "UTC"), updated_at: new Date().toISOString() };
    const { error } = await client.from("lucy_push_subscriptions").upsert(row, { onConflict: "endpoint" });
    if (error) throw error;
    return Response.json({ active: true });
  } catch (error) { return authError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { client, user } = await authenticatedClient(request);
    const { error } = await client.from("lucy_push_subscriptions").delete().eq("user_id", user.id);
    if (error) throw error;
    return Response.json({ active: false });
  } catch (error) { return authError(error); }
}
