const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
process.env.MELI_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
const handler=require('./api/mercadolivre.js');
const {seal,unseal}=handler._test;
test('tokens cifrados exigem o mesmo usuário e integridade',()=>{const token=seal({access_token:'test-token'},'tokens:user1');assert(!token.includes('test-token'));assert.deepEqual(unseal(token,'tokens:user1'),{access_token:'test-token'});assert.throws(()=>unseal(token,'tokens:user2'));const b=Buffer.from(token,'base64url');b[30]^=1;assert.throws(()=>unseal(b.toString('base64url'),'tokens:user1'))});
async function invoke(req){const r={headers:{},setHeader(k,v){this.headers[k]=v},status(s){this.code=s;return this},json(b){this.body=b;return this},send(b){this.body=b;return this}};await handler({headers:{},query:{},...req},r);return r}
test('consulta sem sessão é recusada',async()=>{const r=await invoke({method:'GET',query:{action:'status'}});assert.equal(r.code,401);assert.equal(r.headers['Cache-Control'],'no-store')});
test('início vindo de outro site é recusado',async()=>{const r=await invoke({method:'POST',query:{action:'start'},headers:{origin:'https://example.com'}});assert.equal(r.code,403)});
test('callback sem solicitação anterior não troca código',async()=>{const r=await invoke({method:'GET',query:{action:'callback',code:'fake'}});assert.equal(r.code,400);assert.match(r.body,/Inicie a conexão/)});
test('state diferente é recusado antes da troca',async()=>{const cookie=seal({exp:Date.now()+60000,nonce:'expected'},'oauth');const r=await invoke({method:'GET',query:{action:'callback',state:'wrong',code:'fake'},headers:{cookie:'__Host-achado_meli='+cookie}});assert.equal(r.code,400);assert.match(r.body,/não corresponde/)});
test('busca filtra preço e desconto, elimina repetição e informa recusas',async()=>{
 const previous=global.fetch;process.env.MELI_CLIENT_ID='test';process.env.MELI_CLIENT_SECRET='test';
 const credentials=seal({access_token:'provider-test',expires_at:Date.now()+600000},'tokens:u1');
 global.fetch=async url=>{const path=new URL(url).pathname;let data,status=200;
 if(path==='/auth/v1/user')data={id:'u1'};
 else if(path==='/rest/v1/marketplace_connections')data=[{credentials}];
 else if(path.includes('/highlights/'))data={content:[{id:'MLB111111',type:'ITEM',position:1},{id:'MLB111111',type:'ITEM',position:2},{id:'MLB222222',type:'ITEM',position:3},{id:'MLB333333',type:'ITEM',position:4}]};
 else if(path==='/items/MLB111111')data={id:'MLB111111',title:'Produto',price:80,original_price:100,status:'active',currency_id:'BRL',permalink:'https://example.com',pictures:[]};
 else if(path==='/items/MLB222222')data={id:'MLB222222',price:800,status:'active',currency_id:'BRL'};
 else {status=403;data={}};
 return new Response(JSON.stringify(data),{status});};
 try{const r=await invoke({method:'POST',query:{action:'discover'},headers:{origin:'https://achado-omega.vercel.app',authorization:'Bearer test'},body:{category:'MLB123',maxPrice:100,discount:10}});assert.equal(r.code,200);assert.equal(r.body.items.length,1);assert.equal(r.body.items[0].discount,20);assert.equal(r.body.items[0].permalink,null);assert.equal(r.body.items[0].commission,null);assert.equal(r.body.unavailable,1);assert(!JSON.stringify(r.body).includes('provider-test'))}finally{global.fetch=previous}
});
