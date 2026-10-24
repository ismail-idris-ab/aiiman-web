import { hash, verify } from "@node-rs/argon2";

// argon2id (the library default) with OWASP's minimum: 19 MiB, 2 passes, 1 lane.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password, OPTIONS);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real check, so a login for an unknown email takes
 * as long as one with a wrong password and can't be used to probe accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy password that never matches");
  await verifyPassword(await dummyHash, password);
  return false;
}
