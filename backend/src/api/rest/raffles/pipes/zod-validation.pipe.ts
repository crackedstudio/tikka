import {
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from "@nestjs/common";
import { ZodSchema, ZodTypeDef, ZodError } from "zod";

/**
 * Creates a validation pipe using a Zod schema.
 *
 * When validation fails, throws BadRequestException with:
 * ```json
 * {
 *   "message": "error1; error2",
 *   "errors": [ { code, path, message, ... } ]
 * }
 * ```
 *
 * @example
 * ```typescript
 * @Get()
 * @UsePipes(new (createZodPipe(MySchema))())
 * async list(@Query() query: MyDto) { ... }
 * ```
 *
 * @param schema - Zod schema to validate against
 * @returns PipeTransform class that validates and transforms data
 * @throws BadRequestException when validation fails
 */
export function createZodPipe<Output, Input = Output>(schema: ZodSchema<Output, ZodTypeDef, Input>) {
  return class implements PipeTransform {
    transform(value: unknown, _metadata: ArgumentMetadata): Output {
      const result = schema.safeParse(value);
      if (!result.success) {
        const msg = result.error.errors.map((e) => e.message).join("; ");
        throw new BadRequestException({
          message: msg,
          errors: result.error.errors,
        });
      }
      return result.data;
    }
  };
}

/**
 * Parse a ZodError and extract summary information for logging.
 * @internal Used internally by validation pipe, exposed for testing/debugging.
 */
export function formatZodError(error: ZodError): string {
  return error.errors
    .map((e) => {
      const path = e.path.length > 0 ? `${e.path.join(".")} ` : "";
      return `${path}${e.message}`;
    })
    .join("; ");
}
