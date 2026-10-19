import { AppError } from './error.js';

/**
 * Parses req[source] with a Zod schema and replaces it with the parsed value,
 * so a handler downstream always receives coerced, trimmed, typed data.
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!details[key]) details[key] = issue.message;
      }
      return next(AppError.badRequest('Some fields need fixing', details));
    }
    req[source] = result.data;
    next();
  };
}
