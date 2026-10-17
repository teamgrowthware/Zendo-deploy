import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { readNotices, wallet } from "@/lib/engine";
import { fail } from "@/lib/errors";

export async function GET() {
  try {
    const user = await requireUser();
    const data = await wallet(user.id);
    const qr = await QRCode.toDataURL(data.user.address, {
      margin: 1,
      width: 320,
      color: { dark: "#10210a", light: "#f4f7ea" },
    });
    return Response.json({ ...data, qr });
  } catch (error) {
    return fail(error);
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    return Response.json(await readNotices(user.id));
  } catch (error) {
    return fail(error);
  }
}
