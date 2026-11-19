// Signing a private request for Gemini's REST API, the way its docs describe (developer.gemini.com, "API keys"):
//   - the JSON payload holds the request path, a nonce and the call's own fields
//   - it is sent Base64-encoded in the X-GEMINI-PAYLOAD header; the HTTP body stays empty
//   - X-GEMINI-SIGNATURE is the hex HMAC-SHA384 of that Base64 text, keyed with the API secret
// Nothing else happens in here: no network, and the key and secret are only ever passed in.
import { createHmac } from "node:crypto";

/**
 * Gemini's order numbers are 64-bit: longer than JavaScript can hold exactly as a number (145853902322727140
 * was our first one). So they travel as text, and wholeNumber() marks one to be written into the payload as the
 * bare number Gemini expects, digit for digit.
 */
export const wholeNumber = (digits) => {
  if (!/^\d{1,20}$/.test(String(digits))) throw new Error("not a whole number: " + digits);
  return "__INT__" + digits;
};

/** A response from Gemini as an object, with its long order numbers kept as text instead of being rounded. */
export const parseKeepingLongNumbers = (text) => JSON.parse(String(text).replace(/("(?:orderId|instrumentId)"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"'));

export function signedHeaders({ path, params = {}, key, secret, nonce }) {
  if (!key || !secret) throw new Error("no Gemini key");
  const json = JSON.stringify({ request: path, nonce, ...params }).replace(/"__INT__(\d+)"/g, "$1");
  const payload = Buffer.from(json).toString("base64");
  return {
    "Content-Type": "text/plain",
    "Cache-Control": "no-cache",
    "X-GEMINI-APIKEY": key,
    "X-GEMINI-PAYLOAD": payload,
    "X-GEMINI-SIGNATURE": createHmac("sha384", secret).update(payload).digest("hex"),
  };
}

/** What a signed payload says, for tests and for showing an order without sending it. */
export const readPayload = (base64) => JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
