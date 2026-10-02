import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ArchiveIntegrityError,
  archiveChecksumPath,
  assertArchiveChecksum,
  computeFileSha256,
  parseArchiveChecksum,
  readExpectedArchiveHash,
  serializeArchiveChecksum,
  verifyArchiveChecksum,
  writeArchiveChecksum,
} from "./checksum";

/**
 * The checksum sidecar is what makes an archive restorable: without it a
 * truncated CSV is indistinguishable from a complete one.
 */
describe("archive checksum", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-sum-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function writeArchive(name: string, content: string): string {
    const file = path.join(tmpDir, name);
    fs.writeFileSync(file, content, "utf8");
    return file;
  }

  describe("paths and serialization", () => {
    it("puts the sidecar next to the archive with a .sha256 suffix", () => {
      expect(archiveChecksumPath("/archives/batch0001.csv")).toBe(
        "/archives/batch0001.csv.sha256",
      );
    });

    it("serializes in sha256sum format so the coreutils tool can check it", () => {
      const hash = "a".repeat(64);

      expect(serializeArchiveChecksum(hash, "/archives/batch0001.csv")).toBe(
        `${hash}  batch0001.csv\n`,
      );
    });

    it("parses a digest and rejects anything that is not a SHA-256", () => {
      expect(parseArchiveChecksum(`${"b".repeat(64)}  batch.csv\n`)).toBe(
        "b".repeat(64),
      );
      // Uppercase digests are normalized to lowercase.
      expect(parseArchiveChecksum(`${"C".repeat(64)}  batch.csv\n`)).toBe(
        "c".repeat(64),
      );
      expect(parseArchiveChecksum("")).toBeNull();
      expect(parseArchiveChecksum("not-a-hash  batch.csv\n")).toBeNull();
      // A truncated digest (e.g. sha1) must not be accepted as a SHA-256.
      expect(parseArchiveChecksum("ab12  batch.csv\n")).toBeNull();
    });
  });

  describe("computeFileSha256", () => {
    it("hashes the exact bytes on disk", async () => {
      const file = writeArchive("exact.csv", "id,raffle_id\n1,2\n");

      expect(await computeFileSha256(file)).toBe(
        "3bfa8190367b8e1c234798df9c7b17351486256db0c51ecdc1d15f4e58e62392",
      );
    });

    it("changes when a single byte changes", async () => {
      const file = writeArchive("tamper.csv", "id\n1\n");
      const before = await computeFileSha256(file);

      fs.writeFileSync(file, "id\n2\n", "utf8");

      expect(await computeFileSha256(file)).not.toBe(before);
    });
  });

  describe("verifyArchiveChecksum", () => {
    it("reports ok when the sidecar matches the file", async () => {
      const file = writeArchive("ok.csv", "id\n1\n");
      const written = await writeArchiveChecksum(file);

      const verification = await verifyArchiveChecksum(file);

      expect(verification.status).toBe("ok");
      expect(verification.expectedHash).toBe(written);
      expect(verification.actualHash).toBe(written);
      expect(readExpectedArchiveHash(file)).toBe(written);
    });

    it("reports missing when there is no sidecar, and does not invent a hash", async () => {
      const file = writeArchive("nosum.csv", "id\n1\n");

      const verification = await verifyArchiveChecksum(file);

      expect(verification.status).toBe("missing");
      expect(verification.expectedHash).toBeNull();
      expect(verification.reason).toContain(".sha256");
    });

    it("reports mismatch when the archive is edited after being written", async () => {
      const file = writeArchive("edited.csv", "id,tx_hash\n1,tx-a\n");
      const written = await writeArchiveChecksum(file);

      fs.writeFileSync(file, "id,tx_hash\n1,tx-b\n", "utf8");

      const verification = await verifyArchiveChecksum(file);

      expect(verification.status).toBe("mismatch");
      expect(verification.expectedHash).toBe(written);
      expect(verification.actualHash).not.toBe(written);
    });

    it("reports mismatch when only the sidecar was edited", async () => {
      const file = writeArchive("sidecar.csv", "id\n1\n");
      await writeArchiveChecksum(file);

      fs.writeFileSync(
        archiveChecksumPath(file),
        serializeArchiveChecksum("f".repeat(64), file),
        "utf8",
      );

      expect((await verifyArchiveChecksum(file)).status).toBe("mismatch");
    });
  });

  describe("assertArchiveChecksum", () => {
    it("resolves for an intact archive", async () => {
      const file = writeArchive("assert-ok.csv", "id\n1\n");
      await writeArchiveChecksum(file);

      await expect(assertArchiveChecksum(file)).resolves.toMatchObject({
        status: "ok",
      });
    });

    it("throws ArchiveIntegrityError carrying both hashes on mismatch", async () => {
      const file = writeArchive("assert-bad.csv", "id\n1\n");
      await writeArchiveChecksum(file);
      fs.writeFileSync(file, "id\n2\n", "utf8");

      await expect(assertArchiveChecksum(file)).rejects.toBeInstanceOf(
        ArchiveIntegrityError,
      );

      await expect(assertArchiveChecksum(file)).rejects.toMatchObject({
        archivePath: file,
        expectedHash: expect.any(String),
        actualHash: expect.any(String),
      });
    });

    it("refuses a missing sidecar unless allowMissing is set", async () => {
      const file = writeArchive("assert-missing.csv", "id\n1\n");

      await expect(assertArchiveChecksum(file)).rejects.toBeInstanceOf(
        ArchiveIntegrityError,
      );
      await expect(
        assertArchiveChecksum(file, { allowMissing: true }),
      ).resolves.toMatchObject({ status: "missing" });
    });

    it("never allows a mismatch, even with allowMissing", async () => {
      const file = writeArchive("assert-mismatch.csv", "id\n1\n");
      await writeArchiveChecksum(file);
      fs.writeFileSync(file, "id\n3\n", "utf8");

      await expect(
        assertArchiveChecksum(file, { allowMissing: true }),
      ).rejects.toBeInstanceOf(ArchiveIntegrityError);
    });
  });
});
