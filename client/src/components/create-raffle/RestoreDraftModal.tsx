import React from "react";
import Modal from "../modals/Modal";
import type { RaffleDraftData } from "./raffleDraftStorage";

interface RestoreDraftModalProps {
  open: boolean;
  draft: RaffleDraftData;
  onRestore: () => void;
  onDiscard: () => void;
}

const RestoreDraftModal: React.FC<RestoreDraftModalProps> = ({
  open,
  draft,
  onRestore,
  onDiscard,
}) => {
  const savedLabel =
    draft.savedAt > 0
      ? new Date(draft.savedAt).toLocaleString()
      : "recently";

  return (
    <Modal open={open} onClose={onDiscard}>
      <div className="space-y-4">
        <h2
          id="modal-title"
          className="text-xl font-bold text-gray-900 dark:text-white"
        >
          Restore saved draft?
        </h2>
        <p className="text-gray-700 dark:text-gray-300 text-sm">
          We found an unsaved raffle draft from {savedLabel}. Would you like to
          restore it? Uploaded images are not saved and will need to be added
          again.
        </p>
        {draft.title.trim() && (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Draft title:{" "}
            <span className="text-gray-900 dark:text-white font-medium">
              {draft.title}
            </span>
          </p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-[#2A264A] text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-[#3A365A] transition-colors"
          >
            Start fresh
          </button>
          <button
            type="button"
            onClick={onRestore}
            className="px-4 py-2 rounded-lg bg-[#FF389C] hover:bg-[#FF389C]/90 text-white font-medium transition-colors"
          >
            Restore draft
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RestoreDraftModal;
