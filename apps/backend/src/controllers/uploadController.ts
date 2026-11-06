import { Request, Response, NextFunction } from 'express';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { sendSuccess, sendError } from '../utils/apiResponse';

// RFC 5322 email validation pattern — covers the vast majority of valid addresses
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim().toLowerCase());
}

// ─── Why Streams? ─────────────────────────────────────────────────────────────
// A CSV with 10,000 recipients would use ~1MB+ of memory if read entirely
// into a buffer before parsing. Using Node.js streams, we process the file
// as it's read from disk — constant memory usage regardless of file size.
// Readable.from(buffer) creates an in-memory stream from multer's buffer,
// letting us use the streaming CSV parser without writing to disk.
// ─────────────────────────────────────────────────────────────────────────────

export async function parseUploadedFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400);
    }

    const valid = new Set<string>();
    const invalid: string[] = [];
    const duplicates: string[] = [];

    // Convert multer's in-memory buffer to a readable stream
    const stream = Readable.from(req.file.buffer);

    await new Promise<void>((resolve, reject) => {
      const parser = parse({
        // Handle both CSV (comma-separated) and plain text files
        // by trying to detect the delimiter automatically
        delimiter: req.file!.mimetype === 'text/plain' ? '\n' : ',',
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      stream.pipe(parser);

      parser.on('data', (row: string[]) => {
        // Each row might have multiple columns — check all cells for email addresses
        for (const cell of row) {
          const value = cell.trim().toLowerCase();
          if (!value) continue;

          if (!isValidEmail(value)) {
            invalid.push(value);
          } else if (valid.has(value)) {
            duplicates.push(value);
          } else {
            valid.add(value);
          }
        }
      });

      parser.on('end', resolve);
      parser.on('error', reject);
    });

    sendSuccess(res, {
      validCount: valid.size,
      invalidCount: invalid.length,
      duplicateCount: duplicates.length,
      recipients: Array.from(valid),
      sampleInvalid: invalid.slice(0, 10), // Return first 10 invalid for user feedback
    });
  } catch (err) {
    next(err);
  }
}
