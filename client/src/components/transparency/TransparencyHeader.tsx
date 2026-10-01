// Header + explainer panel for the Transparency page.
// Displays the page title, subtitle, and links to the verification script
// and the RANDOMNESS_SCHEME.md document.

const TransparencyHeader = () => (
    <div className="bg-white dark:bg-[#11172E] rounded-3xl p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Transparency
        </h1>
        <p className="text-gray-400 text-sm max-w-2xl">
            Every oracle reveal is logged on-chain. Stats refresh every 30 seconds.
            Use the verify form to independently confirm any draw result.
        </p>
        <p className="text-gray-400 text-sm max-w-2xl mt-3">
            Re-check a published draw locally with{" "}
            <a
                className="text-pink-600 dark:text-[#FF389C] hover:underline"
                href="https://github.com/crackedstudio/tikka/blob/master/oracle/src/randomness/verify-published-draw.ts"
            >
                verify-published-draw
            </a>
            . It uses only the proof, seed, oracle public key, and participant
            list. The steps are in{" "}
            <a
                className="text-pink-600 dark:text-[#FF389C] hover:underline"
                href="https://github.com/crackedstudio/tikka/blob/master/docs/RANDOMNESS_SCHEME.md"
            >
                the randomness scheme
            </a>
            .
        </p>
    </div>
);

export default TransparencyHeader;
