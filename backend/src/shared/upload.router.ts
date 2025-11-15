import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { Storage } from "@google-cloud/storage";
import { log } from "../logger.js";

let gcsStorage: any = null;
function ensureStorage() {
  if (!gcsStorage) {
    try {
      gcsStorage = new Storage();
    } catch {}
  }
  return gcsStorage;
}

export const router = Router();

router.post(
  "/upload-url",
  async (req: Request & { id?: string }, res: Response) => {
    const { fileName, contentType } = req.body || {};
    if (!fileName)
      return res.status(400).json({ error: "fileName is required" });
    const objectName = `${uuidv4()}_${fileName}`;
    const gcsBucket: string | null = process.env.GCS_BUCKET || null;

    if (!gcsBucket) {
      log("warn", "upload.no_bucket", {});
    }

    const storage = ensureStorage();
    log("info", "upload.debug", {
      fileName,
      contentType,
      GCS_BUCKET: gcsBucket,
      storageInitialized: !!storage,
    });

    
    if (gcsBucket && storage) {
      try {
        const file = storage.bucket(gcsBucket).file(objectName);
        const [url] = await file.getSignedUrl({
          version: "v4",
          action: "write",
          expires: Date.now() + 15 * 60 * 1000,
          contentType: contentType || "application/octet-stream",
        });
        return res.json({
          uploadUrl: url,
          objectName,
          provider: "gcs",
          resumable: false,
        });
      } catch (e: any) {
        log("error", "upload.sign_error", {
          message: String((e && e.message) || e),
        });
      }
    }
    const uploadUrl = `memory://uploads/${objectName}`;
    res.json({
      uploadUrl,
      objectName,
      provider: "memory",
      provider_reason: !gcsBucket ? "no_bucket" : "sign_failed",
      resumable: false,
    });
  }
);
