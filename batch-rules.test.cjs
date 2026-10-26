const {test}=require('node:test');const assert=require('node:assert/strict');const rules=require('./batch-rules.js');
test('uma pendência bloqueia toda a remessa',()=>assert.equal(rules.summary([{id:1,status:'approved'},{id:2,status:'pending'}]).canRelease,false));
test('descartados não bloqueiam',()=>assert.equal(rules.summary([{id:1,status:'approved'},{id:2,status:'rejected'}]).canRelease,true));
test('remessa vazia não pode ser liberada',()=>assert.equal(rules.summary([]).canRelease,false));
test('todos descartados não gera fila',()=>assert.equal(rules.summary([{id:1,status:'rejected'}]).canRelease,false));
test('horários repetidos são inválidos',()=>assert.equal(rules.validateSlots([{time:'09:00',limit:8},{time:'09:00',limit:10}]),false));
test('limite fracionado e horário inválido são recusados',()=>{assert.equal(rules.validateSlots([{time:'25:00',limit:8}]),false);assert.equal(rules.validateSlots([{time:'09:00',limit:1.5}]),false)});
test('distribui 8 e 10, mantém excedente sem duplicar',()=>{let items=Array.from({length:23},(_,id)=>({id,status:'approved'}));items.push(items[0],{id:99,status:'rejected'});const p=rules.allocate(items,[{time:'12:00',limit:10},{time:'09:00',limit:8}]);assert.deepEqual(p.groups.map(g=>g.items.length),[8,10]);assert.equal(p.remaining.length,5);assert.equal(new Set([...p.groups.flatMap(g=>g.items),...p.remaining].map(x=>x.id)).size,23)});
