import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

// Uploads a (client-downscaled) image to Vercel Blob and returns its public URL.
// The board stores that URL instead of a base64 data blob, keeping the synced
// nexus:data payload small.
export async function POST(req: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    // No Blob store wired up — caller falls back to an inline data URL.
    return NextResponse.json({ url: null, configured: false }, { status: 200 });
  }
  try {
    const filename = req.nextUrl.searchParams.get("filename") || `photo-${Date.now()}.jpg`;
    const contentType = req.headers.get("content-type") || "image/jpeg";
    const bytes = Buffer.from(await req.arrayBuffer());
    if (!bytes.length) {
      return NextResponse.json({ url: null, error: "empty body" }, { status: 400 });
    }
    const blob = await put(`vision/${filename}`, bytes, {
      access: "public",
      token,
      contentType,
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url, configured: true });
  } catch (err) {
    console.error("[blob/upload]", err);
    return NextResponse.json({ url: null, error: String(err) }, { status: 500 });
  }
}
