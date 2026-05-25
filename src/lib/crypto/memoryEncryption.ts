export const MEMORY_BODY_ENCRYPTION_SCHEME = "arkiv-lantern-aes-gcm-pbkdf2-sha256-v1";
export const MEMORY_BODY_ENCRYPTION_ALGORITHM = "AES-GCM";
export const MEMORY_BODY_KEY_DERIVATION = "PBKDF2";
export const MEMORY_BODY_KEY_HASH = "SHA-256";
export const MEMORY_BODY_KEY_ITERATIONS = 250_000;
export const MEMORY_BODY_SALT_BYTES = 16;
export const MEMORY_BODY_IV_BYTES = 12;

export interface EncryptedMemoryBodyPayload {
  algorithm: typeof MEMORY_BODY_ENCRYPTION_ALGORITHM;
  ciphertext: string;
  iv: string;
  kdf: {
    hash: typeof MEMORY_BODY_KEY_HASH;
    iterations: number;
    name: typeof MEMORY_BODY_KEY_DERIVATION;
    salt: string;
  };
  plaintextFormat: "text/plain";
  scheme: typeof MEMORY_BODY_ENCRYPTION_SCHEME;
}

export interface MemoryBodyCryptoOptions {
  crypto?: Crypto;
  iterations?: number;
  ivBytes?: Uint8Array;
  saltBytes?: Uint8Array;
}

export class MemoryBodyCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryBodyCryptoError";
  }
}

export async function encryptMemoryBody(
  body: string,
  passphrase: string,
  options: MemoryBodyCryptoOptions = {},
): Promise<EncryptedMemoryBodyPayload> {
  if (!passphrase) {
    throw new MemoryBodyCryptoError("Passphrase is required to encrypt a memory body.");
  }

  try {
    const crypto = resolveCrypto(options.crypto);
    const salt = options.saltBytes ?? randomBytes(crypto, MEMORY_BODY_SALT_BYTES);
    const iv = options.ivBytes ?? randomBytes(crypto, MEMORY_BODY_IV_BYTES);
    const iterations = options.iterations ?? MEMORY_BODY_KEY_ITERATIONS;
    const key = await deriveAesKey({ crypto, iterations, passphrase, salt });
    const ciphertext = await crypto.subtle.encrypt(
      {
        iv: toArrayBuffer(iv),
        name: MEMORY_BODY_ENCRYPTION_ALGORITHM,
      },
      key,
      toArrayBuffer(new TextEncoder().encode(body)),
    );

    return {
      algorithm: MEMORY_BODY_ENCRYPTION_ALGORITHM,
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      iv: bytesToBase64(iv),
      kdf: {
        hash: MEMORY_BODY_KEY_HASH,
        iterations,
        name: MEMORY_BODY_KEY_DERIVATION,
        salt: bytesToBase64(salt),
      },
      plaintextFormat: "text/plain",
      scheme: MEMORY_BODY_ENCRYPTION_SCHEME,
    };
  } catch (error) {
    if (error instanceof MemoryBodyCryptoError) {
      throw error;
    }

    throw new MemoryBodyCryptoError("Memory body encryption failed.");
  }
}

export async function decryptMemoryBody(
  encryptedBody: EncryptedMemoryBodyPayload,
  passphrase: string,
  options: Pick<MemoryBodyCryptoOptions, "crypto"> = {},
): Promise<string> {
  if (!passphrase) {
    throw new MemoryBodyCryptoError("Passphrase is required to decrypt this memory body.");
  }

  validateEncryptedMemoryBodyPayload(encryptedBody);

  try {
    const crypto = resolveCrypto(options.crypto);
    const salt = base64ToBytes(encryptedBody.kdf.salt);
    const iv = base64ToBytes(encryptedBody.iv);
    const ciphertext = base64ToBytes(encryptedBody.ciphertext);
    const key = await deriveAesKey({
      crypto,
      iterations: encryptedBody.kdf.iterations,
      passphrase,
      salt,
    });
    const plaintext = await crypto.subtle.decrypt(
      {
        iv: toArrayBuffer(iv),
        name: MEMORY_BODY_ENCRYPTION_ALGORITHM,
      },
      key,
      toArrayBuffer(ciphertext),
    );

    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof MemoryBodyCryptoError) {
      throw error;
    }

    throw new MemoryBodyCryptoError("Passphrase could not decrypt this memory body.");
  }
}

export function validateEncryptedMemoryBodyPayload(value: EncryptedMemoryBodyPayload): void {
  if (
    value.scheme !== MEMORY_BODY_ENCRYPTION_SCHEME ||
    value.algorithm !== MEMORY_BODY_ENCRYPTION_ALGORITHM ||
    value.plaintextFormat !== "text/plain" ||
    value.kdf?.name !== MEMORY_BODY_KEY_DERIVATION ||
    value.kdf.hash !== MEMORY_BODY_KEY_HASH ||
    !Number.isInteger(value.kdf.iterations) ||
    value.kdf.iterations < 1 ||
    !value.kdf.salt ||
    !value.iv ||
    !value.ciphertext
  ) {
    throw new MemoryBodyCryptoError("Encrypted memory body payload is invalid.");
  }
}

async function deriveAesKey({
  crypto,
  iterations,
  passphrase,
  salt,
}: {
  crypto: Crypto;
  iterations: number;
  passphrase: string;
  salt: Uint8Array;
}): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(passphrase)),
    MEMORY_BODY_KEY_DERIVATION,
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      hash: MEMORY_BODY_KEY_HASH,
      iterations,
      name: MEMORY_BODY_KEY_DERIVATION,
      salt: toArrayBuffer(salt),
    },
    keyMaterial,
    {
      length: 256,
      name: MEMORY_BODY_ENCRYPTION_ALGORITHM,
    },
    false,
    ["decrypt", "encrypt"],
  );
}

function resolveCrypto(crypto: Crypto | undefined): Crypto {
  const resolvedCrypto = crypto ?? globalThis.crypto;

  if (!resolvedCrypto?.subtle || typeof resolvedCrypto.getRandomValues !== "function") {
    throw new MemoryBodyCryptoError("Web Crypto is unavailable in this browser.");
  }

  return resolvedCrypto;
}

function randomBytes(crypto: Crypto, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  return Uint8Array.from(Buffer.from(value, "base64"));
}
