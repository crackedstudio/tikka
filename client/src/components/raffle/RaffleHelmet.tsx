import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

interface RaffleHelmetProps {
    title: string;
    description?: string;
    image?: string;
}

const RaffleHelmet = ({ title, description, image }: RaffleHelmetProps) => {
    const { t } = useTranslation();
    const pageTitle = `${title} | Tikka Raffles`;
    const ogDescription = description || t("raffle.ogDescription");
    const ogImage = image || `${window.location.origin}/og-image.png`;

    return (
        <Helmet>
            <title>{pageTitle}</title>
            <meta name="description" content={ogDescription} />
            <meta property="og:title" content={pageTitle} />
            <meta property="og:description" content={ogDescription} />
            <meta property="og:image" content={ogImage} />
            <meta property="og:url" content={window.location.href} />
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="Tikka" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={pageTitle} />
            <meta name="twitter:description" content={ogDescription} />
            <meta name="twitter:image" content={ogImage} />
            <meta name="twitter:site" content="@tikaborofficial" />
            <meta name="twitter:creator" content="@tikaborofficial" />
        </Helmet>
    );
};

export default RaffleHelmet;
