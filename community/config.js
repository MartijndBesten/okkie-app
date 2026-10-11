// Koppel pas na configureren van Cloudflare D1, Turnstile en de privacyvoorwaarden.
// Voor lokale test: wijs naar een eigen lokale Worker op http://localhost:8787 (stel dan de API-validatie bij).
export const API_BASE = '';
export const TURNSTILE_SITE_KEY = '';
// Openbare registratie: pas op true na privacyverklaring en ouderlijke toestemming (<16). De API weigert
// registratie daarnaast zelf zolang REGISTRATION_ENABLED in de Worker niet "true" is.
export const REGISTRATION_OPEN = false;
