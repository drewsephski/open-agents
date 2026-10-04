import { connectToolkit, getConnectionStatus } from "@/lib/actions/connections";

type Context = { params: Promise<{ toolkit: string }> };
export async function GET(_request: Request, { params }: Context) {
  return getConnectionStatus((await params).toolkit);
}
export async function POST(request: Request, { params }: Context) {
  return connectToolkit(request, (await params).toolkit);
}
