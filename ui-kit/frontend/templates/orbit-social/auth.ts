/** Sign in and registration: pure rules. The passwords are hashed (not secure: a demo). */
import { nextId } from "./core.ts";
import { gradient } from "./pictures.ts";
import type { Db, User } from "./schema.ts";

/** A small string hash (cyrb53), in hex. Good enough to not keep a password as text in a demo. */
export function hashPassword(password: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < password.length; i++) {
    const c = password.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0))
    .toString(16)
    .padStart(14, "0");
}

/** The password every sample user has. */
export const DEMO_PASSWORD = "orbit123";
export const DEMO_ADMIN = "admin@orbit.example";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginResult =
  { ok: true; userId: number } | { ok: false; error: string };

export function login(db: Db, email: string, password: string): LoginResult {
  const user = db.users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
  );
  if (!user || user.passwordHash !== hashPassword(password))
    return { ok: false, error: "The email or the password is wrong." };
  if (user.status === "banned")
    return { ok: false, error: "This account is banned." };
  return { ok: true, userId: user.id };
}

export interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

/** An error message per field that is wrong (a valid form gives `{}`). */
export function checkRegistration(
  db: Db,
  f: RegisterForm,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (f.name.trim().length < 2)
    errors.name = "Tell us your name (at least 2 letters)";
  if (!EMAIL.test(f.email.trim()))
    errors.email = "That is not an email address";
  else if (
    db.users.some((u) => u.email.toLowerCase() === f.email.trim().toLowerCase())
  )
    errors.email = "Someone already has this email";
  if (f.password.length < 6) errors.password = "At least 6 characters";
  if (f.confirm !== f.password) errors.confirm = "The passwords differ";
  return errors;
}

/** The new user of a valid registration form. */
export function newUser(db: Db, f: RegisterForm, now: string): User {
  const id = nextId(db.users);
  const hue = (id * 47) % 360;
  return {
    id,
    name: f.name.trim(),
    email: f.email.trim(),
    passwordHash: hashPassword(f.password),
    role: "user",
    status: "active",
    avatar: gradient(hue, hue + 40, f.name.trim().charAt(0).toUpperCase()),
    about: "",
    city: "",
    birthday: "2000-01-01",
    website: "",
    phone: "",
    interests: [],
    createdAt: now,
    lastSeen: now,
  };
}
