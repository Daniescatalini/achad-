// Server-only Mercado Livre connector. No provider credentials are sent to the browser.
const crypto=require('node:crypto');
const ORIGIN='https://achado-omega.vercel.app';
const SB='https://pmhccydpnhfoikrzuwhd.supabase.co';
const PUBLIC_KEY='sb_publishable_kvOXdEea5NEw65hccud0ZA_XD0ybm_h';
const CALLBACK=ORIGIN+'/api/mercadolivre/callback';
class SafeError extends Error {constructor(message,status=400){super(message);this.status=status}}
function key(){const k=Buffer.from(process.env.MELI_ENCRYPTION_KEY||'','base64');if(k.length!==32)throw new SafeError('Configuração do servidor pendente.',503);return k}
function seal(data,purpose){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv);c.setAAD(Buffer.from(purpose));const body=Buffer.concat([c.update(JSON.stringify(data),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]).toString('base64url')}
function unseal(value,purpose){try{const b=Buffer.from(value,'base64url'),d=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAAD(Buffer.from(purpose));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString())}catch{throw new SafeError('Conexão expirada ou inválida. Conecte novamente.',401)}}
async function request(url,options={}){let r;try{r=await fetch(url,{...options,signal:AbortSignal.timeout(12000)})}catch{throw new SafeError('O serviço não respondeu. Tente novamente.',502)}const data=await r.json().catch(()=>null);return {r,data}}
async function auth(req){const jwt=(req.headers.authorization||'').replace(/^Bearer /,'');if(!jwt||jwt.length>5000)throw new SafeError('Entre na sua conta do Achadô.',401);const {r,data}=await request(SB+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+jwt}});if(!r.ok||!data?.id)throw new SafeError('Sua sessão expirou. Entre novamente.',401);return {jwt,uid:data.id}}
async function db(user,path,options={}){const {r,data}=await request(SB+'/rest/v1/'+path,{...options,headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+user.jwt,'Content-Type':'application/json',...options.headers}});if(!r.ok){if(['PGRST205','PGRST202'].includes(data?.code))throw new SafeError('Execute 003_mercadolivre.sql no Supabase antes de conectar.',409);throw new SafeError('Não foi possível salvar ou ler a conexão. Verifique sua sessão e o banco.',502)}return data}
function configured(){return Boolean(process.env.MELI_CLIENT_ID&&process.env.MELI_CLIENT_SECRET&&process.env.MELI_ENCRYPTION_KEY)}
async function exchange(params){const {r,data}=await request('https://api.mercadolibre.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:process.env.MELI_CLIENT_ID,client_secret:process.env.MELI_CLIENT_SECRET})});if(!r.ok||!data?.access_token)throw new SafeError('Mercado Livre não autorizou a conexão. Confira o aplicativo, a URL de retorno e conecte novamente.',401);return data}
async function load(user){const rows=await db(user,'marketplace_connections?provider=eq.mercadolivre&user_id=eq.'+encodeURIComponent(user.uid)+'&select=*');return rows?.[0]}
async function freshToken(user,row){let t=unseal(row.credentials,'tokens:'+user.uid);if(Number(t.expires_at)>Date.now()+60000)return t;
 const lock=crypto.randomUUID();const acquired=await db(user,'rpc/claim_marketplace_refresh',{method:'POST',body:JSON.stringify({p_lock:lock})});if(!acquired)throw new SafeError('Conexão em atualização. Aguarde e tente novamente.',409);
 try{row=await load(user);t=unseal(row.credentials,'tokens:'+user.uid);if(Number(t.expires_at)<=Date.now()+60000){if(!t.refresh_token)throw new SafeError('Autorize novamente o Mercado Livre.',401);const next=await exchange({grant_type:'refresh_token',refresh_token:t.refresh_token});t={...next,expires_at:Date.now()+next.expires_in*1000};await db(user,'rpc/finish_marketplace_refresh',{method:'POST',body:JSON.stringify({p_lock:lock,p_credentials:seal(t,'tokens:'+user.uid),p_expires_at:new Date(t.expires_at).toISOString()})});}else await db(user,'rpc/finish_marketplace_refresh',{method:'POST',body:JSON.stringify({p_lock:lock,p_credentials:row.credentials,p_expires_at:row.expires_at})});return t;
 }catch(e){/* Do not retry a possibly consumed refresh token automatically. */throw new SafeError('Não foi possível renovar com segurança. Conecte novamente ao Mercado Livre.',401)}
}
function json(res,status,data){return res.status(status).json(data)}
function completion(res,ok,message){const payload=JSON.stringify({type:'achado-meli',ok,message}).replace(/</g,'\\u003c');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");return res.status(ok?200:400).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Achadô · Mercado Livre</title><body style="font:16px system-ui;padding:40px;line-height:1.7"><h1>${ok?'Conta conectada':'Conexão não concluída'}</h1><p id="message"></p><a href="${ORIGIN}">Voltar ao Achadô</a><script>const result=${payload};document.getElementById('message').textContent=result.message;if(window.opener){window.opener.postMessage(result,${JSON.stringify(ORIGIN)});if(result.ok)window.close();}</script></body></html>`)}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');const action=req.query.action;
 try{
 if(action==='callback'){
  if(req.method!=='GET')throw new SafeError('Método inválido.',405);
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-achado_meli='));res.setHeader('Set-Cookie','__Host-achado_meli=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  if(!cookie)throw new SafeError('Inicie a conexão pelo botão no Achadô.',401);const state=unseal(cookie.slice(cookie.indexOf('=')+1),'oauth');
  if(!state.exp||state.exp<Date.now()||typeof req.query.state!=='string'||req.query.state!==state.nonce)throw new SafeError('A autorização expirou ou não corresponde à solicitação. Conecte novamente.',401);
  if(req.query.error||typeof req.query.code!=='string'||req.query.code.length>1000)throw new SafeError('Autorização cancelada ou código ausente.');
  const user=await auth({headers:{authorization:'Bearer '+state.jwt}});if(user.uid!==state.uid)throw new SafeError('Conta inválida.',401);
  const t=await exchange({grant_type:'authorization_code',code:req.query.code,redirect_uri:CALLBACK,code_verifier:state.verifier});t.expires_at=Date.now()+t.expires_in*1000;
  await db(user,'marketplace_connections',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:user.uid,provider:'mercadolivre',credentials:seal(t,'tokens:'+user.uid),expires_at:new Date(t.expires_at).toISOString(),refresh_lock:null,refresh_until:null})});
  return completion(res,true,'Sua conta do Mercado Livre foi conectada. Acesso a ofertas e comissões de afiliados ainda precisa ser confirmado.');
 }
 if(!['status','start','item','categories','discover'].includes(action))throw new SafeError('Recurso não encontrado.',404);
 const expected=action==='status'?'GET':'POST';if(req.method!==expected)throw new SafeError('Método inválido.',405);
 if(req.method==='POST'&&req.headers.origin!==ORIGIN)throw new SafeError('Origem inválida.',403);
 const user=await auth(req);
 if(!configured())return json(res,503,{error:'Configuração protegida do Mercado Livre pendente na Vercel.'});
 const row=await load(user);
 if(action==='status')return json(res,200,{configured:true,connected:Boolean(row),expires_at:row?.expires_at||null,affiliate_access:'unverified'});
 if(action==='start'){
  const verifier=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomBytes(32).toString('base64url');const state=seal({jwt:user.jwt,uid:user.uid,verifier,nonce,exp:Date.now()+600000},'oauth');
  if(state.length>3800)throw new SafeError('Sessão muito extensa. Entre novamente.',400);
  res.setHeader('Set-Cookie','__Host-achado_meli='+state+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  const url=new URL('https://auth.mercadolivre.com.br/authorization');for(const [k,v] of Object.entries({response_type:'code',client_id:process.env.MELI_CLIENT_ID,redirect_uri:CALLBACK,state:nonce,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(k,v);
  return json(res,200,{url:url.toString()});
 }
 if(action==='categories'||action==='discover'){
  if(!row)throw new SafeError('Conecte sua conta primeiro.',409);
  const input=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const category=String(input.category||'');
  if(category&&!/^MLB\d{2,12}$/.test(category))throw new SafeError('Categoria inválida.');
  const t=await freshToken(user,row);
  const get=async path=>{const result=await request('https://api.mercadolibre.com'+path,{headers:{Authorization:'Bearer '+t.access_token}});if(!result.r.ok)throw new SafeError(result.r.status===403?'O Mercado Livre não liberou este recurso para seu aplicativo. A conexão da conta não garante acesso ao catálogo.':result.r.status===404?'Recurso não encontrado no Mercado Livre: '+(path.startsWith('/highlights/')?'ranking da categoria':path.startsWith('/products/')?'produto de catálogo':path.startsWith('/user-products/')?'produto do vendedor':'anúncio ou listagem')+'.':result.r.status===429?'Limite do Mercado Livre atingido. Aguarde antes de buscar novamente.':'O Mercado Livre não respondeu à consulta (código '+result.r.status+').',result.r.status===403?403:result.r.status===429?429:400);return result.data};
  if(action==='categories'){const data=await get(category?'/categories/'+category:'/sites/MLB/categories');return json(res,200,category?{id:data.id,name:data.name,path:data.path_from_root,children:data.children_categories}:{children:data});}
  if(!category)throw new SafeError('Selecione uma categoria.');
  const maxPrice=Number(input.maxPrice),discount=Number(input.discount);
  if(!Number.isFinite(maxPrice)||maxPrice<=0||maxPrice>1000000||!Number.isFinite(discount)||discount<0||discount>100)throw new SafeError('Confira preço máximo e desconto mínimo.');
  const ranking=await get('/highlights/MLB/category/'+category);
  const found=[],failures=[];const seen=new Set();const candidates=(ranking.content||[]).slice(0,20);
  // Bounded batches avoid unbounded API fan-out.
  for(let start=0;start<candidates.length;start+=4){await Promise.all(candidates.slice(start,start+4).map(async c=>{try{
   let id=c.id;if(c.type==='PRODUCT'){const product=await get('/products/'+id);id=product.buy_box_winner?.item_id;if(!id)throw new SafeError('Produto de catálogo sem anúncio vencedor disponível.');}
   else if(c.type==='USER_PRODUCT'||/^MLBU\d+$/.test(id)){
    if(!/^MLBU\d+$/.test(id))throw new SafeError('Identificador de produto do vendedor inválido.');
    const up=await get('/user-products/'+id);
    if(!/^\d+$/.test(String(up.user_id)))throw new SafeError('Produto sem vendedor consultável.');
    const listing=await get('/users/'+up.user_id+'/items/search?user_product_id='+id+'&limit=1');
    id=listing.results?.[0];if(!id)throw new SafeError('Produto do vendedor sem anúncio acessível.');
   }else if(c.type!=='ITEM')throw new SafeError('Tipo de produto ainda não reconhecido pela integração.');
   if(!/^MLB\d+$/.test(id)||seen.has(id))return;seen.add(id);
   const item=await get('/items/'+id);const price=Number(item.price),old=Number(item.original_price);const pct=old>price&&price>0?(old-price)/old*100:null;
   if(item.status!=='active'||item.currency_id!=='BRL'||!Number.isFinite(price)||price<=0||price>maxPrice||discount>0&&(pct===null||pct<discount))return;
   const safe=(value,domain)=>{try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname===domain||u.hostname.endsWith('.'+domain))?u.href:null}catch{return null}};
   found.push({id,title:item.title,price,original_price:old>price?old:null,discount:pct,permalink:safe(item.permalink,'mercadolivre.com.br'),picture:safe(item.pictures?.[0]?.secure_url,'mlstatic.com'),position:c.position,checked_at:new Date().toISOString(),commission:null,affiliate_link:null,rating:null});
  }catch(e){failures.push(e.message)}}));}
  return json(res,200,{items:found.sort((a,b)=>a.position-b.position),examined:candidates.length,unavailable:failures.length,warnings:[...new Set(failures)],source:'Mais vendidos por categoria',coverage:'Até 20 entradas do ranking; não cobre todas as ofertas. Comissão, avaliações e cupons não confirmados.'});
 }

 if(!row)throw new SafeError('Conecte sua conta primeiro.',409);
 const input=typeof req.body==='string'?JSON.parse(req.body):req.body;const id=String(input?.item_id||'').trim().toUpperCase().replace(/^MLB-/,'MLB');if(!/^MLB\d{6,16}$/.test(id))throw new SafeError('Informe o ID do anúncio, como MLB123456789.');
 const t=await freshToken(user,row);const {r,data}=await request('https://api.mercadolibre.com/items/'+id,{headers:{Authorization:'Bearer '+t.access_token}});
 if(!r.ok)throw new SafeError(r.status===403?'O Mercado Livre não liberou este anúncio para seu aplicativo.':r.status===404?'Anúncio não encontrado.':'Não foi possível consultar este anúncio.',r.status===403?403:400);
 const safeURL=(url,domain)=>{try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname===domain||u.hostname.endsWith('.'+domain))?u.href:null}catch{return null}};
 return json(res,200,{id:data.id,title:data.title,price:data.price,currency:data.currency_id,status:data.status,original_price:data.original_price,permalink:safeURL(data.permalink,'mercadolivre.com.br'),pictures:(data.pictures||[]).slice(0,4).map(p=>safeURL(p.secure_url,'mlstatic.com')).filter(Boolean),checked_at:new Date().toISOString(),affiliate_link:null,commission:null,rating:null});
 }catch(e){const message=e instanceof SafeError?e.message:'Não foi possível concluir a operação. Tente conectar novamente.';if(action==='callback')return completion(res,false,message);return json(res,e instanceof SafeError?e.status:500,{error:message})}
};
module.exports._test={seal,unseal};
