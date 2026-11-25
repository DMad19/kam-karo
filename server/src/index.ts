import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { config } from "./config.js";
import { flagsRouter } from "./routes/flags.js";
import { haggleRouter } from "./routes/haggle.js";
import { itemsRouter } from "./routes/items.js";
import { opsRouter } from "./routes/ops.js";
import { enableStorePersistence } from "./store.js";
import type { HealthResponse } from "./types.js";

// Persist listings, stock and A/B stats to server/data/store.json so restarts keep them.
enableStorePersistence();

export const app = express();

app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json());

app.get("/api/health", (_req: Request, res: Response<HealthResponse>) => {
  res.json({ status: "ok", port: config.port });
});

app.use("/api", itemsRouter);
app.use("/api", haggleRouter);
app.use("/api", flagsRouter);
app.use("/api", opsRouter);

app.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    void _next;
    const message =
      err instanceof Error ? err.message : "Internal server error";
    const statusCode =
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      typeof err.status === "number"
        ? err.status
        : 500;

    res.status(statusCode).json({ error: message });
  }
);

app.listen(config.port, () => {
  console.log(`[SERVER] Kam Karo Express BFF listening on :${config.port}`);
});
