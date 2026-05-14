import { createHash, randomBytes } from "node:crypto";

export type TokenPurpose = "public" | "admin" | "manage" | "boards";

const TOKEN_BITS: Record<TokenPurpose, number> = {
  public: 128,
  admin: 192,
  manage: 128,
  boards: 192,
};

export function generateBearerToken(purpose: TokenPurpose): string {
  return randomBytes(TOKEN_BITS[purpose] / 8).toString("base64url");
}

export function hashBearerToken(rawToken: string, pepper = ""): string {
  return createHash("sha256").update(`${pepper}${rawToken}`, "utf8").digest("hex");
}

export function createTokenPair(purpose: TokenPurpose, pepper = ""): { rawToken: string; tokenHash: string } {
  const rawToken = generateBearerToken(purpose);
  return {
    rawToken,
    tokenHash: hashBearerToken(rawToken, pepper),
  };
}
