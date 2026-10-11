import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { useWorkspaceScope } from "./store";
import { native } from "./native";
type Entry = { refs: number; promise: Promise<string>; url?: string };
const active = new Map<string, Entry>();
export function BaseImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const scope = useWorkspaceScope();
  const key = `${scope}:${src}`;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (typeof src !== "string" || !src.startsWith("https://")) return;
    let entry = active.get(key);
    if (!entry) {
      const promise = native<{ contentType: string; bodyBase64: string }>("cache_media", { scope, url: src }).then(result => {
        const bytes = Uint8Array.from(atob(result.bodyBase64),ch => ch.charCodeAt(0));
        return URL.createObjectURL(new Blob([bytes],{ type: result.contentType }));
      }).catch(() => src);
      entry = { refs: 0, promise };
      active.set(key,entry);
    }
    entry.refs++;
    let live = true;
    void entry.promise.then(url => { entry!.url = url; if (live) setLoaded({ key, url }); else if (entry!.refs === 0 && url.startsWith("blob:")) URL.revokeObjectURL(url); });
    return () => { live = false; if (--entry!.refs === 0) { active.delete(key); if (entry!.url?.startsWith("blob:")) URL.revokeObjectURL(entry!.url); } };
  }, [src,scope,key]);
  const resolved = typeof src === "string" && src.startsWith("https://") ? loaded?.key === key ? loaded.url : undefined : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} src={resolved} alt={props.alt ?? ""} />;
}
