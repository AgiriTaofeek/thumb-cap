import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { attachRequestId, log } from "./logger.js";
import { router as videosRouter } from "./features/videos/videos.router.js";
import { router as framesRouter } from "./features/frames/frames.router.js";
import { router as thumbnailsRouter } from "./features/thumbnails/thumbnails.router.js";
import { router as captionsRouter } from "./features/captions/captions.router.js";
import { router as visionRouter } from "./features/vision/vision.router.js";
import { router as recommendationsRouter } from "./features/recommendations/recommendations.router.js";
import { router as safetyRouter } from "./features/safety/safety.router.js";
import { router as oauthRouter } from "./features/publish/oauth.router.js";
import { router as youtubeRouter } from "./features/publish/youtube.router.js";
import { router as hooksRouter } from "./features/orchestration/hooks.router.js";
import { router as orchestrationRouter } from "./features/orchestration/orchestration.router.js";
import { router as uploadRouter } from "./shared/upload.router.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use(morgan("dev"));
app.use(
  attachRequestId as unknown as (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void
);

app.get("/health", (req: Request & { id?: string }, res: Response) => {
  log("info", "health", { reqId: req.id });
  res.json({ status: "ok" });
});

app.use("/videos", videosRouter);
app.use("/frames", framesRouter);
app.use("/vision", visionRouter);
app.use("/thumbnails", thumbnailsRouter);
app.use("/captions", captionsRouter);
app.use("/recommendations", recommendationsRouter);
app.use("/safety", safetyRouter);
app.use("/oauth", oauthRouter);
app.use("/youtube", youtubeRouter);
app.use("/hooks", hooksRouter);
app.use(orchestrationRouter);
app.use(uploadRouter);

app.use((req: Request, res: Response) => {
  log("warn", "route.not_found", { path: req.path, method: req.method });
  res.status(404).json({ error: "not found" });
});
app.use(
  (
    err: any,
    req: Request & { id?: string },
    res: Response,
    next: NextFunction
  ) => {
    log("error", "unhandled", {
      reqId: req.id,
      message: String((err && err.message) || "error"),
    });
    res.status(500).json({ error: "internal server error" });
  }
);

export default app;
