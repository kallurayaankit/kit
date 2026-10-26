import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
import { chunk, cosine, retrieve, generate } from '../rag.mjs';

test('chunking retains every character, overlap and bounded size',()=>{
  const text='The learning budget is 1200 dollars. '.repeat(120).trim();
  const chunks=chunk(text);assert.ok(chunks.length>2);
  assert.equal(chunks[0].start,0);assert.equal(chunks.at(-1).end,text.length);
  chunks.forEach((c,i)=>{assert.equal(c.text,text.slice(c.start,c.end));assert.ok(c.text.length<=1000);if(i)assert.equal(chunks[i-1].end-c.start,180);});
});
test('semantic retrieval can find a passage without shared keywords',()=>{
  const docs=[{id:'a',name:'policy.md',embeddingModel:'test',chunks:[{text:'Automobile repairs',vector:[1,0],start:0,end:18}]}];
  assert.equal(retrieve(docs,'vehicle maintenance').length,0);
  assert.equal(retrieve(docs,'vehicle maintenance',[1,0],'test')[0].name,'policy.md');
  assert.equal(cosine([0,0],[1,0]),0);
});
test('generation rejects nonexistent citation identifiers',async()=>{
  const fetcher=async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'The budget is $1200 [99].'}]}]})});
  await assert.rejects(generate('budget?',[{citation:1,text:'budget $1200'}],'fake','test',fetcher),/invalid source citation/);
});
for(const ai of [false,true]) test(`${ai?'AI with mocked provider':'offline'}: upload, answer, persistence, delete and validation`,async()=>{
  const dir=await mkdtemp(join(tmpdir(),'kit-test-'));let server;
  const calls=[];
  const fetcher=async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body});
    return {ok:true,json:async()=>url.endsWith('/embeddings')?{data:body.input.map((_,index)=>({index,embedding:[1,0,0]}))}:{output:[{content:[{type:'output_text',text:'The annual learning budget is $1,200 [1].'}]}]}};
  };
  const start=async()=>{server=await createApp({dataDir:dir,key:ai?'fake':'',fetcher});server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;};
  const close=()=>new Promise(resolve=>server.close(resolve));
  try{
    let base=await start();
    const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await fetch(base+'/')).status,200);
    assert.equal((await post('/api/documents',{name:'empty.txt',text:' '})).status,400);
    let r=await post('/api/documents',{name:'policy.md',text:'The annual learning budget is $1,200. Manager approval is required.'});assert.equal(r.status,201);const doc=await r.json();
    r=await post('/api/ask',{question:'What is the learning budget?'});assert.equal(r.status,200);const answer=await r.json();assert.match(answer.answer,/1,200/);assert.equal(answer.sources[0].name,'policy.md');assert.equal(answer.mode,ai?'ai':'demo');
    if(ai){assert.ok(calls.some(c=>c.url.endsWith('/responses')));assert.equal(calls.find(c=>c.url.endsWith('/responses')).body.store,false);}
    else{const missing=await (await post('/api/ask',{question:'platypus astronomy'})).json();assert.equal(missing.sources.length,0);}
    assert.equal((await fetch(base+'/api/documents',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
    await close();base=await start();assert.equal((await (await fetch(base+'/api/status')).json()).documents.length,1);
    assert.equal((await fetch(base+`/api/documents/${doc.id}`,{method:'DELETE'})).status,200);
    assert.equal((await (await fetch(base+'/api/status')).json()).documents.length,0);
  }finally{if(server?.listening)await close();await rm(dir,{recursive:true,force:true});}
});
