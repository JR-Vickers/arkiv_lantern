import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  MEMORY_BODY_ENCRYPTION_SCHEME,
  decryptMemoryBody,
  encryptMemoryBody,
} from "./memoryEncryption";

const crypto = webcrypto as unknown as Crypto;
const saltBytes = Uint8Array.from(Array.from({ length: 16 }, (_, index) => index + 1));
const ivBytes = Uint8Array.from(Array.from({ length: 12 }, (_, index) => index + 17));
const body = "The user prefers concise implementation notes.";

describe("memory body encryption", () => {
  it("encrypts and decrypts a memory body round trip", async () => {
    const encryptedBody = await encryptMemoryBody(body, "correct horse battery staple", {
      crypto,
      iterations: 1_000,
      ivBytes,
      saltBytes,
    });

    await expect(decryptMemoryBody(encryptedBody, "correct horse battery staple", { crypto })).resolves.toBe(body);
    expect(encryptedBody.scheme).toBe(MEMORY_BODY_ENCRYPTION_SCHEME);
  });

  it("fails decryption with the wrong passphrase", async () => {
    const encryptedBody = await encryptMemoryBody(body, "correct passphrase", {
      crypto,
      iterations: 1_000,
      ivBytes,
      saltBytes,
    });

    await expect(decryptMemoryBody(encryptedBody, "wrong passphrase", { crypto })).rejects.toThrow(
      "Passphrase could not decrypt",
    );
  });

  it("uses caller-supplied salt and IV deterministically for tests", async () => {
    const first = await encryptMemoryBody(body, "passphrase", {
      crypto,
      iterations: 1_000,
      ivBytes,
      saltBytes,
    });
    const second = await encryptMemoryBody(body, "passphrase", {
      crypto,
      iterations: 1_000,
      ivBytes,
      saltBytes,
    });

    expect(first).toEqual(second);
  });

  it("generates distinct salt, IV, and ciphertext by default", async () => {
    const first = await encryptMemoryBody(body, "passphrase", { crypto, iterations: 1_000 });
    const second = await encryptMemoryBody(body, "passphrase", { crypto, iterations: 1_000 });

    expect(first.kdf.salt).not.toBe(second.kdf.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("does not serialize plaintext body text into the encrypted payload", async () => {
    const encryptedBody = await encryptMemoryBody(body, "passphrase", {
      crypto,
      iterations: 1_000,
      ivBytes,
      saltBytes,
    });

    expect(JSON.stringify(encryptedBody)).not.toContain(body);
  });
});
