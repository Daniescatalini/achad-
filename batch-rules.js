(function(root){
const rules={
 summary(items){const unique=[...new Map(items.map(x=>[x.id,x])).values()];const pending=unique.filter(x=>!['approved','rejected'].includes(x.status)).length;const approved=unique.filter(x=>x.status==='approved').length;return {total:unique.length,pending,approved,rejected:unique.length-pending-approved,canRelease:unique.length>0&&pending===0&&approved>0};},
 validateSlots(slots){return Array.isArray(slots)&&slots.length>0&&slots.every(s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)&&Number.isInteger(s.limit)&&s.limit>=1&&s.limit<=30)&&new Set(slots.map(s=>s.time)).size===slots.length;},
 allocate(items,slots){if(!this.validateSlots(slots))throw Error('Horários inválidos');let queue=[...new Map(items.filter(x=>x.status==='approved').map(x=>[x.id,x])).values()];const groups=[...slots].sort((a,b)=>a.time.localeCompare(b.time)).map(s=>({...s,items:queue.splice(0,s.limit)}));return {groups,remaining:queue};}
};if(typeof module!=='undefined')module.exports=rules;else root.BatchRules=rules;
})(globalThis);
