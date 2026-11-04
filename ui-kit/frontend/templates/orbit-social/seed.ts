// STUB of the sample data: the real `seedDb()` (1000 users, 10000 songs...) replaces this file.
import { gradient } from "./pictures.ts";
import { hashPassword, DEMO_ADMIN, DEMO_PASSWORD } from "./auth.ts";
import { type Db, emptyDb, NOW } from "./schema.ts";

export { NOW };

export function seedDb(): Db {
  const db = emptyDb();
  const user = (id: number, name: string, email: string, role: "user" | "admin") => ({
    id,
    name,
    email,
    passwordHash: hashPassword(DEMO_PASSWORD),
    role,
    status: "active" as const,
    avatar: gradient(id * 60, id * 60 + 40, name.charAt(0)),
    about: "",
    city: "Lisbon",
    birthday: "1995-05-05",
    website: "",
    phone: "",
    interests: [],
    createdAt: "2025-01-01T10:00:00",
    lastSeen: NOW,
  });
  db.users = [
    user(1, "Orbit Admin", DEMO_ADMIN, "admin"),
    user(2, "Ann Stone", "ann.stone@example.com", "user"),
    user(3, "Ben Reyes", "ben.reyes@example.com", "user"),
  ];
  return db;
}
