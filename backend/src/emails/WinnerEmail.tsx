export interface WinnerEmailProps {
  username: string;
  raffleName: string;
  claimUrl: string;
}

export function WinnerEmail({
  username,
  raffleName,
  claimUrl,
}: WinnerEmailProps) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <style>{`
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
    .header { background: #6366f1; color: white; padding: 40px 20px; text-align: center; }
    .content { padding: 30px; text-align: center; color: #333333; }
    .prize-box { background: #f9fafb; border: 2px dashed #6366f1; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .button { display: inline-block; padding: 14px 28px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; }
  `}</style>
      </head>
      <body>
        <div className="container">
          <div className="header">
            <h1>🏆 YOU WON!</h1>
          </div>
          <div className="content">
            <p>
              Hello <strong>{username}</strong>,
            </p>
            <p>
              The wait is over! You have been selected as the winner for the
              raffle:
            </p>
            <div className="prize-box">
              <h2 style={{ margin: 0, color: "#6366f1" }}>{raffleName}</h2>
            </div>
            <p>
              Click the button below to claim your prize and see the details.
            </p>
            <a href={claimUrl} className="button">
              Claim My Prize
            </a>
          </div>
          <div className="footer">
            <p
              dangerouslySetInnerHTML={{
                __html: "&copy; 2026 Tikka Platform. All rights reserved.",
              }}
            />
          </div>
        </div>
      </body>
    </html>
  );
}

export default WinnerEmail;
