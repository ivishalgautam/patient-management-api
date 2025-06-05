// utils/importExcel.js
import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import { pipeline } from "stream";
import { promisify } from "util";
const pump = promisify(pipeline);

export async function handleExcelImport(part, uploadSubDir = "uploads") {
  const uploadsDir = path.join(process.cwd(), uploadSubDir);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const tempPath = path.join(uploadsDir, part.filename);
  await pump(part.file, fs.createWriteStream(tempPath));

  const workbook = xlsx.readFile(tempPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { raw: false });

  fs.unlinkSync(tempPath);

  return data;
}
