import { useRef } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

export function ServiceWorkerUpdate() {
    const toastIdRef = useRef<string | number | null>(null);

    const { updateServiceWorker } = useRegisterSW({
        onNeedRefresh() {
            if (toastIdRef.current !== null) {
                toast.dismiss(toastIdRef.current);
            }

            const id = toast("New version available", {
                description:
                    "A new version of Tikka is available. Refresh to get the latest features.",
                duration: Infinity,
                action: {
                    label: "Refresh",
                    onClick: () => updateServiceWorker(),
                },
            });
            toastIdRef.current = id;
        },
    });

    return null;
}
