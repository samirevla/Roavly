import { chatGPTSignInPath } from "../../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = "/api/mobile/auth/complete";
  return Response.redirect(
    new URL(chatGPTSignInPath(returnTo), url.origin),
    302,
  );
}
