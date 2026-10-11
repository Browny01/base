import type { ImgHTMLAttributes } from "react";
/** Desktop supplies a cache-backed implementation through the Vite boundary. */
export function BaseImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ""} />;
}
