import { AppError } from './error.js';

/**
 * Parses req[source] with a Zod schema and replaces it with the parsed value,
 * so a handler downstream always receives coerced, trimmed, typed data.
 *
 * req.query needs defineProperty rather than assignment. In Express 5 it is a
 * getter that re-parses the URL, and a plain assignment to it is silently
 * dropped - which would leave coerced numbers as strings and schema defaults
 * never applied, so a paginated handler would compute NaN offsets without ever
 * raising an error.
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

    if (source === 'query') {
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[source] = result.data;
    }

    next();
  };
}
