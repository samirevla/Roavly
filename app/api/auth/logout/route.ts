import {
  clearSessionCookieHeader,
  destroyWebSession,
  sessionTokenFromCookieHeader,
} from "../../../chatgpt-auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/login";
  return value;
}

async function clearSession(request: Request) {
  const requestHeaders = await headers();
  const token =
    sessionTokenFromCookieHeader(requestHeaders.get("cookie")) ||
    sessionTokenFromCookieHeader(request.headers.get("cookie"));
  await destroyWebSession(token);
  return clearSessionCookieHeader(request.url);
}

export async function POST(request: Request) {
  const setCookie = await clearSession(request);
  return Response.json(
    { ok: true },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": setCookie,
      },
    },
  );
}

export async function GET(request: Request) {
  const setCookie = await clearSession(request);
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"));
  return new Response(null, {
    status: 302,
    headers: {
      location: returnTo,
      "cache-control": "no-store",
      "set-cookie": setCookie,
    },
  });
}
