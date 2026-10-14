import { isNoteImage } from "@/lib/note-icon";

export function NoteIcon({value,className=""}:{value?:string;className?:string}) {
  return isNoteImage(value??"")
    // Offline PNG data already lives in the workspace; no image server/cache subscription.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={value} alt="" draggable={false} className={`inline-block h-[1em] w-[1em] rounded-[20%] object-contain align-middle ${className}`}/>
    : <span className={className}>{value||"📄"}</span>;
}
