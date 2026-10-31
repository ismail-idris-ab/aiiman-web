import { describe, expect, it } from "vitest";
import {
  MAX_BIO_LENGTH,
  newUserSchema,
  passwordSchema,
  profileInputSchema,
  userAccessSchema,
} from "../src/index.js";

const photo = {
  src: "https://abc123.public.blob.vercel-storage.com/images/me.webp",
  width: 800,
  height: 800,
  blurDataURL: "data:image/webp;base64,UklGRkAAAABXRUJQ",
};

describe("newUserSchema", () => {
  it("accepts a name, email and role", () => {
    expect(
      newUserSchema.parse({
        name: " Amina ",
        email: " amina@example.com ",
        role: "author",
      }),
    ).toEqual({ name: "Amina", email: "amina@example.com", role: "author" });
  });

  it("refuses unknown roles, bad emails and empty names", () => {
    for (const input of [
      { name: "A", email: "a@example.com", role: "owner" },
      { name: "A", email: "not an email", role: "author" },
      { name: "  ", email: "a@example.com", role: "author" },
    ]) {
      expect(newUserSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("passwordSchema", () => {
  it("needs 12 to 200 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(201)).success).toBe(false);
  });
});

describe("userAccessSchema", () => {
  it("needs a role or a status", () => {
    expect(userAccessSchema.safeParse({}).success).toBe(false);
    expect(userAccessSchema.parse({ role: "editor" })).toEqual({
      role: "editor",
    });
    expect(userAccessSchema.parse({ status: "deactivated" })).toEqual({
      status: "deactivated",
    });
    expect(userAccessSchema.safeParse({ status: "banned" }).success).toBe(
      false,
    );
  });
});

describe("profileInputSchema", () => {
  it("keeps a bio and an uploaded photo; an empty bio clears it", () => {
    expect(
      profileInputSchema.parse({ name: "Amina", bio: " Writes. ", photo }),
    ).toEqual({ name: "Amina", bio: "Writes.", photo });
    expect(profileInputSchema.parse({ name: "Amina", bio: "" })).toEqual({
      name: "Amina",
    });
  });

  it("refuses long bios and photos from elsewhere", () => {
    expect(
      profileInputSchema.safeParse({
        name: "A",
        bio: "a".repeat(MAX_BIO_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      profileInputSchema.safeParse({
        name: "A",
        photo: { ...photo, src: "https://example.com/me.webp" },
      }).success,
    ).toBe(false);
  });
});
