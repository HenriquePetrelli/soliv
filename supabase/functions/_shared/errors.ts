/**
 * O `message` de um erro pego num `catch` (Error ou erro do Supabase em
 * objeto `{ message }`), ou `undefined` — o mesmo que `error.message` dava.
 */
export const errorMessage = (error: unknown): string | undefined => {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : undefined;
};

/** O `code` de um erro do Postgres/Supabase (ex.: "23505"), ou `undefined`. */
export const errorCode = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
};
