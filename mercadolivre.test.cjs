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
