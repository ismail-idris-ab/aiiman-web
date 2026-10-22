import type { Collection, Db } from "mongodb";

export const ROLES = ["admin", "editor", "author"] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: "active" | "deactivated";
  passwordHash: string;
  createdAt: Date;
}

/** What the API ever sends about a user: never the hash. */
export type PublicUser = Pick<User, "id" | "email" | "name" | "role">;

export function toPublicUser({ id, email, name, role }: User): PublicUser {
  return { id, email, name, role };
}

export interface Session {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface Stores {
  users: {
    findByEmail(email: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    insert(user: User): Promise<void>;
  };
  sessions: {
    insert(session: Session): Promise<void>;
    findValid(tokenHash: string, now: Date): Promise<Session | null>;
    delete(tokenHash: string): Promise<void>;
  };
}

type UserDoc = Omit<User, "id"> & { _id: string };
type SessionDoc = Omit<Session, "tokenHash"> & { _id: string };

function fromUserDoc({ _id, ...rest }: UserDoc): User {
  return { id: _id, ...rest };
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

let indexesReady: Promise<unknown> | undefined;

export function createMongoStores(db: Db): Stores {
  const users: Collection<UserDoc> = db.collection("users");
  const sessions: Collection<SessionDoc> = db.collection("sessions");

  // Once per instance. The TTL index lets MongoDB delete expired sessions itself.
  indexesReady ??= Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ userId: 1 }),
  ]);

  return {
    users: {
      async findByEmail(email) {
        await indexesReady;
        const doc = await users.findOne({ email: normaliseEmail(email) });
        return doc === null ? null : fromUserDoc(doc);
      },
      async findById(id) {
        const doc = await users.findOne({ _id: id });
        return doc === null ? null : fromUserDoc(doc);
      },
      async insert({ id, ...rest }) {
        await indexesReady;
        await users.insertOne({
          _id: id,
          ...rest,
          email: normaliseEmail(rest.email),
        });
      },
    },
    sessions: {
      async insert({ tokenHash, ...rest }) {
        await indexesReady;
        await sessions.insertOne({ _id: tokenHash, ...rest });
      },
      async findValid(tokenHash, now) {
        // The TTL monitor runs about once a minute, so check expiry here too.
        const doc = await sessions.findOne({
          _id: tokenHash,
          expiresAt: { $gt: now },
        });
        return doc === null ? null : { tokenHash: doc._id, ...doc };
      },
      async delete(tokenHash) {
        await sessions.deleteOne({ _id: tokenHash });
      },
    },
  };
}

/** For tests only: lets each test database build its own indexes. */
export function resetIndexCacheForTests(): void {
  indexesReady = undefined;
}
