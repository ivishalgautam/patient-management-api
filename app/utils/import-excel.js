import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import xlsx from "xlsx";
import { pipeline } from "stream/promises";

// Reads the first sheet of an uploaded Excel/CSV file into row objects.
// The upload goes to a random temp file (never the client's filename).
export async function handleExcelImport(part) {
  const tempPath = path.join(os.tmpdir(), `import-${crypto.randomUUID()}`);
  await pipeline(part.file, fs.createWriteStream(tempPath));
  try {
    const workbook = xlsx.readFile(tempPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { raw: false });
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}
