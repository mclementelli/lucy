"use client";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { supabase } from "./supabase";

async function token(){const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw error??new Error("No hay una sesión válida.");return data.session.access_token;}
async function call(body?:unknown,method="POST",query=""){
 const response=await fetch(`/api/passkeys${query}`,{method,headers:{Authorization:`Bearer ${await token()}`,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
 const data=await response.json();if(!response.ok)throw new Error(data.error||"No se pudo completar la operación biométrica.");return data;
}
export async function platformAuthenticatorAvailable(){return Boolean(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}
export async function registerPasskey(){const options=await call({action:"registration-options"});const response=await startRegistration({optionsJSON:options});return call({action:"registration-verify",response,deviceName:navigator.userAgent.includes("iPhone")?"iPhone":"Este dispositivo"});}
export async function unlockWithPasskey(){const options=await call({action:"authentication-options"});const response=await startAuthentication({optionsJSON:options});return call({action:"authentication-verify",response});}
export async function listPasskeys(){return call(undefined,"GET");}
export async function removePasskey(id:string){return call(undefined,"DELETE",`?id=${encodeURIComponent(id)}`);}
