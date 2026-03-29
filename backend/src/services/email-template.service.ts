import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);

  /**
   * Renders a handlebars template with the provided context
   * @param templateName Name of the file (without .hbs)
   * @param context Data to inject into the template
   */
  render(templateName: string, context: any): string {
    try {
      // 1. Resolve the path to the template file
      // Note: We look in 'dist' because that's where the compiled code runs from
      const templatePath = path.join(process.cwd(), 'assets', 'templates', `${templateName}.hbs`);

      // 2. Read the file content
      if (!fs.existsSync(templatePath)) {
        this.logger.error(`Template not found at path: ${templatePath}`);
        throw new InternalServerErrorException(`Email template ${templateName} not found`);
      }

      const source = fs.readFileSync(templatePath, 'utf8');

      // 3. Compile the template
      const template = handlebars.compile(source);

      // 4. Return the generated HTML string
      return template(context);
    } catch (error) {
      this.logger.error(`Error rendering template ${templateName}:`, error.stack);
      throw new InternalServerErrorException('Failed to render email template');
    }
  }
}