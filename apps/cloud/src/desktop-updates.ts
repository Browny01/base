import type { Env } from "./types.ts";
// The release publisher uses the authenticated Cloudflare CLI; clients are read-only.
export async function desktopUpdate(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/desktop/updates" && request.method === "GET") {
    const target = url.searchParams.get("target"), arch = url.searchParams.get("arch");
    if (!["linux", "darwin", "windows"].includes(target ?? "") || !["x86_64", "aarch64"].includes(arch ?? ""))
      return new Response("Unsupported platform", { status: 400 });
    const object = await env.RELEASES?.get("desktop-releases/latest.json");
    if (!object) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    const manifest = JSON.parse(await object.text()) as { version: string; notes?: string; pub_date: string; platforms: Record<string, { url: string; signature: string }> };
    const platform = `${target}-${arch}`;
    if (!manifest.platforms[platform]) return new Response(null, { status: 204 });
    return Response.json({ ...manifest, platforms: { [platform]: manifest.platforms[platform] } }, { headers: { "Cache-Control": "no-store" } });
  }
  const match = /^\/api\/desktop\/download\/(\d+\.\d+\.\d+)\/(linux|darwin|windows)-(x86_64|aarch64)\/(Base[\w.-]+(?:\.AppImage|\.tar\.gz|\.nsis\.zip|\.exe))$/.exec(url.pathname);
  if (!match) return null;
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
  const object = await env.RELEASES?.get(`desktop-releases/${match[1]}/${match[2]}-${match[3]}/${match[4]}`);
  if (!object) return new Response(null, { status: 404 });
  return new Response(request.method === "HEAD" ? null : object.body as unknown as ReadableStream, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(object.size), "X-Content-Type-Options": "nosniff", "Cache-Control": "public,max-age=31536000,immutable" } });
}
