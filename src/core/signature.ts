export type SignatureStatus = "verified" | "unverified" | "bad";

export interface Signature {
  status: SignatureStatus;
  label: string;
}

// git %G? codes: G good, U good but untrusted key, E cannot check, X/Y expired,
// R revoked, B bad, N unsigned
export function parseSignature(code: string, signer: string, key: string): Signature | undefined {
  const who = signer.trim() ? ` by ${signer.trim()}` : "";
  const keyId = key.trim() ? ` · key ${key.trim().slice(-16)}` : "";
  switch (code.trim()) {
    case "G":
      return { status: "verified", label: `Signed${who}, verified${keyId}` };
    case "U":
      return { status: "verified", label: `Signed${who}, verified with an untrusted key${keyId}` };
    case "E":
      return { status: "unverified", label: `Signed${who}, key not available to verify${keyId}` };
    case "X":
    case "Y":
      return { status: "unverified", label: `Signed${who}, key expired${keyId}` };
    case "R":
      return { status: "bad", label: `Signed${who}, key revoked${keyId}` };
    case "B":
      return { status: "bad", label: `Bad signature${who}${keyId}` };
    default:
      return undefined;
  }
}
