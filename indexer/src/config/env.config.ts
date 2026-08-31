import { envSchema } from './env.schema';

/***
 * Validates `process.env` against the Joi schema.
 * Throws an Error with a detailed message if validation fails.
 * Returns the validated values (with Joi defaults applied).
 */
export function validateEnv() {
  const result = envSchema.validate(process.env, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: false,
  });

  if (result.error) {
    const details = result.error.details
      .map((detail) => `- ${detail.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const env = result.value;

  // Database connection: either DATABASE_URL or all DB_* fields must be present.
  if (!env.DATABASE_URL) {
    const required = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
    const missing = required.filter((key) => env[key] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n- DATABASE_URL or ${missing.join(&, ')} must be set`,
      );
    }
  }

  return env;
}
