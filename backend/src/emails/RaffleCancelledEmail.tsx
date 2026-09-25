import { createElement } from "react";

export interface RaffleCancelledEmailProps {
  raffleName: string;
  cancellationReason: string;
  ticketCount: number;
  refundAmountXlm: string;
  raffleUrl: string;
}

export function RaffleCancelledEmail({
  raffleName,
  cancellationReason,
  ticketCount,
  refundAmountXlm,
  raffleUrl,
}: RaffleCancelledEmailProps) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <style>{`
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
    .header { background: #1f2937; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; color: #4b5563; line-height: 1.6; }
    .status-badge { display: inline-block; padding: 4px 12px; background: #fee2e2; color: #dc2626; border-radius: 99px; font-size: 14px; font-weight: bold; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
  `}</style>
      </head>
      <body>
        <div className="container">
          <div className="header">
            <h2>Raffle Cancelled</h2>
          </div>
          <div className="content">
            <div className="status-badge">CANCELLED</div>
            <p>Hello,</p>
            <p>
              We regret to inform you that the raffle <strong>{raffleName}</strong> has been cancelled.
            </p>
            <p>
              <strong>Reason:</strong> {cancellationReason}
            </p>
            <p>
              You purchased {ticketCount} ticket(s) for this raffle. You are eligible for a full refund of <strong>{refundAmountXlm} XLM</strong>.
            </p>
            <p>
              Please visit the raffle page to claim your refund.
            </p>
            <a href={raffleUrl} className="button">
              Claim Your Refund
            </a>
          </div>
          <div className="footer">
            <p>Thank you for participating in Tikka!</p>
          </div>
        </div>
      </body>
    </html>
  );
}

export default RaffleCancelledEmail;
