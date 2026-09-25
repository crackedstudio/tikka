import { logger } from '../../utils/logger';
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StepComponentProps } from "../../types/forms";
import CreateRaffleButton from "../CreateRaffleButton";
import { useNavigate } from "react-router-dom";
import { estimateCreate } from "../../services/sdkClient";

interface ReviewStepProps extends StepComponentProps {
  onSubmitSuccess?: () => void;
}

const ReviewStep: React.FC<ReviewStepProps> = ({
  formData,
  onNext,
  onBack,
  onSubmitSuccess,
}: ReviewStepProps) => {
  const { t } = useTranslation("create");
  const { t: tErrors } = useTranslation("errors");
  const navigate = useNavigate();
  const [feeXlm, setFeeXlm] = useState<string | null>(null);
  const [feeLoading, setFeeLoading] = useState(true);
  const [feeError, setFeeError] = useState<string | null>(null);

  const durationInSeconds =
    formData.duration.days * 24 * 60 * 60 +
    formData.duration.hours * 60 * 60;

  const ticketPriceStroops = Math.round(
    parseFloat(formData.pricePerTicket.toString()) * 1e7,
  ).toString();

  const endTime =
    Math.floor(Date.now() / 1000) + durationInSeconds;

  useEffect(() => {
    let cancelled = false;

    const loadFeeEstimate = async () => {
      setFeeLoading(true);
      setFeeError(null);

      try {
        const result = await estimateCreate({
          ticketPrice: ticketPriceStroops,
          totalTickets: formData.totalTickets,
          durationInSeconds: Math.max(0, durationInSeconds),
        });

        if (cancelled) return;

        if (result.success && result.data) {
          setFeeXlm(result.data.xlm);
        } else {
          setFeeError(result.error ?? tErrors("unableToEstimateFee"));
          setFeeXlm(null);
        }
      } catch (err) {
        if (cancelled) return;
        setFeeError(
          err instanceof Error ? err.message : tErrors("unableToEstimateFee"),
        );
        setFeeXlm(null);
      } finally {
        if (!cancelled) {
          setFeeLoading(false);
        }
      }
    };

    void loadFeeEstimate();

    return () => {
      cancelled = true;
    };
  }, [
    ticketPriceStroops,
    formData.totalTickets,
    durationInSeconds,
    tErrors,
  ]);

  const formatDuration = (days: number, hours: number) => {
    return `${days}d ${hours}h`;
  };

  const potentialRevenue = formData.pricePerTicket * formData.totalTickets;

  return (
    <div className="bg-white dark:bg-[#1E1932] rounded-xl p-6">
      <div className="flex items-center space-x-3 mb-2">
        <svg
          className="w-6 h-6 text-green-500"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <h3 className="text-gray-900 dark:text-white text-xl font-bold">{t("review.heading")}</h3>
      </div>
      <p className="text-gray-700 dark:text-gray-300 text-sm mb-6">
        {t("review.subtitle")}
      </p>

      <div className="space-y-6">
        {/* Raffle Details */}
        <div>
          <h4 className="text-gray-900 dark:text-white font-semibold mb-3">{t("review.raffleDetailsSection")}</h4>
          <div className="space-y-2">
            <div className="flex">
              <span className="text-gray-400 w-24">{t("review.titleLabel")}</span>
              <span className="text-gray-900 dark:text-white">{formData.title || t("review.notSet")}</span>
            </div>
            <div className="flex">
              <span className="text-gray-400 w-24">{t("review.descriptionLabel")}</span>
              <span className="text-gray-900 dark:text-white">
                {formData.description || t("review.notSet")}
              </span>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div>
          <h4 className="text-gray-900 dark:text-white font-semibold mb-3">{t("review.pricingSection")}</h4>
          <div className="space-y-2">
            <div className="flex">
              <span className="text-gray-400 w-24">{t("review.ticketPriceLabel")}</span>
              <span className="text-gray-900 dark:text-white">
                ${formData.pricePerTicket.toFixed(2)}
              </span>
            </div>
            <div className="flex">
              <span className="text-gray-400 w-24">{t("review.totalTicketsLabel")}</span>
              <span className="text-gray-900 dark:text-white">{formData.totalTickets}</span>
            </div>
            <div className="flex">
              <span className="text-gray-400 w-24">{t("review.durationLabel")}</span>
              <span className="text-gray-900 dark:text-white">
                {formatDuration(
                  formData.duration.days,
                  formData.duration.hours,
                )}
              </span>
            </div>
            <div className="flex">
              <span className="text-gray-400 w-24">{t("review.revenueLabel")}</span>
              <span className="text-gray-900 dark:text-white font-semibold">
                ${potentialRevenue.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Network Fee */}
        <div>
          <h4 className="text-gray-900 dark:text-white font-semibold mb-3">{t("review.networkFeeSection")}</h4>
          <div className="flex">
            <span className="text-gray-400 w-24">{t("review.estimatedFeeLabel")}</span>
            <span className="text-gray-900 dark:text-white">
              {feeLoading && t("review.feeCalculating")}
              {!feeLoading && feeError && (
                <span className="text-red-400">{feeError}</span>
              )}
              {!feeLoading && !feeError && feeXlm != null && `${feeXlm} XLM`}
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-2">
            {t("review.feeHint")}
          </p>
        </div>

        {/* Image Preview */}
        {formData.image && (
          <div>
            <h4 className="text-gray-900 dark:text-white font-semibold mb-3">{t("review.prizeImageSection")}</h4>
            <img
              src={URL.createObjectURL(formData.image)}
              alt={t("review.prizeImageAlt")}
              className="w-full h-48 object-cover rounded-lg border-2 border-yellow-400"
            />
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8 gap-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-200 dark:bg-[#2A264A] text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-[#3A365A] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#FF389C] focus:ring-offset-2 dark:focus:ring-offset-[#0B1220]"
        >
          {t("nav.back")}
        </button>
        <CreateRaffleButton
          title={formData.title}
          description={formData.description}
          image={
            formData.image
              ? URL.createObjectURL(formData.image)
              : "/src/assets/cptpnk.png"
          }
          imageFile={formData.image}
          prizeName={formData.title}
          prizeValue={formData.pricePerTicket.toString()}
          prizeCurrency="ETH"
          category="General"
          tags={[]}
          endTime={endTime}
          maxTickets={formData.totalTickets}
          allowMultipleTickets={true}
          ticketPrice={ticketPriceStroops}
          onSuccess={(raffleId) => {
            logger.log("Raffle created successfully with ID:", raffleId);
            onSubmitSuccess?.();
            navigate(`/raffles/${raffleId}`);
            onNext();
          }}
          onError={(error) => {
            logger.error("Error creating raffle:", error);
            alert(error);
          }}
        >
          {t("nav.confirmSubmit")}
        </CreateRaffleButton>
      </div>
    </div>
  );
};

export default ReviewStep;
