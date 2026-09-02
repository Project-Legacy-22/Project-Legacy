// The logging port. It lives with the shared contracts rather than in infra so
// that the HTTP layer can depend on the capability without depending on the
// adapter: only the composition root is allowed to know that pino exists.
export interface Logger {
    info(fields: object, message?: string): void;
    warn(fields: object, message?: string): void;
    error(fields: object, message?: string): void;
    fatal(fields: object, message?: string): void;
}
