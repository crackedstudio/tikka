import { envSchema } from './env.schema';

/**
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

  return result.value;
}
