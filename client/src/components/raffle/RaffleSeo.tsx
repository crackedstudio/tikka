import { Helmet } from "react-helmet-async";

interface RaffleSeoProps {
  title: string;
  description: string;
  image?: string;
}

const RaffleSeo = ({ title, description, image }: RaffleSeoProps) => {
  const pageTitle = `${title} | Tikka Raffles`;
  const metaDescription =
    description || "Join this raffle on Tikka — Decentralized Raffles on Stellar.";
  const metaImage = image || `${window.location.origin}/og-image.png`;
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
