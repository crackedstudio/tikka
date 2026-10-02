import { Helmet } from "react-helmet-async";
import { API_CONFIG } from "../../config/api";

interface RaffleSeoProps {
  raffleId: number;
  title: string;
  description: string;
}

const RaffleSeo = ({ raffleId, title, description }: RaffleSeoProps) => {
  const pageTitle = `${title} | Tikka Raffles`;
  const metaDescription =
    description || "Join this raffle on Tikka — Decentralized Raffles on Stellar.";
  // Scrapers cache whichever image URL the page advertises. Always emit the
  // single canonical card — never the raw photo, /og-image.png, or /og/raffles/:id.
  const apiBase = API_CONFIG.baseUrl.replace(/\/$/, "");
  const metaImage = `${apiBase}${API_CONFIG.endpoints.raffles.ogImage(raffleId)}`;
  const pageUrl = window.location.href;

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={metaDescription} />

      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={metaImage} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Tikka" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={metaImage} />
      <meta name="twitter:site" content="@tikaborofficial" />
      <meta name="twitter:creator" content="@tikaborofficial" />
    </Helmet>
  );
};

export default RaffleSeo;
