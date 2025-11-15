import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { Storage } from "@google-cloud/storage";

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

    // console.log({ gcsBucket, gcsStorage });

    const storage = ensureStorage();
    if (gcsBucket && storage) {
      try {
        const file = storage.bucket(gcsBucket).file(objectName);
        const [url] = await file.getSignedUrl({
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
      } catch {}
    }
    const uploadUrl = `memory://uploads/${objectName}`;
    res.json({ uploadUrl, objectName, provider: "memory", resumable: false });
  }
);
