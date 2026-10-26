import http from 'node:http';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chunk, embed, generate, retrieve } from './rag.mjs';

export async function createApp({ dataDir = fileURLToPath(new URL('./data', import.meta.url)), key = process.env.OPENAI_API_KEY || '', model = process.env.OPENAI_MODEL || 'gpt-6-astra', embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small', fetcher = fetch } = {}) {
  await mkdir(dataDir, { recursive: true });
  const db = resolve(dataDir, 'documents.json');
  let documents;
  try { documents = JSON.parse(await readFile(db, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; documents = []; }
  let queue = Promise.resolve();
  const mutate = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
  async function save(next) { await writeFile(db + '.tmp', JSON.stringify(next)); await rename(db + '.tmp', db); documents = next; }
  const summary = () => documents.map(({id,name,chunks,embeddingModel}) => ({id,name,chunks:chunks.length,semantic:embeddingModel === embeddingModelActive}));
  const embeddingModelActive = embeddingModel;
  async function body(req) {
    let size = 0; const pieces = [];
    for await (const p of req) { size += p.length; if (size > 300000) throw Object.assign(new Error('Document too large. Limit: 100,000 characters.'), {status:413}); pieces.push(p); }
    try { return JSON.parse(Buffer.concat(pieces)); } catch { throw Object.assign(new Error('Invalid JSON.'), {status:400}); }
  }
  const bad = message => Object.assign(new Error(message), {status:400});
  return http.createServer(async (req,res) => {
    const send = (status, value) => { res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(value)); };
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return send(403,{error:'Local access only.'});
      if (req.headers.origin && ![`http://${host}`].includes(req.headers.origin)) return send(403,{error:'Cross-origin request rejected.'});
      const path = new URL(req.url, `http://${host}`).pathname;
      if (req.method === 'GET' && path === '/api/status') return send(200,{mode:key?'ai':'demo',documents:summary(),model:key?model:null});
      if (req.method === 'POST' && path === '/api/documents') {
        const {name,text} = await body(req);
        if (typeof name !== 'string' || !/\.(txt|md)$/i.test(name) || name.length > 160) throw bad('Use a .txt or .md filename (160 characters maximum).');
        if (typeof text !== 'string' || !text.trim() || text.length > 100000 || text.includes('\u0000')) throw bad('Upload nonempty UTF-8 text, up to 100,000 characters.');
        return send(201, await mutate(async () => {
          if (documents.length >= 50) throw bad('Starter limit: 50 documents. Remove a document first.');
          const chunks = chunk(text);
          const vectors = key ? await embed(chunks.map(c => c.text), key, embeddingModel, fetcher) : [];
          const doc = {id:randomUUID(),name,embeddingModel:key?embeddingModel:null,chunks:chunks.map((c,i)=>({...c,vector:vectors[i] || null}))};
          await save([...documents,doc]); return {id:doc.id,chunks:chunks.length};
        }));
      }
      if (req.method === 'DELETE' && path.startsWith('/api/documents/')) {
        const id = path.split('/').pop();
        await mutate(async () => { if (!documents.some(d=>d.id===id)) throw Object.assign(new Error('Document not found.'),{status:404}); await save(documents.filter(d=>d.id!==id)); });
        return send(200,{ok:true});
      }
      if (req.method === 'POST' && path === '/api/ask') {
        const {question} = await body(req);
        if (typeof question !== 'string' || !question.trim() || question.length>2000) throw bad('Enter a question of 1–2,000 characters.');
        if (!documents.length) return send(200,{answer:'Add a document first so I have evidence to search.',sources:[],mode:key?'ai':'demo'});
        if (key) await mutate(async () => {
          const next = structuredClone(documents); let changed = false;
          for (const doc of next) if (doc.embeddingModel !== embeddingModel) {
            const vectors = await embed(doc.chunks.map(c=>c.text),key,embeddingModel,fetcher);
            doc.chunks.forEach((c,i)=>c.vector=vectors[i]); doc.embeddingModel=embeddingModel; changed=true;
          }
          if(changed) await save(next);
        });
        const vector = key ? (await embed([question],key,embeddingModel,fetcher))[0] : null;
        const sources = retrieve(documents,question,vector,embeddingModel);
        if (!sources.length) return send(200,{answer:'I could not find enough relevant evidence in your documents. Try a more specific question or add a relevant source.',sources:[],mode:key?'ai':'demo'});
        const result = key ? await generate(question,sources,key,model,fetcher) : {answer:'Matching passages (local keyword search):\n\n'+sources.map(s=>`[${s.citation}] ${s.text}`).join('\n\n')};
        return send(200,{...result,sources,mode:key?'ai':'demo'});
      }
      const files = {'/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css']};
      if (req.method==='GET' && files[path]) {
        const [file,type] = files[path];
        res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});
        return res.end(await readFile(new URL(`./public/${file}`,import.meta.url)));
      }
      send(404,{error:'Not found.'});
    } catch(e) { send(e.status || 500,{error:e.status?e.message:(/OpenAI|citation|answer returned/.test(e.message)?e.message:'Request failed. Check the server configuration and try again.')}); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createApp();
  server.listen(Number(process.env.PORT || 3210),'127.0.0.1',()=>console.log(`Kit is ready at http://127.0.0.1:${process.env.PORT || 3210}`));
}
