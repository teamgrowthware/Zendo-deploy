import { phoneZipResponse } from "@/lib/phone-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return phoneZipResponse(request);
}
