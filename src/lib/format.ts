import "server-only";

/**
 * Date formatting for components. Server-only so rendered dates can never
 * differ between server and browser (no hydration mismatches).
 */
export { formatDate, formatReadingTime, isoDay, yearOf } from "./dates";
