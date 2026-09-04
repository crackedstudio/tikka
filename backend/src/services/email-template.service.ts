import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isEmailTemplateName,
  EMAIL_TEMPLATE_REQUIRED_FIELDS,
  renderEmailTemplate,
  type EmailTemplateName,
  type EmailTemplateRegistry,
} from "../emails";

@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);

  render<K extends EmailTemplateName>(
    templateName: K,
    context: EmailTemplateRegistry[K],
  ): string;
  render(templateName: string, context: unknown): string;
  render(templateName: string, context: unknown): string {
    try {
      if (!isEmailTemplateName(templateName)) {
        this.logger.error(`Template not found: ${templateName}`);
        throw new InternalServerErrorException(
          `Email template ${templateName} not found`,
        );
      }

      this.assertRequiredContext(templateName, context);

      return `<!DOCTYPE html>${renderToStaticMarkup(
        renderEmailTemplate(
          templateName,
          context as EmailTemplateRegistry[typeof templateName],
        ),
      )}`;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(
        `Error rendering template ${templateName}:`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException("Failed to render email template");
    }
  }

  private assertRequiredContext<K extends EmailTemplateName>(
    templateName: K,
    context: unknown,
  ): asserts context is EmailTemplateRegistry[K] {
    if (context === null || typeof context !== "object") {
      throw new InternalServerErrorException(
        `Email template ${templateName} context is missing`,
      );
    }

    const missingFields = EMAIL_TEMPLATE_REQUIRED_FIELDS[templateName].filter(
      (field) => {
        const value = (context as Record<string, unknown>)[field as string];
        return value === undefined || value === null || value === "";
      },
    );

    if (missingFields.length > 0) {
      throw new InternalServerErrorException(
        `Email template ${templateName} missing required field(s): ${missingFields.join(", ")}`,
      );
    }
  }
}
