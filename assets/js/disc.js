import { supabase, isConfigured } from './supabase.js?v=20261120-hrga-workspace-02';
import { QUESTIONS } from './disc-engine.js?v=20261120-hrga-workspace-02';
import { $, esc, cacheCandidateNik, getCachedCandidateNik, clearCachedCandidateNik, setBusy } from './common.js?v=20261120-hrga-workspace-02';

const root=$('#disc-app');
let nik='';
let applicant=null;
let answers=[];
let current=0;
const ANSWER_CACHE='portal_disc_answers_v2';

function saveLocal(){
  try{sessionStorage.setItem(ANSWER_CACHE,JSON.stringify({nik,answers}));}catch{}
}
function loadLocal(candidateNik){
  try{
    const item=JSON.parse(sessionStorage.getItem(ANSWER_CACHE)||'null');
    if(item?.nik===candidateNik&&Array.isArray(item.answers)&&item.answers.length===24)return item.answers;
  }catch{}
  return Array.from({length:24},()=>({most:null,least:null}));
}
function clearLocal(){try{sessionStorage.removeItem(ANSWER_CACHE);}catch{}}
function showIdentity(message=''){
  root.innerHTML=`<section class="candidate-card"><div class="stage-kicker">REKRUTMEN · TES DISC</div><h1 class="candidate-title">Identifikasi kandidat</h1><form id="disc-identity-form"><label class="field-label" for="disc-nik">NIK</label><input class="input" id="disc-nik" name="nik" inputmode="numeric" autocomplete="off" maxlength="16" pattern="[0-9]{16}" required placeholder="16 digit NIK" value="${esc(nik)}"><div class="form-error" id="disc-identity-error" role="alert">${esc(message)}</div><button class="btn btn-primary full" id="disc-identity-submit" type="submit">Cocokkan NIK</button></form></section>`;
  const input=$('#disc-nik');
  input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,16);});
  $('#disc-identity-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const value=input.value.replace(/\D/g,'');
    if(!/^\d{16}$/.test(value)){$('#disc-identity-error').textContent='NIK harus terdiri dari 16 angka.';return;}
    await identifyCandidate(value);
  });
}
async function identifyCandidate(value){
  const button=$('#disc-identity-submit');
  if(button)setBusy(button,true,'Memeriksa…');
  try{
    const {data,error}=await supabase.rpc('get_disc_candidate_by_nik',{p_nik:value});
    if(error)throw error;
    if(!data)throw new Error('NIK tidak ditemukan. Pastikan formulir Tahap 2 sudah berhasil dikirim.');
    nik=value;
    cacheCandidateNik(value);
    applicant=data;
    if(data.disc_completed){
      clearLocal();
      root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Tes DISC sudah selesai</h1><p>${esc(data.full_name||'')}</p></section>`;
      return;
    }
    answers=loadLocal(nik);
    current=0;
    renderQuestion();
  }catch(error){
    clearCachedCandidateNik();
    showIdentity(error.message||'NIK tidak dapat dicocokkan.');
  }
}
function selectionButton(qi,oi,kind,value){
  const selected=answers[qi]?.[kind]===oi;
  const other=answers[qi]?.[kind==='most'?'least':'most'];
  const conflict=other===oi&&!selected;
  const cls=selected?(kind==='most'?'selected-most':'selected-least'):'';
  const label=kind==='most'?'Paling menggambarkan':'Paling tidak menggambarkan';
  return `<button type="button" class="disc-pick ${cls}" data-kind="${kind}" data-option="${oi}" aria-label="${label}: ${esc(value)}" aria-pressed="${selected}" title="${label}" ${conflict?'disabled':''}>${kind==='most'?'P':'K'}</button>`;
}
function renderQuestion(){
  const q=QUESTIONS[current];
  const done=answers.filter(a=>Number.isInteger(a.most)&&Number.isInteger(a.least)).length;
  root.innerHTML=`<div class="step-top"><span class="stage-kicker">REKRUTMEN · TES DISC</span><span class="step-number">${esc(applicant?.full_name||'')}</span></div><div class="disc-progress-meta"><span>PERTANYAAN ${String(current+1).padStart(2,'0')} / 24</span><span>${Math.round(done/24*100)}%</span></div><div class="step-progress"><span style="width:${done/24*100}%"></span></div><section class="disc-card"><h1 class="disc-q-title">Pilih satu P dan satu K</h1><div class="disc-q-sub">${esc(applicant?.full_name||'')}</div><div class="disc-column-head"><span><b>P</b> · Paling menggambarkan diri Anda</span><span><b>K</b> · Paling tidak menggambarkan diri Anda</span></div>${q.map((choice,i)=>`<div class="disc-option"><div class="disc-option-text">${esc(choice)}</div>${selectionButton(current,i,'most',choice)}${selectionButton(current,i,'least',choice)}</div>`).join('')}<div id="disc-error" class="candidate-toast" hidden></div><div class="candidate-actions"><button class="btn btn-secondary" id="disc-back" type="button" ${current===0?'disabled':''}>Kembali</button><button class="btn btn-primary" id="disc-next" type="button">${current===23?'Kirim jawaban':'Lanjut'}</button></div></section>`;
  root.querySelectorAll('.disc-pick').forEach(button=>button.addEventListener('click',()=>{
    const kind=button.dataset.kind,option=Number(button.dataset.option),other=kind==='most'?'least':'most';
    if(answers[current][other]===option)return;
    answers[current][kind]=option;saveLocal();renderQuestion();
  }));
  $('#disc-back').addEventListener('click',()=>{if(current>0){current--;renderQuestion();}});
  $('#disc-next').addEventListener('click',submitOrNext);
}
async function submitOrNext(){
  const item=answers[current];
  if(!Number.isInteger(item?.most)||!Number.isInteger(item?.least)||item.most===item.least){
    const error=$('#disc-error');error.hidden=false;error.textContent='Pilih tepat satu P dan satu K untuk melanjutkan.';return;
  }
  if(current<23){current++;renderQuestion();return;}
  const button=$('#disc-next');setBusy(button,true,'Menyimpan…');
  try{
    const {error}=await supabase.rpc('submit_disc_answers_by_nik',{p_nik:nik,p_answers:answers});
    if(error)throw error;
    clearLocal();
    root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Tes DISC selesai</h1><p>${esc(applicant?.full_name||'')}</p></section>`;
  }catch(error){
    const e=$('#disc-error');if(e){e.hidden=false;e.textContent=error.message||'Jawaban belum berhasil disimpan.';}
    setBusy(button,false);
  }
}
async function init(){
  if(!isConfigured){root.innerHTML='<section class="candidate-card"><h1 class="candidate-title">Tes DISC</h1><p class="candidate-sub">Supabase belum dikonfigurasi.</p></section>';return;}
  const cached=getCachedCandidateNik(60);
  if(cached){nik=cached;await identifyCandidate(cached);}
  else showIdentity();
}
init().catch(error=>showIdentity(error.message||'Tes DISC belum dapat dimuat.'));
