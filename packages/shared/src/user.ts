import { z } from "zod";
import { isBlurDataUrl } from "./doc.js";
import { ROLES, USER_STATUSES } from "./policy.js";
import { isBlobImageUrl } from "./vocab.js";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_NAME_LENGTH = 100;
export const MAX_BIO_LENGTH = 300;

/** Setup and reset links stop working after this long. */
export const PASSWORD_LINK_HOURS = 24;

export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Use at least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words work well.`,
  )
  .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters`);

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(MAX_NAME_LENGTH, `Use at most ${MAX_NAME_LENGTH} characters`);

/** What an admin enters to add a user; they then get a setup link to pass on. */
export const newUserSchema = z.object({
  name: nameSchema,
  email: z.string().trim().pipe(z.email("Enter an email address").max(254)),
  role: z.enum(ROLES),
});

export type NewUserInput = z.infer<typeof newUserSchema>;

/** An admin's change to someone else's access. */
export const userAccessSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .refine(
    (input) => input.role !== undefined || input.status !== undefined,
    "Choose a role or status",
  );

/** A profile photo: an uploaded image. Its alt text is the person's name. */
export const photoSchema = z.object({
  src: z
    .string()
    .refine(isBlobImageUrl, "Upload the photo here instead of linking it"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  blurDataURL: z.string().refine(isBlurDataUrl),
});

export type Photo = z.infer<typeof photoSchema>;

/** What a user edits about themselves; an absent bio or photo clears it. */
export const profileInputSchema = z.object({
  name: nameSchema,
  bio: z
    .string()
    .trim()
    .max(MAX_BIO_LENGTH, `Use at most ${MAX_BIO_LENGTH} characters`)
    .optional()
    .transform((bio) => (bio === "" ? undefined : bio)),
  photo: photoSchema.optional(),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
/** What a form sends: a bio may be absent. */
export type ProfileFormInput = z.input<typeof profileInputSchema>;
