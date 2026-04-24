export function Spinner() {
    return (
        <div
            className="flex min-h-[40vh] w-full items-center justify-center p-8"
            role="status"
            aria-label="Loading"
        >
            <span
                className="size-10 shrink-0 rounded-full border-2 border-neutral-300 border-t-neutral-800 dark:border-neutral-600 dark:border-t-neutral-200 animate-spin"
                aria-hidden
            />
        </div>
    );
}
