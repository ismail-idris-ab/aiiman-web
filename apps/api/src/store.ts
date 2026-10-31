import type {
  DraftInput,
  Photo,
  PostStatus,
  Role,
  UserStatus,
} from "@aiiman/shared";
import { MongoServerError, type Collection, type Db } from "mongodb";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  /** Null until the user opens their setup link and chooses a password. */
  passwordHash: string | null;
  bio?: string;
  photo?: Photo;
  createdAt: Date;
}

export type UserChanges = Partial<
  Pick<User, "name" | "role" | "status" | "passwordHash" | "bio" | "photo">
>;

/** What the API ever sends about a user: never the hash. */
export type PublicUser = Omit<User, "passwordHash"> & {
  /** False while the setup link hasn't been used. */
  passwordSet: boolean;
};

export function toPublicUser({ passwordHash, ...user }: User): PublicUser {
  return { ...user, passwordSet: passwordHash !== null };
}

export type PasswordLinkKind = "setup" | "reset";

/** A one-time link that lets a user choose a password. Only its hash is stored. */
export interface PasswordLink {
  tokenHash: string;
  userId: string;
  kind: PasswordLinkKind;
  createdAt: Date;
  expiresAt: Date;
}

export interface Session {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * A post: the fields a writer edits plus workflow state. Optional fields are
 * absent when unset. A draft's fields may not meet the publishing rules yet.
 */
export type Post = DraftInput & {
  id: string;
  status: PostStatus;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  /** First publication time; kept when a published post is edited. */
  publishedAt: Date | null;
  /** Goes up by one on every write, so an edit made on an older version is refused. */
  version: number;
};

export type PostChanges = Partial<
  Omit<Post, "id" | "authorId" | "createdAt" | "version">
> &
  Pick<Post, "updatedAt">;

export const REVISION_KINDS = ["autosave", "save", "restore"] as const;
export type RevisionKind = (typeof REVISION_KINDS)[number];

/** A saved version of a post's editable fields. */
export interface Revision {
  id: string;
  postId: string;
  /** The post version these fields were saved as. */
  version: number;
  kind: RevisionKind;
  content: DraftInput;
  savedBy: string;
  /** When this revision was first saved; autosaves fold into it for a while. */
  createdAt: Date;
  savedAt: Date;
}

/** An image the API stored in Blob, with the measurements posts must match. */
export interface Upload {
  url: string;
  width: number;
  height: number;
  blurDataURL: string;
  contentType: string;
  bytes: number;
  uploadedBy: string;
  createdAt: Date;
}

/** Another post already uses this slug or featured position. */
export class DuplicateFieldError extends Error {
  override name = "DuplicateFieldError";
  constructor(readonly field: "slug" | "featured") {
    super(`duplicate ${field}`);
  }
}

export interface Stores {
  users: {
    findByEmail(email: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    findByIds(ids: readonly string[]): Promise<User[]>;
    /** Everyone, oldest first. */
    list(): Promise<User[]>;
    /** Throws DuplicateEmailError when the email is taken. */
    insert(user: User): Promise<void>;
    /** Sets `changes` and removes the `unset` fields; null when the user is gone. */
    update(
      id: string,
      changes: UserChanges,
      unset?: readonly ("bio" | "photo")[],
    ): Promise<User | null>;
  };
  passwordLinks: {
    insert(link: PasswordLink): Promise<void>;
    /** The link if it exists and hasn't expired. */
    find(tokenHash: string, now: Date): Promise<PasswordLink | null>;
    /** Like find, but deletes it in the same step so it works only once. */
    consume(tokenHash: string, now: Date): Promise<PasswordLink | null>;
    deleteByUser(userId: string): Promise<void>;
  };
  posts: {
    /** Every post, most recently updated first. */
    list(): Promise<Post[]>;
    findById(id: string): Promise<Post | null>;
    /** Throws DuplicateFieldError when the slug or featured position is in use. */
    insert(post: Post): Promise<void>;
    /**
     * Sets `changes`, removes the `unset` fields and bumps the version. With
     * `expectedVersion`, only writes if the post is still at that version.
     * Throws DuplicateFieldError like insert; null when the post is gone or
     * has moved on.
     */
    update(
      id: string,
      changes: PostChanges,
      unset?: readonly string[],
      expectedVersion?: number,
    ): Promise<Post | null>;
    /** Published posts only, newest first. */
    listPublished(): Promise<Post[]>;
    findPublishedBySlug(slug: string): Promise<Post | null>;
  };
  pages: {
    /** Slugs of published pages, or null while pages still live in the site's MDX (#20). */
    publishedSlugs(): Promise<string[] | null>;
  };
  uploads: {
    insert(upload: Upload): Promise<void>;
    findByUrls(urls: readonly string[]): Promise<Upload[]>;
  };
  revisions: {
    /** A post's revisions, newest first. */
    list(postId: string): Promise<Revision[]>;
    find(postId: string, id: string): Promise<Revision | null>;
    /** Adds a revision and deletes the post's revisions past the newest `keep`. */
    insert(revision: Revision, keep: number): Promise<void>;
    replace(revision: Revision): Promise<void>;
  };
  sessions: {
    insert(session: Session): Promise<void>;
    findValid(tokenHash: string, now: Date): Promise<Session | null>;
    delete(tokenHash: string): Promise<void>;
    /** Ends every session of a user, except `keep` (the one making the change). */
    deleteByUser(userId: string, keep?: string): Promise<void>;
  };
}

type UserDoc = Omit<User, "id"> & { _id: string };
type SessionDoc = Omit<Session, "tokenHash"> & { _id: string };
type PasswordLinkDoc = Omit<PasswordLink, "tokenHash"> & { _id: string };
type PostDoc = Omit<Post, "id"> & { _id: string };
type UploadDoc = Omit<Upload, "url"> & { _id: string };
type RevisionDoc = Omit<Revision, "id"> & { _id: string };
interface PageDoc {
  _id: string;
  status: PostStatus;
}

function fromUserDoc({ _id, ...rest }: UserDoc): User {
  return { id: _id, ...rest };
}

function fromLinkDoc({ _id, ...rest }: PasswordLinkDoc): PasswordLink {
  return { tokenHash: _id, ...rest };
}

function fromPostDoc({ _id, ...rest }: PostDoc): Post {
  return { id: _id, ...rest };
}

function fromRevisionDoc({ _id, ...rest }: RevisionDoc): Revision {
  return { id: _id, ...rest };
}

const DUPLICATE_KEY = 11000;

async function uniqueSafe<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
      const keys = Object.keys((error.keyPattern ?? {}) as object);
      throw new DuplicateFieldError(
        keys.includes("featured") ? "featured" : "slug",
      );
    }
    throw error;
  }
}

/** Another user already has this email. */
export class DuplicateEmailError extends Error {
  override name = "DuplicateEmailError";
}

/** The driver stores `undefined` as null; absent fields must stay absent. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

let indexesReady: Promise<unknown> | undefined;

export function createMongoStores(db: Db): Stores {
  const users: Collection<UserDoc> = db.collection("users");
  const sessions: Collection<SessionDoc> = db.collection("sessions");
  const posts: Collection<PostDoc> = db.collection("posts");
  const pages: Collection<PageDoc> = db.collection("pages");
  const uploads: Collection<UploadDoc> = db.collection("uploads");
  const revisions: Collection<RevisionDoc> = db.collection("revisions");
  const passwordLinks: Collection<PasswordLinkDoc> =
    db.collection("passwordLinks");

  // Once per instance. The TTL index lets MongoDB delete expired sessions itself.
  indexesReady ??= Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ userId: 1 }),
    passwordLinks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    passwordLinks.createIndex({ userId: 1 }),
    // Drafts autosave before they have a title, so many may have no slug yet.
    posts.createIndex(
      { slug: 1 },
      { unique: true, partialFilterExpression: { slug: { $gt: "" } } },
    ),
    // Featured positions are unique across posts, drafts included (as in the MDX build).
    posts.createIndex(
      { featured: 1 },
      {
        unique: true,
        partialFilterExpression: { featured: { $exists: true } },
      },
    ),
    posts.createIndex({ status: 1, date: -1 }),
    revisions.createIndex({ postId: 1, createdAt: -1, version: -1 }),
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
      async list() {
        const docs = await users.find().sort({ createdAt: 1 }).toArray();
        return docs.map(fromUserDoc);
      },
      async insert({ id, ...rest }) {
        await indexesReady;
        try {
          await users.insertOne(
            defined({ _id: id, ...rest, email: normaliseEmail(rest.email) }),
          );
        } catch (error) {
          if (error instanceof MongoServerError && error.code === DUPLICATE_KEY)
            throw new DuplicateEmailError("duplicate email");
          throw error;
        }
      },
      async update(id, changes, unset = []) {
        const doc = await users.findOneAndUpdate(
          { _id: id },
          {
            $set: defined(changes),
            ...(unset.length === 0
              ? {}
              : { $unset: Object.fromEntries(unset.map((key) => [key, ""])) }),
          },
          { returnDocument: "after" },
        );
        return doc === null ? null : fromUserDoc(doc);
      },
    },
    passwordLinks: {
      async insert({ tokenHash, ...rest }) {
        await indexesReady;
        await passwordLinks.insertOne({ _id: tokenHash, ...rest });
      },
      async find(tokenHash, now) {
        // The TTL monitor runs about once a minute, so check expiry here too.
        const doc = await passwordLinks.findOne({
          _id: tokenHash,
          expiresAt: { $gt: now },
        });
        return doc === null ? null : fromLinkDoc(doc);
      },
      async consume(tokenHash, now) {
        const doc = await passwordLinks.findOneAndDelete({
          _id: tokenHash,
          expiresAt: { $gt: now },
        });
        return doc === null ? null : fromLinkDoc(doc);
      },
      async deleteByUser(userId) {
        await passwordLinks.deleteMany({ userId });
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
        await uniqueSafe(() => posts.insertOne(defined({ _id: id, ...rest })));
      },
      async update(id, changes, unset = [], expectedVersion) {
        await indexesReady;
        const doc = await uniqueSafe(() =>
          posts.findOneAndUpdate(
            expectedVersion === undefined
              ? { _id: id }
              : { _id: id, version: expectedVersion },
            {
              $set: defined(changes),
              $inc: { version: 1 },
              ...(unset.length === 0
                ? {}
                : {
                    $unset: Object.fromEntries(unset.map((key) => [key, ""])),
                  }),
            },
            { returnDocument: "after" },
          ),
        );
        return doc === null ? null : fromPostDoc(doc);
      },
      async listPublished() {
        const docs = await posts
          .find({ status: "published" })
          .sort({ date: -1, publishedAt: -1, slug: 1 })
          .toArray();
        return docs.map(fromPostDoc);
      },
      async findPublishedBySlug(slug) {
        const doc = await posts.findOne({ slug, status: "published" });
        return doc === null ? null : fromPostDoc(doc);
      },
    },
    pages: {
      async publishedSlugs() {
        if ((await pages.estimatedDocumentCount()) === 0) return null;
        const docs = await pages.find({ status: "published" }).toArray();
        return docs.map((doc) => doc._id);
      },
    },
    uploads: {
      async insert({ url, ...rest }) {
        await uploads.insertOne({ _id: url, ...rest });
      },
      async findByUrls(urls) {
        const docs = await uploads.find({ _id: { $in: [...urls] } }).toArray();
        return docs.map(({ _id, ...rest }) => ({ url: _id, ...rest }));
      },
    },
    revisions: {
      async list(postId) {
        const docs = await revisions
          .find({ postId })
          .sort({ createdAt: -1, version: -1 })
          .toArray();
        return docs.map(fromRevisionDoc);
      },
      async find(postId, id) {
        const doc = await revisions.findOne({ _id: id, postId });
        return doc === null ? null : fromRevisionDoc(doc);
      },
      async insert({ id, ...rest }, keep) {
        await indexesReady;
        await revisions.insertOne({ _id: id, ...rest });
        const old = await revisions
          .find({ postId: rest.postId }, { projection: { _id: 1 } })
          .sort({ createdAt: -1, version: -1 })
          .skip(keep)
          .toArray();
        if (old.length > 0) {
          await revisions.deleteMany({
            _id: { $in: old.map((doc) => doc._id) },
          });
        }
      },
      async replace({ id, ...rest }) {
        await revisions.replaceOne({ _id: id }, rest);
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
      async deleteByUser(userId, keep) {
        await sessions.deleteMany(
          keep === undefined ? { userId } : { userId, _id: { $ne: keep } },
        );
      },
    },
  };
}

/** For tests only: lets each test database build its own indexes. */
export function resetIndexCacheForTests(): void {
  indexesReady = undefined;
}
