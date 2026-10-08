import {
  AuthError,
  createAuthAccount,
  createWebSession,
  sessionCookieHeader,
} from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    displayName?: string;
  };

  try {
    const user = await createAuthAccount({
      email: payload.email || "",
      password: payload.password || "",
      displayName: payload.displayName,
    });
    const session = await createWebSession(user.email);
    return Response.json(
      { user },
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
          "set-cookie": sessionCookieHeader(
            session.token,
            session.expiresAt,
            request.url,
          ),
        },
      },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
