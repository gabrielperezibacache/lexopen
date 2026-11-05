// This shortcut is for a seeded development database with fictitious data.
export const DEMO_ACCESS_ENABLED = process.env.NODE_ENV === "development"
  && process.env.NEXT_PUBLIC_LEXOPEN_DEMO === "1";

export const DEMO_ACCOUNT = DEMO_ACCESS_ENABLED ? {
  email: "abogado@estudio.cl",
  password: "lexopen",
} : null;
