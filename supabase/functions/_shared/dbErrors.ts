/** Postgres SQLSTATE for a unique-constraint violation. */
export const UNIQUE_VIOLATION = "23505";

/** Messages the database raises on purpose (RAISE EXCEPTION); the functions turn them into API error codes. */
export const DB_RAISE = {
  parentContactLimit: "parent_contact_limit_reached",
  parentRequestLimit: "parent_request_limit_reached",
  selfLinkNotAllowed: "self_link_not_allowed",
} as const;
