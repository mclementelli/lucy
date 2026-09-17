import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { authenticatedClient, authError } from "../../server-supabase";

export const runtime = "nodejs";
const bytesToBase64url = (value: Uint8Array) => Buffer.from(value).toString("base64url");
const base64urlToBytes = (value: string) => new Uint8Array(Buffer.from(value, "base64url"));
const rpName = "Lucy";
type Transport = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";
type PasskeyRow = { id: string; credential_id: string; public_key: string; counter: number; transports: Transport[] | null };
function originFor(request: Request) { return new URL(request.url).origin; }
function rpIDFor(request: Request) { return new URL(request.url).hostname; }

export async function GET(request: Request) {
  try {
    const { client, user } = await authenticatedClient(request);
    const { data, error } = await client.from("lucy_passkeys").select("id,credential_id,device_name,transports,created_at,last_used_at").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ passkeys: data });
  } catch (error) { return authError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { client, user } = await authenticatedClient(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Falta la credencial." }, { status: 400 });
    const { error } = await client.from("lucy_passkeys").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) { return authError(error); }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await authenticatedClient(request);
    const body = await request.json();
    const rpID = rpIDFor(request), expectedOrigin = originFor(request);
    const { data: passkeys, error: listError } = await client.from("lucy_passkeys").select("id,credential_id,public_key,counter,transports").eq("user_id", user.id);
    if (listError) throw listError;
    if (body.action === "registration-options") {
      const options = await generateRegistrationOptions({ rpName, rpID, userName: user.email ?? user.id, userDisplayName: user.email ?? "Lucy", userID: new TextEncoder().encode(user.id), attestationType: "none", authenticatorSelection: { residentKey: "preferred", userVerification: "required" }, excludeCredentials: ((passkeys ?? []) as PasskeyRow[]).map((p)=>({ id:p.credential_id, transports:p.transports ?? [] })) });
      const { error } = await client.from("lucy_webauthn_challenges").upsert({ user_id:user.id, challenge:options.challenge, purpose:"registration", expires_at:new Date(Date.now()+5*60_000).toISOString() });
      if (error) throw error; return Response.json(options);
    }
    if (body.action === "registration-verify") {
      const { data: challenge, error: challengeError } = await client.from("lucy_webauthn_challenges").select("challenge,expires_at,purpose").eq("user_id",user.id).single();
      if (challengeError || challenge.purpose !== "registration" || new Date(challenge.expires_at)<new Date()) return Response.json({error:"El registro expiró."},{status:400});
      const verification = await verifyRegistrationResponse({ response:body.response, expectedChallenge:challenge.challenge, expectedOrigin, expectedRPID:rpID, requireUserVerification:true });
      if (!verification.verified || !verification.registrationInfo) return Response.json({error:"No se pudo verificar la credencial."},{status:400});
      const { credential } = verification.registrationInfo;
      const { error } = await client.from("lucy_passkeys").insert({user_id:user.id,credential_id:credential.id,public_key:bytesToBase64url(credential.publicKey),counter:credential.counter,transports:credential.transports??[],device_name:body.deviceName||"iPhone / dispositivo"});
      if (error) throw error; await client.from("lucy_webauthn_challenges").delete().eq("user_id",user.id); return Response.json({verified:true});
    }
    if (body.action === "authentication-options") {
      if (!passkeys?.length) return Response.json({error:"No existe una credencial registrada."},{status:404});
      const options = await generateAuthenticationOptions({rpID,userVerification:"required",allowCredentials:(passkeys as PasskeyRow[]).map((p)=>({id:p.credential_id,transports:p.transports??[]}))});
      const { error } = await client.from("lucy_webauthn_challenges").upsert({user_id:user.id,challenge:options.challenge,purpose:"authentication",expires_at:new Date(Date.now()+5*60_000).toISOString()});
      if (error) throw error; return Response.json(options);
    }
    if (body.action === "authentication-verify") {
      const passkey=((passkeys??[]) as PasskeyRow[]).find((p)=>p.credential_id===body.response?.id);if(!passkey)return Response.json({error:"Credencial no reconocida."},{status:404});
      const { data:challenge,error:challengeError}=await client.from("lucy_webauthn_challenges").select("challenge,expires_at,purpose").eq("user_id",user.id).single();
      if(challengeError||challenge.purpose!=="authentication"||new Date(challenge.expires_at)<new Date())return Response.json({error:"El desbloqueo expiró."},{status:400});
      const verification=await verifyAuthenticationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin,expectedRPID:rpID,requireUserVerification:true,credential:{id:passkey.credential_id,publicKey:base64urlToBytes(passkey.public_key),counter:Number(passkey.counter),transports:passkey.transports??[]}});
      if(!verification.verified)return Response.json({error:"No se pudo verificar Face ID/passkey."},{status:401});
      await client.from("lucy_passkeys").update({counter:verification.authenticationInfo.newCounter,last_used_at:new Date().toISOString()}).eq("id",passkey.id).eq("user_id",user.id);await client.from("lucy_webauthn_challenges").delete().eq("user_id",user.id);return Response.json({verified:true});
    }
    return Response.json({error:"Acción no válida."},{status:400});
  } catch(error){return authError(error);}
}
