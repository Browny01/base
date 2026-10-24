export function isNoteImage(value: string): boolean {
  return value.length<=100_000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export async function createNoteIcon(file: File): Promise<string> {
  if(!["image/png","image/jpeg","image/webp","image/gif","image/avif"].includes(file.type)||file.size>10_000_000)
    throw new Error("Choose a PNG, JPEG, WebP, GIF or AVIF image under 10 MB.");
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();image.src=url;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>32_000_000)
      throw new Error("Choose an image smaller than 32 megapixels.");
    const scale=Math.min(1,128/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext("2d");if(!context)throw new Error("Could not prepare this image.");
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL("image/png");if(!isNoteImage(result))throw new Error("Could not prepare this image.");
    return result;
  } finally {URL.revokeObjectURL(url);}
}
export function customNoteEmoji(value: string): string | null {
  const trimmed = value.trim();
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)];
  return segments.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(trimmed) ? trimmed : null;
}
