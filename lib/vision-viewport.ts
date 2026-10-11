export type CanvasViewport = {x:number;y:number;width:number;height:number};
/** Generous overscan includes rotated corners and photo captions. Playing audio stays mounted. */
export function canvasItemVisible(item:{type:string;x:number;y:number;width:number;height:number;caption?:string}, viewport:CanvasViewport):boolean {
  if(item.type==="music" || (item.caption?.length ?? 0)>200)return true;
  const radius=Math.hypot(item.width,item.height)+160;
  return item.x+radius>=viewport.x-200 && item.y+radius>=viewport.y-200 && item.x-radius<=viewport.x+viewport.width+200 && item.y-radius<=viewport.y+viewport.height+200;
}
