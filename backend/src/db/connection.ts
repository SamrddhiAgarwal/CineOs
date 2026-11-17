import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

// Expose `id` instead of `_id` and drop `__v` in every API response.
mongoose.set("strictQuery", true);
mongoose.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret._id;
    return ret;
  },
});

export async function connectDatabase(uri: string): Promise<void> {
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info(`MongoDB connected (${mongoose.connection.host}/${mongoose.connection.name})`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

const READY_STATES: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export function databaseState(): string {
  return READY_STATES[mongoose.connection.readyState] ?? "unknown";
}
