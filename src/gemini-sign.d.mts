// Types for gemini-sign.mjs.
export function signedHeaders(input: { path: string; params?: Record<string, unknown>; key: string; secret: string; nonce: number }): Record<string, string>;
export function readPayload(base64: string): Record<string, unknown>;
/** Mark a long whole number (as text) to be written into a signed payload as a bare number. */
export function wholeNumber(digits: string | number): string;
/** JSON.parse that keeps Gemini's long order numbers as text. */
export function parseKeepingLongNumbers(text: string): any;
