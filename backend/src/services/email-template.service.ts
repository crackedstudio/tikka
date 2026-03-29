// generate the code for this file that would be used to manage email templates in the application.
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailTemplateService {
  private templates: Record<string, string> = {};

    // Method to add or update an email template
    setTemplate(name: string, content: string): void {
        this.templates[name] = content;
    }

    // Method to retrieve an email template by name
    getTemplate(name: string): string | undefined {
        return this.templates[name];
    }

    // Method to delete an email template by name
    deleteTemplate(name: string): void {
        delete this.templates[name];
    }

    // Method to list all available email templates
    listTemplates(): string[] {
        return Object.keys(this.templates);
    }

    // Method to render a template with provided variables
    renderTemplate(name: string, variables: Record<string, string>): string | undefined {
        const template = this.getTemplate(name);
        if (!template) {
            return undefined;
        }
        let rendered = template;
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            rendered = rendered.replace(new RegExp(placeholder, 'g'), value);
        }
        return rendered;
    }
}