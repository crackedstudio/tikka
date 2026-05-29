import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SnapshotService } from "../maintenance/snapshot.service";
import * as path from "path";
import * as fs from "fs";

function loadEnvFile(file: string): void {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function bootstrap() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const filename = process.argv[2];
  if (!filename) {
    console.error("Usage: snapshot:import <filename>");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  const snapshotService = app.get(SnapshotService);

  try {
    console.log(`Starting snapshot import from S3: ${filename}...`);
    await snapshotService.importSnapshot(filename);
    console.log("Snapshot imported successfully");
  } catch (error) {
    console.error("Snapshot import failed:", error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
