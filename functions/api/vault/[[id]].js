const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
export async function onRequest({request,env,params}) {
  if(!env.DB)return reply({error:'Database not configured'},503);
  const id=params.id?.[0];
  if(params.id?.length!==1||!/^[-_A-Za-z0-9]{43}$/.test(id||''))return reply({error:'Not found'},404);
  const token=request.headers.get('Authorization')?.match(/^Bearer ([-_A-Za-z0-9]{43})$/)?.[1];
  if(!token)return reply({error:'Unauthorized'},401);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==new URL(request.url).origin)return reply({error:'Origin not allowed'},403);
  const authHash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  const method=request.method;
  try {
    if(method==='GET'){
      const row=await env.DB.prepare('SELECT ciphertext, version FROM vaults WHERE id = ? AND auth_hash = ?').bind(id,authHash).first();
      return row?reply({envelope:JSON.parse(row.ciphertext),version:row.version}):reply({error:'Account not found'},404);
    }
    if(method!=='POST'&&method!=='PUT')return reply({error:'Method not allowed'},405);
    // Bound the stream before JSON parsing, including chunked requests.
    const reader=request.body?.getReader();if(!reader)return reply({error:'Missing body'},400);
    const chunks=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();return reply({error:'Vault too large'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let envelope;try{envelope=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({error:'Invalid JSON'},400);}
    if(envelope.format!=='northstar-encrypted-v1'||!(/^[A-Za-z0-9+/]{16}$/.test(envelope.iv||''))||typeof envelope.data!=='string'||envelope.data.length<24||!(/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.data)))return reply({error:'Invalid ciphertext'},400);
    const ciphertext=JSON.stringify({format:envelope.format,iv:envelope.iv,data:envelope.data});
    if(method==='POST'){
      const result=await env.DB.prepare('INSERT OR IGNORE INTO vaults (id, auth_hash, ciphertext, version) VALUES (?, ?, ?, 1)').bind(id,authHash,ciphertext).run();
      return result.meta.changes===1?reply({version:1},201):reply({error:'Account already exists'},409);
    }
    const version=Number(request.headers.get('If-Match'));
    if(!Number.isSafeInteger(version)||version<1)return reply({error:'Revision required'},428);
    const result=await env.DB.prepare('UPDATE vaults SET ciphertext = ?, version = version + 1 WHERE id = ? AND auth_hash = ? AND version = ?').bind(ciphertext,id,authHash,version).run();
    if(result.meta.changes===1)return reply({version:version+1});
    const exists=await env.DB.prepare('SELECT version FROM vaults WHERE id = ? AND auth_hash = ?').bind(id,authHash).first();
    return exists?reply({error:'Revision conflict'},409):reply({error:'Account not found'},404);
  }catch{return reply({error:'Storage unavailable'},503);}
}
