import { Test, TestingModule } from "@nestjs/testing";
import { EmailTemplateService } from "./email-template.service";
import { InternalServerErrorException } from "@nestjs/common";
import {
  EMAIL_TEMPLATE_REQUIRED_FIELDS,
  type EmailTemplateName,
  type EmailTemplateRegistry,
} from "../../emails";

const TEMPLATE_FIXTURES: {
  [K in EmailTemplateName]: {
    context: EmailTemplateRegistry[K];
    expectedText: string[];
  };
} = {
  Winner: {
    context: {
      username: "Clinton",
      raffleName: "Mega Draw",
      claimUrl: "https://example.com/claim",
    },
    expectedText: ["Clinton", "Mega Draw", "https://example.com/claim"],
  },
  RaffleEnded: {
    context: {
      raffleName: "Mega Draw",
      resultsUrl: "https://example.com/results",
    },
    expectedText: ["Mega Draw", "https://example.com/results"],
  },
  RaffleCancelled: {
    context: {
      raffleName: "Mega Draw",
      cancellationReason: "Organizer cancelled the event",
      ticketCount: 3,
      refundAmountXlm: "42.0000000",
      raffleUrl: "https://example.com/raffles/mega-draw",
    },
    expectedText: [
      "Mega Draw",
      "Organizer cancelled the event",
      "42.0000000 XLM",
      "https://example.com/raffles/mega-draw",
    ],
  },
};

const LEFTOVER_TEMPLATE_TOKEN_PATTERN = /{{|}}|<%|%>|\$\{/;

describe("EmailTemplateService", () => {
  let service: EmailTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailTemplateService],
    }).compile();

    service = module.get<EmailTemplateService>(EmailTemplateService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("render", () => {
    it.each(Object.entries(TEMPLATE_FIXTURES) as Array<
      [EmailTemplateName, (typeof TEMPLATE_FIXTURES)[EmailTemplateName]]
    >)("renders %s with all placeholders filled", (templateName, fixture) => {
      const result = service.render(templateName, fixture.context);

      for (const expected of fixture.expectedText) {
        expect(result).toContain(expected);
      }
      expect(result).not.toMatch(LEFTOVER_TEMPLATE_TOKEN_PATTERN);
      expect(result).toMatchSnapshot();
    });

    it("should throw InternalServerErrorException if template does not exist", () => {
      expect(() => {
        service.render("non-existent", {});
      }).toThrow(InternalServerErrorException);
    });

    it.each(Object.keys(EMAIL_TEMPLATE_REQUIRED_FIELDS) as EmailTemplateName[])(
      "throws when %s is missing a required variable",
      (templateName) => {
        const fixture = TEMPLATE_FIXTURES[templateName].context;
        const [fieldToRemove] = EMAIL_TEMPLATE_REQUIRED_FIELDS[templateName];
        const incompleteContext = { ...fixture } as Record<string, unknown>;
        delete incompleteContext[fieldToRemove as string];

        expect(() => service.render(templateName, incompleteContext)).toThrow(
          InternalServerErrorException,
        );
      },
    );
  });
});
