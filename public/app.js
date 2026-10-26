const $ = id => document.getElementById(id);
async function api(path, options={}) {
  const r = await fetch(path,{...options,headers:{'Content-Type':'application/json'}});
  const data = await r.json(); if(!r.ok) throw new Error(data.error || 'Request failed.'); return data;
}
const say = text => $('notice').textContent=text;
async function refresh() {
  const s = await api('/api/status');
  $('mode').textContent=s.mode==='ai'?'● AI connected':'● Local demo';
  $('privacy').textContent=s.mode==='ai'?'AI mode sends document text and questions to OpenAI. Verify answers against the sources.':'Local demo · keyword search and source excerpts. Add an API key for semantic search and AI answers.';
  $('count').textContent=s.documents.length;
  $('documents').replaceChildren(...s.documents.map(doc=>{
    const el=document.createElement('div'); el.className='document';
    const title=document.createElement('strong');title.textContent=doc.name;
    const info=document.createElement('small');info.textContent=`${doc.chunks} passages · ${doc.semantic?'embedded':'keyword index'}`;
    const remove=document.createElement('button');remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${doc.name}`);
    remove.onclick=async()=>{remove.disabled=true;try{await api(`/api/documents/${doc.id}`,{method:'DELETE'});$('result').hidden=true;await refresh();say('Document removed.');}catch(e){say(e.message);remove.disabled=false;}};
    el.append(title,info,remove);return el;
  }));
}
async function upload(name,text){return api('/api/documents',{method:'POST',body:JSON.stringify({name,text})});}
$('file').onchange=async e=>{const input=e.target;input.disabled=true;try{for(const file of input.files){if(file.size>300000)throw new Error('File too large. Limit: 100,000 characters.');say(`Indexing ${file.name}…`);await upload(file.name,await file.text());}say('Documents ready. Ask Kit a question.');}catch(e){say(e.message);}finally{input.value='';input.disabled=false;await refresh().catch(e=>say(e.message));}};
$('sample').onclick=async()=>{
  $('sample').disabled=true;say('Adding sample…');
  try{await upload('Kit sample handbook.md','# Sample company handbook\n\nThis is fictional demonstration content.\n\nRemote work\nEmployees may work remotely up to three days each week. Team members coordinate their office days with their manager.\n\nLearning budget\nEach employee has an annual learning budget of $1,200 for courses, books, and conferences. Manager approval is required before purchases.\n\nSupport\nCustomer support is available Monday through Friday, 9 am to 5 pm Sydney time. Urgent incidents should be escalated to the on-call engineer.');await refresh();$('question').value='What is the annual learning budget?';say('Sample added. Click Ask Kit to try it.');}catch(e){say(e.message);}finally{$('sample').disabled=false;}
};
$('ask').onsubmit=async e=>{
  e.preventDefault();const question=$('question').value.trim();if(!question)return;
  $('submit').disabled=true;say('Searching your library…');
  try{const data=await api('/api/ask',{method:'POST',body:JSON.stringify({question})});
    $('result').hidden=false;$('asked').textContent=question;$('warning').textContent=data.citationWarning || '';
    $('answer').replaceChildren();
    for(const part of data.answer.split(/(\[\d+\])/g)){
      const n=Number(part.slice(1,-1));
      if(/^\[\d+\]$/.test(part)&&data.sources.some(s=>s.citation===n)){const a=document.createElement('a');a.href=`#source-${n}`;a.textContent=part;a.onclick=()=>{document.getElementById(`source-${n}`).open=true;};$('answer').append(a);}else $('answer').append(document.createTextNode(part));
    }
    $('sources').replaceChildren(...data.sources.map(s=>{const d=document.createElement('details');d.id=`source-${s.citation}`;const label=document.createElement('summary');label.textContent=`[${s.citation}] ${s.name} · passage ${s.chunk} · characters ${s.start+1}–${s.end}`;const p=document.createElement('p');p.textContent=s.text;d.append(label,p);return d;}));
    say(data.mode==='demo'?'Showing retrieved excerpts. AI generation is not enabled.':'Answer ready. Open a citation to inspect its source.');await refresh();
  }catch(e){say(e.message);}finally{$('submit').disabled=false;}
};
refresh().catch(e=>say(e.message));
