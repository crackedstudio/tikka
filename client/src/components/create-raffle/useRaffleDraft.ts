import { useCallback, useEffect, useRef, useState } from "react";
import type { RaffleFormData } from "../../types/forms";
import {
  RAFFLE_DRAFT_DEBOUNCE_MS,
  clearRaffleDraft,
  draftToFormData,
  formDataToDraft,
  loadRaffleDraft,
  saveRaffleDraft,
  type RaffleDraftData,
} from "./raffleDraftStorage";

interface UseRaffleDraftOptions {
  formData: RaffleFormData;
  currentStep: number;
  setFormData: React.Dispatch<React.SetStateAction<RaffleFormData>>;
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
}

interface UseRaffleDraftResult {
  pendingDraft: RaffleDraftData | null;
  showRestoreModal: boolean;
  restoreDraft: () => void;
  discardDraft: () => void;
  clearDraft: () => void;
}

export function useRaffleDraft({
  formData,
  currentStep,
  setFormData,
  setCurrentStep,
}: UseRaffleDraftOptions): UseRaffleDraftResult {
  const [pendingDraft, setPendingDraft] = useState<RaffleDraftData | null>(
    null,
  );
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const autosaveEnabledRef = useRef(false);
  const hasCheckedStorageRef = useRef(false);

  useEffect(() => {
    if (hasCheckedStorageRef.current) return;
    hasCheckedStorageRef.current = true;

    const savedDraft = loadRaffleDraft();
    if (savedDraft) {
      setPendingDraft(savedDraft);
      setShowRestoreModal(true);
      return;
    }

    autosaveEnabledRef.current = true;
  }, []);

  useEffect(() => {
    if (!autosaveEnabledRef.current) return;

    const timeoutId = window.setTimeout(() => {
      saveRaffleDraft(formDataToDraft(formData, currentStep));
    }, RAFFLE_DRAFT_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [formData, currentStep]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;

    setFormData(draftToFormData(pendingDraft));
    setCurrentStep(pendingDraft.currentStep);
    setPendingDraft(null);
    setShowRestoreModal(false);
    autosaveEnabledRef.current = true;
  }, [pendingDraft, setFormData, setCurrentStep]);

  const discardDraft = useCallback(() => {
    clearRaffleDraft();
    setPendingDraft(null);
    setShowRestoreModal(false);
    autosaveEnabledRef.current = true;
  }, []);

  const clearDraft = useCallback(() => {
    clearRaffleDraft();
    setPendingDraft(null);
    setShowRestoreModal(false);
  }, []);

  return {
    pendingDraft,
    showRestoreModal,
    restoreDraft,
    discardDraft,
    clearDraft,
  };
}
