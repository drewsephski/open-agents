import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthPageHref } from "@/lib/auth/auth-href";
import { AUTH_REQUEST_PATH_HEADER } from "@/lib/auth/request-path";
import { getServerSession } from "./get-server-session";

export async function requireServerSession(fallbackPath = "/sessions") {
  const session = await getServerSession();
  if (!session?.user) {
    const requestPath = (await headers()).get(AUTH_REQUEST_PATH_HEADER);
    redirect(getAuthPageHref("/sign-in", requestPath ?? fallbackPath));
  }

  return session;
}
