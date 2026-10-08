/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { sendDueJourneyReminders } from "../app/journey-reminders";
import { activeStartedPlanIds } from "../app/check-in-activity";
import { syncOverdueCheckIns } from "../app/check-in-overdue";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** Staging/production R2 media bucket (optional in local Sites preview). */
  BUCKET?: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  /** Hourly: journey reminders ~24h before start, and overdue check-in Activity rows. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = drizzle(env.DB, { schema });
    ctx.waitUntil(
      sendDueJourneyReminders(db).catch((error) => {
        console.error("journey reminders scheduled run failed", error);
      }),
    );
    ctx.waitUntil(
      (async () => {
        const now = new Date();
        const planIds = await activeStartedPlanIds(db, now);
        // Activity rows only: SMS and chat notes stay on their existing read-time path.
        if (planIds.length) await syncOverdueCheckIns(db, planIds, now, { activityOnly: true });
      })().catch((error) => {
        console.error("overdue check-in activity scheduled run failed", error);
      }),
    );
  },
};

export default worker;
