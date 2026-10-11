import test from "node:test";
import assert from "node:assert/strict";
import {remainingFocusSeconds,elapsedFocusMinutes} from "../lib/focus-clock.ts";
import {readDashboardWidgets,moveDashboardWidget,reorderDashboardWidget,DEFAULT_DASHBOARD_WIDGETS} from "../lib/dashboard-widgets.ts";
import {canvasItemVisible} from "../lib/vision-viewport.ts";

test("focus deadline survives throttled intervals and foreground recovery",()=>{
  const deadline=1000+25*60*1000;
  assert.equal(remainingFocusSeconds(deadline,1000),1500);
  assert.equal(remainingFocusSeconds(deadline,601_000),900);
  assert.equal(remainingFocusSeconds(deadline,deadline-1),1);
  assert.equal(remainingFocusSeconds(deadline,deadline+10_000),0);
  assert.equal(remainingFocusSeconds(NaN,1000),0);
});
test("focus logs active time rather than time spent paused",()=>{
  assert.equal(elapsedFocusMinutes(1500,900),10);
  assert.equal(elapsedFocusMinutes(1500,1500),0);
  assert.equal(elapsedFocusMinutes(1500,2000),0);
});
test("dashboard preferences recover malformed values without dropping known widget order",()=>{
  assert.deepEqual(readDashboardWidgets("invalid"),DEFAULT_DASHBOARD_WIDGETS);
  assert.deepEqual(readDashboardWidgets('{"tasks":true}'),DEFAULT_DASHBOARD_WIDGETS);
  assert.deepEqual(readDashboardWidgets('["news","future-widget","tasks","news",null]'),["news","tasks"]);
  assert.deepEqual(readDashboardWidgets("[]"),[]);
});
test("keyboard widget reordering keeps every enabled widget",()=>{
  const initial=["tasks","news","calendar"] as const;
  assert.deepEqual(moveDashboardWidget([...initial],"news",-1),["news","tasks","calendar"]);
  assert.deepEqual(moveDashboardWidget([...initial],"tasks",-1),initial);
  assert.deepEqual(initial,["tasks","news","calendar"]);
});
test("dragging widgets preserves enabled records and rejects missing targets",()=>{
  const widgets=["tasks","news","calendar"] as const;
  assert.deepEqual(reorderDashboardWidget([...widgets],"calendar","tasks"),["calendar","tasks","news"]);
  assert.deepEqual(reorderDashboardWidget([...widgets],"tasks","news"),["news","tasks","calendar"]);
  assert.deepEqual(reorderDashboardWidget([...widgets],"focus","tasks"),widgets);
});
test("canvas culling keeps rotated edges, editing candidates and audio while excluding distant items",()=>{
  const viewport={x:0,y:0,width:800,height:600};
  const item={type:"note",x:400,y:400,width:240,height:180};
  assert.ok(canvasItemVisible(item,viewport));
  assert.ok(canvasItemVisible({...item,x:900},viewport));
  assert.equal(canvasItemVisible({...item,x:2400,y:1700},viewport),false);
  assert.ok(canvasItemVisible({...item,type:"music",x:2400,y:1700},viewport));
  assert.ok(canvasItemVisible({...item,type:"photo",x:2400,y:1700,caption:"long".repeat(60)},viewport));
});

test("widget sizes survive reload and are bounded for narrow and malformed layouts",async()=>{
  const {readWidgetSizes,clampWidgetSize}=await import("../lib/dashboard-widgets.ts");
  assert.deepEqual(readWidgetSizes("invalid"),{});
  assert.deepEqual(readWidgetSizes('{"tasks":{"columns":20,"height":-100},"unknown":{"columns":1,"height":300}}'),{tasks:{columns:4,height:240}});
  assert.deepEqual(clampWidgetSize("tasks",2.7,377),{columns:3,height:384});
  assert.deepEqual(readWidgetSizes(JSON.stringify({news:{columns:1,height:384}})),{news:{columns:1,height:384}});
});
test("format shortcuts work on Mac and Linux without claiming ordinary typing or unrelated modifiers",async()=>{
  const {editorFormatCommand}=await import("../lib/editor-shortcuts.ts");
  const event={key:"b",metaKey:true,ctrlKey:false,shiftKey:false,altKey:false};
  assert.equal(editorFormatCommand(event),"bold");
  assert.equal(editorFormatCommand({...event,metaKey:false,ctrlKey:true,key:"u"}),"underline");
  assert.equal(editorFormatCommand({...event,key:"i"}),"italic");
  assert.equal(editorFormatCommand({...event,key:"k"}),"createLink");
  assert.equal(editorFormatCommand({...event,key:"X",shiftKey:true}),"strikeThrough");
  assert.equal(editorFormatCommand({...event,key:"\\",shiftKey:true}),"removeFormat");
  assert.equal(editorFormatCommand({...event,metaKey:false}),null);
  assert.equal(editorFormatCommand({...event,altKey:true}),null);
});
