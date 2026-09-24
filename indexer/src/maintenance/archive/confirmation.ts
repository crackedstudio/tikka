import * as readline from "readline";

/**
 * Confirmation gate for destructive archival runs.
 *
 * `DRY_RUN=false` deletes rows from `raffle_events`, so the operator must either
 * answer a TTY prompt or set `CONFIRM_DELETE=yes`. See
 * `docs/database/raffle-events-retention.md`.
 */

/** Env value that allows non-interactive destructive archival. */
export const CONFIRM_DELETE_ENV = "CONFIRM_DELETE";
export const CONFIRM_DELETE_VALUE = "yes";

/**
 * Thrown when DRY_RUN=false but the operator has not confirmed deletion.
 */
export class ArchiveDeleteConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveDeleteConfirmationError";
  }
}

/**
 * Returns true when CONFIRM_DELETE=yes is set (case-sensitive value).
 */
export function isDeleteConfirmed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[CONFIRM_DELETE_ENV] === CONFIRM_DELETE_VALUE;
}

/**
 * Interactive prompt used when stdin is a TTY and CONFIRM_DELETE is unset.
 */
export async function promptDeleteConfirmation(
  question: (
    prompt: string,
  ) => Promise<string> = defaultDeleteConfirmationQuestion,
): Promise<boolean> {
  const answer = await question(
    'This will DELETE archived raffle_events from the database after writing CSV. Type "yes" to continue: ',
  );
  return answer.trim().toLowerCase() === "yes";
}

function defaultDeleteConfirmationQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Gate destructive archival runs. Dry runs always pass.
 * Non-interactive environments must set CONFIRM_DELETE=yes.
 */
export async function requireDeleteConfirmation(options: {
  dryRun: boolean;
  env?: NodeJS.ProcessEnv;
  stdinIsTTY?: boolean;
  prompt?: () => Promise<boolean>;
}): Promise<void> {
  if (options.dryRun) {
    return;
  }

  const env = options.env ?? process.env;
  if (isDeleteConfirmed(env)) {
    return;
  }

  const stdinIsTTY = options.stdinIsTTY ?? Boolean(process.stdin.isTTY);
  if (stdinIsTTY) {
    const confirmed = options.prompt
      ? await options.prompt()
      : await promptDeleteConfirmation();
    if (!confirmed) {
      throw new ArchiveDeleteConfirmationError(
        'Archival aborted: deletion not confirmed. Re-run and type "yes", ' +
          `or set ${CONFIRM_DELETE_ENV}=${CONFIRM_DELETE_VALUE} for non-interactive use.`,
      );
    }
    return;
  }

  throw new ArchiveDeleteConfirmationError(
    "Archival aborted: DRY_RUN=false deletes rows from raffle_events. " +
      `Re-run with ${CONFIRM_DELETE_ENV}=${CONFIRM_DELETE_VALUE} to proceed, ` +
      "or omit DRY_RUN=false for a dry run. See docs/database/raffle-events-retention.md.",
  );
}
