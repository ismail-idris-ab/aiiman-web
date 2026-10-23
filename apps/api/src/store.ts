import type { Doc, PostStatus } from "@aiiman/shared";
import { MongoServerError, type Collection, type Db } from "mongodb";

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

export interface Post {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: Doc;
  status: PostStatus;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  /** First publication time; kept when a published post is edited. */
  publishedAt: Date | null;
}

export type PostChanges = Partial<
  Pick<Post, "slug" | "title" | "summary" | "body" | "status" | "publishedAt">
> &
  Pick<Post, "updatedAt">;

/** Another post already uses the slug. */
export class SlugTakenError extends Error {
  override name = "SlugTakenError";
}

export interface Stores {
  users: {
    findByEmail(email: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    findByIds(ids: readonly string[]): Promise<User[]>;
    insert(user: User): Promise<void>;
  };
  posts: {
    /** Every post, most recently updated first. */
    list(): Promise<Post[]>;
    findById(id: string): Promise<Post | null>;
    /** Throws SlugTakenError when the slug is in use. */
    insert(post: Post): Promise<void>;
    /** Throws SlugTakenError when the slug is in use; null when the post is gone. */
    update(id: string, changes: PostChanges): Promise<Post | null>;
    /** Published posts only, newest first. */
    listPublished(): Promise<Post[]>;
    findPublishedBySlug(slug: string): Promise<Post | null>;
  };
  sessions: {
    insert(session: Session): Promise<void>;
    findValid(tokenHash: string, now: Date): Promise<Session | null>;
    delete(tokenHash: string): Promise<void>;
  };
}

type UserDoc = Omit<User, "id"> & { _id: string };
type SessionDoc = Omit<Session, "tokenHash"> & { _id: string };
type PostDoc = Omit<Post, "id"> & { _id: string };

function fromUserDoc({ _id, ...rest }: UserDoc): User {
  return { id: _id, ...rest };
}

function fromPostDoc({ _id, ...rest }: PostDoc): Post {
  return { id: _id, ...rest };
}

const DUPLICATE_KEY = 11000;

async function slugSafe<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
      throw new SlugTakenError();
    }
    throw error;
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

let indexesReady: Promise<unknown> | undefined;

export function createMongoStores(db: Db): Stores {
  const users: Collection<UserDoc> = db.collection("users");
  const sessions: Collection<SessionDoc> = db.collection("sessions");
  const posts: Collection<PostDoc> = db.collection("posts");

  // Once per instance. The TTL index lets MongoDB delete expired sessions itself.
  indexesReady ??= Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ userId: 1 }),
    posts.createIndex({ slug: 1 }, { unique: true }),
    posts.createIndex({ status: 1, publishedAt: -1 }),
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
      async findByIds(ids) {
        const docs = await users.find({ _id: { $in: [...ids] } }).toArray();
        return docs.map(fromUserDoc);
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
    posts: {
      async list() {
        const docs = await posts.find().sort({ updatedAt: -1 }).toArray();
        return docs.map(fromPostDoc);
      },
      async findById(id) {
        const doc = await posts.findOne({ _id: id });
        return doc === null ? null : fromPostDoc(doc);
      },
      async insert({ id, ...rest }) {
        await indexesReady;
        await slugSafe(() => posts.insertOne({ _id: id, ...rest }));
      },
      async update(id, changes) {
        await indexesReady;
        const doc = await slugSafe(() =>
          posts.findOneAndUpdate(
            { _id: id },
            { $set: changes },
            { returnDocument: "after" },
          ),
        );
        return doc === null ? null : fromPostDoc(doc);
      },
      async listPublished() {
        const docs = await posts
          .find({ status: "published" })
          .sort({ publishedAt: -1, slug: 1 })
          .toArray();
        return docs.map(fromPostDoc);
      },
      async findPublishedBySlug(slug) {
        const doc = await posts.findOne({ slug, status: "published" });
        return doc === null ? null : fromPostDoc(doc);
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
