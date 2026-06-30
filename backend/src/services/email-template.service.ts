import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isEmailTemplateName,
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
}
