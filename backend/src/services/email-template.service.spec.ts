import { Test, TestingModule } from "@nestjs/testing";
import { EmailTemplateService } from "./email-template.service";
import { InternalServerErrorException } from "@nestjs/common";

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
    it("renders the Winner email snapshot", () => {
      const result = service.render("Winner", {
        username: "Clinton",
        raffleName: "Mega Draw",
        claimUrl: "https://example.com/claim",
      });

      expect(result)
        .toMatchInlineSnapshot(`"<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
    .header { background: #6366f1; color: white; padding: 40px 20px; text-align: center; }
    .content { padding: 30px; text-align: center; color: #333333; }
    .prize-box { background: #f9fafb; border: 2px dashed #6366f1; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .button { display: inline-block; padding: 14px 28px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style></head><body><div class=\"container\"><div class=\"header\"><h1>🏆 YOU WON!</h1></div><div class=\"content\"><p>Hello <strong>Clinton</strong>,</p><p>The wait is over! You have been selected as the winner for the raffle:</p><div class=\"prize-box\"><h2 style=\"margin:0;color:#6366f1\">Mega Draw</h2></div><p>Click the button below to claim your prize and see the details.</p><a href=\"https://example.com/claim\" class=\"button\">Claim My Prize</a></div><div class=\"footer\"><p>&copy; 2026 Tikka Platform. All rights reserved.</p></div></div></body></html>"`);
    });

    it("renders the RaffleEnded email snapshot", () => {
      const result = service.render("RaffleEnded", {
        raffleName: "Mega Draw",
        resultsUrl: "https://example.com/results",
      });

      expect(result)
        .toMatchInlineSnapshot(`"<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
    .header { background: #1f2937; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; color: #4b5563; line-height: 1.6; }
    .status-badge { display: inline-block; padding: 4px 12px; background: #fee2e2; color: #dc2626; border-radius: 99px; font-size: 14px; font-weight: bold; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; }
  </style></head><body><div class=\"container\"><div class=\"header\"><h2>Raffle Competition Ended</h2></div><div class=\"content\"><div class=\"status-badge\">COMPLETED</div><p>Hello,</p><p>The entry period for <strong>Mega Draw</strong> has officially closed.</p><p>Our system is currently finalizing the results. You can check the final leaderboard and see the winner by clicking below.</p><a href=\"https://example.com/results\" style=\"color:#6366f1;font-weight:bold\">View Final Results &rarr;</a></div><div class=\"footer\"><p>Thank you for participating in Tikka!</p></div></div></body></html>"`);
    });

    it("should throw InternalServerErrorException if template does not exist", () => {
      expect(() => {
        service.render("non-existent", {});
      }).toThrow(InternalServerErrorException);
    });
  });
});
