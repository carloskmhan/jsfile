/** Application fetches are same-origin only. No query or financial payload is transmitted. */
export async function localText(path,{maxBytes=5000000,timeoutMs=60000}={}){
 const u=new URL(path,globalThis.location?.href||'http://localhost/');
 if(u.origin!==globalThis.location?.origin)throw new Error('Data/config files must be hosted on the page origin. No cross-origin fallback is allowed.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const r=await fetch(u.href,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});if(!r.ok)throw new Error(`File load failed (${r.status}): ${u.pathname}`);if(Number(r.headers.get('content-length'))>maxBytes)throw new Error('File exceeds configured size limit.');const text=await r.text();if(new TextEncoder().encode(text).length>maxBytes)throw new Error('File exceeds configured size limit.');return text.replace(/^\uFEFF/,'');}finally{clearTimeout(timer);}
}
