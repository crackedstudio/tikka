import {
  ArchiveDeleteConfirmationError,
  CONFIRM_DELETE_ENV,
  CONFIRM_DELETE_VALUE,
  isDeleteConfirmed,
  promptDeleteConfirmation,
  requireDeleteConfirmation,
} from "./confirmation";

describe("delete confirmation gate", () => {
  it("isDeleteConfirmed requires CONFIRM_DELETE=yes", () => {
    expect(isDeleteConfirmed({})).toBe(false);
    expect(isDeleteConfirmed({ CONFIRM_DELETE: "YES" })).toBe(false);
    expect(isDeleteConfirmed({ CONFIRM_DELETE: "yes" })).toBe(true);
  });

  it("exposes the env contract used by the runbook", () => {
    expect(CONFIRM_DELETE_ENV).toBe("CONFIRM_DELETE");
    expect(CONFIRM_DELETE_VALUE).toBe("yes");
  });

  it("requireDeleteConfirmation allows dry runs without confirmation", async () => {
    await expect(
      requireDeleteConfirmation({
        dryRun: true,
        env: {},
        stdinIsTTY: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("requireDeleteConfirmation accepts CONFIRM_DELETE=yes", async () => {
    await expect(
      requireDeleteConfirmation({
        dryRun: false,
        env: { CONFIRM_DELETE: "yes" },
        stdinIsTTY: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("requireDeleteConfirmation refuses non-interactive deletes without CONFIRM_DELETE", async () => {
    await expect(
      requireDeleteConfirmation({
        dryRun: false,
        env: {},
        stdinIsTTY: false,
      }),
    ).rejects.toBeInstanceOf(ArchiveDeleteConfirmationError);
  });

  it("names CONFIRM_DELETE in the non-interactive refusal so operators can self-serve", async () => {
    await expect(
      requireDeleteConfirmation({
        dryRun: false,
        env: {},
        stdinIsTTY: false,
      }),
    ).rejects.toThrow(/CONFIRM_DELETE=yes/);
  });

  it("requireDeleteConfirmation accepts interactive yes", async () => {
    await expect(
      requireDeleteConfirmation({
        dryRun: false,
        env: {},
        stdinIsTTY: true,
        prompt: async () => true,
      }),
    ).resolves.toBeUndefined();
  });

  it("requireDeleteConfirmation rejects interactive no", async () => {
    await expect(
      requireDeleteConfirmation({
        dryRun: false,
        env: {},
        stdinIsTTY: true,
        prompt: async () => false,
      }),
    ).rejects.toBeInstanceOf(ArchiveDeleteConfirmationError);
  });

  it("does not prompt when CONFIRM_DELETE=yes is already set", async () => {
    const prompt = jest.fn(async () => false);

    await expect(
      requireDeleteConfirmation({
        dryRun: false,
        env: { CONFIRM_DELETE: "yes" },
        stdinIsTTY: true,
        prompt,
      }),
    ).resolves.toBeUndefined();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("promptDeleteConfirmation treats only yes as confirmation", async () => {
    await expect(promptDeleteConfirmation(async () => "yes")).resolves.toBe(
      true,
    );
    await expect(promptDeleteConfirmation(async () => " YES ")).resolves.toBe(
      true,
    );
    await expect(promptDeleteConfirmation(async () => "no")).resolves.toBe(
      false,
    );
    await expect(promptDeleteConfirmation(async () => "")).resolves.toBe(false);
  });
});
