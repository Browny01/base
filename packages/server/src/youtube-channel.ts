/** Only fetch YouTube's fixed public origin; never a user-selected host. */
export async function GET(request: Request) {
  const input = new URL(request.url).searchParams.get("channel")?.trim() ?? "";
  let channel = input;
  if (input.startsWith("https://")) {
    const url = new URL(input);
    if (!["www.youtube.com", "youtube.com"].includes(url.hostname))
      return Response.json(
        { error: "Use a YouTube channel link" },
        { status: 400 },
      );
    channel = url.pathname
      .replace(/^\/channel\//, "")
      .replace(/^\//, "")
      .replace(/\/$/, "");
  }
  if (/^UC[\w-]{22}$/.test(channel))
    return Response.json({ channelId: channel });
  if (!/^@[\w.-]{1,100}$/.test(channel))
    return Response.json(
      { error: "Enter a YouTube @handle, channel URL or UC channel ID" },
      { status: 400 },
    );
  try {
    const response = await fetch(
      `https://www.youtube.com/${encodeURIComponent(channel).replace("%40", "@")}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw new Error("Unavailable");
    const html = await response.text();
    if (html.length > 3_000_000) throw new Error("Too large");
    const id = html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/)?.[1];
    if (!id) throw new Error("No channel");
    return Response.json({ channelId: id });
  } catch {
    return Response.json(
      {
        error:
          "YouTube could not resolve this channel. Try its /channel/UC… link.",
      },
      { status: 502 },
    );
  }
}
