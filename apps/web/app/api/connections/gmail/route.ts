import { connectToolkit, getConnectionStatus } from "@/lib/actions/connections";

// Retain the existing Gmail URL for compatibility.
export function GET() {
  return getConnectionStatus("gmail");
}
export function POST(request: Request) {
  return connectToolkit(request, "gmail");
}
