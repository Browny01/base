/** Reproducible visual/performance data. Writes ONLY to the loopback test fixture. */
import {DEFAULT,type BaseData} from "../../lib/store.ts";

const count=Number(process.argv[2]??24);
if(!Number.isInteger(count)||count<1||count>20_000)throw new Error("Task count must be 1–20000.");
const now=new Date(),today=now.toISOString().slice(0,10),timestamp=now.toISOString();
const titles=["Plan the week","Review project milestones","Write the next chapter","Book a climbing session","Organize the reading list","Sketch the studio concept","Review monthly subscriptions","Prepare a focused work session"];
const projects=["Personal workspace","Studio refresh","Learning journal"];
const data:BaseData={...structuredClone(DEFAULT),
  profile:{...DEFAULT.profile,name:"Alex Morgan",onboardedAt:timestamp},
  tasks:Array.from({length:count},(_,i)=>({id:`fixture-task-${i}`,title:`${titles[i%titles.length]}${count>50?` · ${i}`:""}`,done:i%6===5,completedAt:i%6===5?timestamp:null,priority:i%7===0?"P1":i%3===0?"P3":"P2",tag:i%2===0?"work":"personal",dueDate:i%3===0?today:null,recurring:null,projectId:`fixture-project-${i%3}`,createdAt:timestamp,order:i,subtasks:i%4===0?[{id:`fixture-sub-${i}`,title:"Gather the details",done:false}]:[]})),
  projects:projects.map((name,i)=>({id:`fixture-project-${i}`,name,description:["A calm place for everyday plans, notes and ideas.","Bring a little more clarity to the spaces that matter.","Collect ideas and turn them into steady progress."][i],color:i===0?"indigo":i===1?"emerald":"orange",status:"active",category:i===0?"major":"side",createdAt:timestamp})),
  calendarEvents:[{id:"fixture-event",title:"Weekly planning",startDate:today,endDate:today,allDay:false,startTime:"10:00",endTime:"10:30",category:"personal",color:"indigo",repeat:"weekly",createdAt:timestamp,updatedAt:timestamp}],
  focusSessions:[{id:"fixture-focus",durationMins:25,tag:"work",notes:"Outline the workspace",date:today}],
  incomeEntries:[{id:"fixture-income",source:"Design work",amount:350,date:today,type:"income"},{id:"fixture-spent",source:"Studio supplies",amount:42,date:today,type:"spent"}],
  wallets:[{id:"fixture-wallet",network:"ethereum",label:"Everyday account",address:"0x0000000000000000000000000000000000000000"}],
  subscriptions:[{id:"fixture-subscription",name:"Studio tools",amount:18,dueDate:today,frequency:"monthly",category:"Tools",active:true,createdAt:timestamp}],
  wikiPages:[{id:"fixture-note",parentId:null,title:"A little clarity",icon:"📓",description:"Thoughts, plans and useful reminders.",blocks:[{id:"fixture-heading",type:"h2",text:"Make room for what matters"},{id:"fixture-text",type:"text",text:"A useful command center brings together the things you want to move forward. Keep the next step clear, leave space for new ideas, and make time for focused work."},{id:"fixture-todo",type:"todo",text:"Choose one meaningful task",checked:false},{id:"fixture-quote",type:"quote",text:"Small, deliberate steps add up."}],createdAt:timestamp,updatedAt:timestamp}],
  boards:[{id:"fixture-board",name:"Ideas for the year",createdAt:timestamp}],
  boardItems:Array.from({length:count>50?500:3},(_,i)=>({id:`fixture-board-${i}`,boardId:"fixture-board",type:"note",x:260+(i%8)*280,y:220+Math.floor(i/8)*210,width:240,height:170,z:i,rotation:(i%3-1)*2,text:["Build a space that feels clear.","Make time for deep work.","Stay curious. Keep learning."][i%3],color:i%3===0?"yellow":i%3===1?"blue":"pink",createdAt:timestamp})),
  shoppingList:[{id:"fixture-shopping",name:"Desk notebook",category:"other",price:12,priority:2,checked:false,createdAt:timestamp}],
  readingList:[{id:"fixture-reading",name:"The Creative Act",author:"Rick Rubin",category:"non-fiction",checked:false,createdAt:timestamp}],
  watchList:[{id:"fixture-watch",title:"A design documentary",kind:"movie",year:"2025",checked:false,createdAt:timestamp}],
};
const response=await fetch("http://127.0.0.1:3456/test/control",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({patch:data,offline:false})});
if(!response.ok)throw new Error(`Fixture rejected workload (${response.status}).`);
console.log(`Loaded isolated fixture: ${count} tasks, ${data.boardItems.length} board items.`);
