// Gedeelde statistieken en Mijn vrienden: Cloudflare Worker "okkie-api" + D1 (cloud/wrangler.toml, env production).
// api.okkiedarts.nl volgt pas als de Cloudflare-zone okkiedarts.nl actief is; tot dan workers.dev.
// Alleen voor lokaal testen (localhost/127.0.0.1): localStorage 'okkie.dev' = {"api":"http://127.0.0.1:8799","groups":true,"minors":true}.
// Lokaal zonder testinstelling staat alles uit (zoals een toestel zonder API); op elk ander adres geldt productie.
// http(s) erbij: de iPhone-app draait op capacitor://localhost en is géén testomgeving (IOS-APP.md).
const LOCAL = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DEV = LOCAL ? (() => { try { return JSON.parse(localStorage.getItem('okkie.dev') || '{}') || {}; } catch { return {}; } })() : {};
export const PROD_API = 'https://okkie-api.zaalverhuur-sion.workers.dev';
// STAGING-webapp (alleen om OKKIE. Club te proberen, cloud/CLUB.md): eigen adres, praat alleen met de staging-API en
// de staging-database. Op elk ander adres verandert er niets.
export const STAGING_APP = 'okkie-app-staging.zaalverhuur-sion.workers.dev';
export const STAGING_API = 'https://okkie-api-staging.zaalverhuur-sion.workers.dev';
const STAGING = typeof location !== 'undefined' && location.hostname === STAGING_APP;
export const API_BASE = LOCAL ? (DEV.api || '') : STAGING ? STAGING_API : PROD_API;
export const TURNSTILE_SITE_KEY = '';
// Openbare registratie: pas op true na privacyverklaring en ouderlijke toestemming (<16). De API weigert
// registratie daarnaast zelf zolang REGISTRATION_ENABLED in de Worker niet "true" is.
export const REGISTRATION_OPEN = false;
// Mijn vrienden (besloten groepen) is sinds 1.5.0 vervangen door Darters en staat uit (gegevens blijven bewaard).
export const GROUPS_OPEN = LOCAL ? DEV.groups === true : false;
// Darters: openbaar overzicht en één schakelaar per speler (API: DARTERS_ENABLED).
export const DARTERS_OPEN = LOCAL ? !!DEV.api : true;
// Jonger dan 16: dicht tot juridische toets en DPIA (cloud/VRIENDEN.md §4). De API weigert het ook zelf (MINORS_OPEN).
export const MINORS_OPEN = LOCAL ? DEV.minors === true : false;
// OKKIE. Club (cloud/CLUB.md): live sinds 1.9.0, samen met CLUBS_ENABLED en migraties 0009/0010 op de productie-API. Lokaal testen: 'okkie.dev' = {"api":"…","club":true}.
export const CLUB_OPEN = LOCAL ? DEV.club === true : true;   // live sinds 1.9.0 (API: CLUBS_ENABLED)
