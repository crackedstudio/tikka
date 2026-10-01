import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

const NotFound = () => (
    <main className="flex min-h-[55vh] items-center justify-center px-6 py-16 text-gray-900 dark:text-white">
        <div className="w-full max-w-xl text-center">
            <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full border border-[#FE3796]/30 bg-[#FE3796]/10 text-[#FE3796]">
                <Compass aria-hidden="true" className="size-7" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#FE3796]">
                Error 404
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                This raffle trail ends here.
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-7 text-gray-600 dark:text-gray-400">
                That page doesn’t exist, or it may have moved. Head back to the start or browse the active raffles.
            </p>
            <nav aria-label="Recovery navigation" className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                    to="/"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 font-medium transition-colors hover:border-[#FE3796] hover:text-[#FE3796] dark:border-white/15"
                >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Go home
                </Link>
                <Link
                    to="/home"
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#FE3796] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[#e52b84]"
                >
                    Browse active raffles
                </Link>
            </nav>
        </div>
    </main>
);

export default NotFound;