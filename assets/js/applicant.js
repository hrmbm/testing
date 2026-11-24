import { supabase, isConfigured } from './supabase.js?v=20261124-hrga-workspace-19';
import { MAX_CV_BYTES, CV_BUCKET, CV_PATH_PREFIX } from './config.js?v=20261124-hrga-workspace-19';
import { $, esc, ageFrom, cacheCandidateNik, setBusy } from './common.js?v=20261124-hrga-workspace-19';
import {
  DEFAULT_STAGE2_SCHEMA,
  STEP_SECTION_DEFAULTS,
  STAGE2_SECTION_META,
  MANDATORY_STAGE2_SECTIONS,
  normalizeStage2Schema
} from './form-schema.js?v=20261124-hrga-workspace-19';

function formatKtpAddress(data={}){
  const tidyPart=v=>String(v||'').replace(/\s+/g,' ').replace(/^\s*[:：\-]+\s*/,'').replace(/[,;]+$/,'').trim();
  const titlePart=v=>tidyPart(v).toLowerCase().replace(/\b\p{L}/gu,c=>c.toUpperCase());
  const parts=[];
  const street=tidyPart(data.alamat_jalan),type=tidyPart(data.alamat_tipe);
  if(street){
    const legacy=street.match(/^(DSN\.?|DUSUN|JL\.?|JALAN|PERUM(?:AHAN)?\.?|KOMP\.?|KOMPLEK(?:S)?|GG\.?|GANG|BLOK)\s*(.*)$/i);
    const raw=legacy?legacy[2]:street;
    const prefixMap={'Dusun':'Dusun','Kampung':'Kampung','Jalan':'Jl.','Perumahan':'Perumahan','Komplek':'Komplek','Lingkungan':'Lingk.','Gang':'Gg.','Lorong':'Lorong','Blok':'Blok','Apartemen':'Apartemen'};
    const effective=type || (legacy ? (/^(DSN|DUSUN)/i.test(legacy[1])?'Dusun':/^(KAMP)/i.test(legacy[1])?'Kampung':/^(JL|JALAN)/i.test(legacy[1])?'Jalan':/^(PERUM)/i.test(legacy[1])?'Perumahan':/^(KOMP|KOMPLEK)/i.test(legacy[1])?'Komplek':/^(LINGK)/i.test(legacy[1])?'Lingkungan':/^(GG|GANG)/i.test(legacy[1])?'Gang':/^(LOR)/i.test(legacy[1])?'Lorong':/^(APT|APARTEMEN)/i.test(legacy[1])?'Apartemen':'Blok') : '');
    const prefix=prefixMap[effective]||'';
    parts.push(prefix?`${prefix} ${titlePart(raw)}`:titlePart(raw));
  }
  const rt=String(data.alamat_rt||'').replace(/\D/g,'').slice(0,3);
  const rw=String(data.alamat_rw||'').replace(/\D/g,'').slice(0,3);
  if(rt||rw)parts.push(`RT ${rt.padStart(3,'0')||'___'}/RW ${rw.padStart(3,'0')||'___'}`);
  if(data.alamat_desa){
    const areaType=data.alamat_wilayah_type==='Kelurahan'?'Kel.':data.alamat_wilayah_type==='Desa'?'Desa':'Desa/Kel.';
    parts.push(`${areaType} ${titlePart(data.alamat_desa)}`);
  }
  if(data.alamat_kecamatan)parts.push(`Kec. ${titlePart(data.alamat_kecamatan)}`);
  if(data.alamat_kota_nama)parts.push(`${data.alamat_kota_jenis==='Kota'?'Kota':'Kab. '} ${titlePart(data.alamat_kota_nama)}`.replace(/\s+/g,' ').trim());
  if(data.alamat_provinsi)parts.push(titlePart(data.alamat_provinsi));
  const postal=String(data.alamat_kodepos||'').replace(/\D/g,'').slice(0,5);
  if(postal)parts.push(postal);
  return parts.filter(Boolean).join(', ');
}

const root = $('#candidate-app');
const queryAll = (selector, scope=document) => [...scope.querySelectorAll(selector)];
const choices = items => items.map(value => ({value,label:value}));
const educationChoices = choices(['Tidak sekolah','SD / Sederajat','SMP / Sederajat','SMA / SMK','D1','D2','D3','D4','S1','S2','S3']);
const stepTitles = ['Identitas','Keluarga & pendidikan','Kemampuan & pengalaman','Informasi tambahan','Lampiran'];
const DEMO_RECRUITMENT_KEY = 'hrga_demo_recruitment_v1';
const isDemoQuery = (() => {
  try { return new URLSearchParams(location.search).get('demo') === '1'; }
  catch { return false; }
})();

let stage2Schema = normalizeStage2Schema(DEFAULT_STAGE2_SCHEMA);
let availablePositions = stage2Schema.positions.slice();
let availableInfoSources = stage2Schema.infoSources.slice();

const SECTION_META_BY_ID = Object.fromEntries(STAGE2_SECTION_META.map(meta => [meta.id, meta]));

function buildStage2FieldDef(f) {
  if (f.type === 'system_form_position') {
    return {
      name: 'posisi',
      label: f.label,
      placeholder: f.placeholder || 'Pilih posisi',
      type: 'select',
      options: choices(availablePositions),
      required: true,
      wide: f.wide === true
    };
  }
  if (f.type === 'system_form_source') {
    return {
      name: 'sumber_informasi',
      label: f.label,
      placeholder: f.placeholder || 'Pilih sumber informasi',
      type: 'select',
      options: choices(availableInfoSources),
      required: f.required === true,
      wide: f.wide === true
    };
  }
  if (f.type === 'system_region_province') {
    return { name: 'alamat_provinsi', label: f.label, type: 'select', options: [], required: f.required === true, wide: f.wide === true };
  }
  if (f.type === 'system_region_regency') {
    return { name: 'alamat_kota_nama', label: f.label, type: 'select', options: [], required: f.required === true, wide: f.wide === true };
  }
  if (f.type === 'system_region_district') {
    return { name: 'alamat_kecamatan', label: f.label, type: 'select', options: [], required: f.required === true, wide: f.wide === true };
  }
  if (f.type === 'system_region_village') {
    return { name: 'alamat_desa', label: f.label, type: 'select', options: [], required: f.required === true, wide: f.wide === true };
  }
  if (f.type === 'currency') {
    return { ...f, type: 'text', currency: true };
  }
  if (f.type === 'select') {
    return { ...f, options: choices(f.options || []), ...(f.defaultValue ? { value: f.defaultValue } : {}) };
  }
  return { ...f, ...(f.defaultValue ? { value: f.defaultValue } : {}) };
}

const ADDRESS_FIELD_NAMES = [
  'alamat_provinsi', 'alamat_kota_nama', 'alamat_kecamatan', 'alamat_desa',
  'alamat_tipe', 'alamat_jalan', 'alamat_rt', 'alamat_rw', 'alamat_kodepos'
];

const spouseFields = [
  {name:'pasangan_nama',label:'Nama suami / istri'},
  {name:'pasangan_lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},
  {name:'pasangan_umur',label:'Umur',type:'number',min:15,max:120},
  {name:'pasangan_pendidikan',label:'Pendidikan',type:'select',options:educationChoices},
  {name:'pasangan_pekerjaan',label:'Pekerjaan'}
];
const educationRows = [
  {prefix:'sd',title:'SD / Sederajat',fields:[['instansi','Nama sekolah'],['kota','Kota'],['lulus','Tahun lulus','year']]},
  {prefix:'smp',title:'SMP / Sederajat',fields:[['instansi','Nama sekolah'],['kota','Kota'],['lulus','Tahun lulus','year']]},
  {prefix:'sma',title:'SMA / SMK',fields:[['instansi','Nama sekolah'],['kota','Kota'],['jurusan','Jurusan'],['lulus','Tahun lulus','year']]},
  {prefix:'diploma',title:'Diploma (D1–D4)',fields:[['instansi','Nama instansi'],['kota','Kota'],['jurusan','Jurusan'],['lulus','Tahun lulus','year']]},
  {prefix:'universitas',title:'Universitas (S1/S2/S3)',fields:[['instansi','Nama universitas'],['kota','Kota'],['jurusan','Jurusan'],['lulus','Tahun lulus','year']]}
];
const workKeys = [['perusahaan','Nama perusahaan'],['periode_mulai','Dari (bulan/tahun)','month'],['periode_selesai','Sampai (bulan/tahun)','month'],['jabatan','Jabatan'],['usaha','Jenis usaha'],['jumlah','Jumlah karyawan','number'],['atasan','Nama atasan langsung'],['gaji','Gaji terakhir (Rp)','currency'],['alasan','Alasan berhenti']];

const LOCAL_DRAFT_KEY = 'portal_candidate_draft_v4';
let initialData = {};
let cvFilename = '';
let cvPath = '';
let activeStep = 0;
let activeStepDefs = [];
let mediaStream = null;
let ktpPhotoDataUrl = '';
let ocrFieldConfidence = {};
let ocrAttempts = 0;
let ocrBusy = false;
let ocrMappingData = null;
let ocrRunGeneration = 0;
let cropImage = null;
let cropImageUrl = '';
let cropZoom = 1;
let cropOffsetX = 0;
let cropOffsetY = 0;
let cropRotation = 0;
let cropDragging = false;
let cropLastPointer = null;
let activeCaptureMode = 'camera';

const selectOptions = (options, selected) => (options || []).map(o => {
  const item = typeof o === 'string' ? {value:o,label:o} : o;
  return `<option value="${esc(item.value)}" ${String(selected??'')===String(item.value)?'selected':''}>${esc(item.label)}</option>`;
}).join('');
function formatCurrency(value){
  const digits=String(value??'').replace(/\D/g,'');
  return digits ? new Intl.NumberFormat('id-ID').format(Number(digits)) : '';
}

function fieldHtml(field, values={}){
  let value=values[field.name] ?? field.value ?? '';
  if(['gender','pasangan_lp','saudara1_lp','saudara2_lp','saudara3_lp','saudara4_lp','anak1_lp','anak2_lp','anak3_lp'].includes(field.name)){
    value=value==='L'?'Laki-laki':value==='P'?'Perempuan':value;
  }
  const required=field.required?'required':'';
  const wide=field.wide?'wide':'';
  const id=`f-${field.name}`;
  const confidence=Number(ocrFieldConfidence[field.name]);
  const reviewTag=Number.isFinite(confidence)&&confidence<0.84?`<small class="ocr-review-tag" data-level="${confidence<0.62?'low':'medium'}">${confidence<0.62?'Periksa ulang':'Tinjau OCR'}</small>`:'';
  const reqMark=field.required?'<span class="req-mark" aria-hidden="true">*</span>':'';

  if(field.type==='radio'){
    const opts=(field.options||[]).map(opt=>{
      const optVal=typeof opt==='string'?opt:opt.value;
      const optLbl=typeof opt==='string'?opt:opt.label;
      return `<label class="choice-chip"><input type="radio" name="${esc(field.name)}" value="${esc(optVal)}" ${String(value)===String(optVal)?'checked':''}><span>${esc(optLbl)}</span></label>`;
    }).join('');
    return `<div class="form-field ${wide}" data-field-group="radio" data-field-name="${esc(field.name)}" data-required="${field.required?'true':'false'}"><span class="group-label">${esc(field.label)}${reqMark}${reviewTag}</span><div class="choice-grid">${opts}</div></div>`;
  }

  if(field.type==='checkbox'){
    const selectedArr=Array.isArray(value)
      ? value.map(String)
      : (typeof value==='string'&&value.trim()?value.split(',').map(s=>s.trim()).filter(Boolean):[]);
    const opts=(field.options||[]).map(opt=>{
      const optVal=typeof opt==='string'?opt:opt.value;
      const optLbl=typeof opt==='string'?opt:opt.label;
      return `<label class="choice-chip"><input type="checkbox" name="${esc(field.name)}" data-multi-checkbox="true" value="${esc(optVal)}" ${selectedArr.includes(String(optVal))?'checked':''}><span>${esc(optLbl)}</span></label>`;
    }).join('');
    return `<div class="form-field ${wide}" data-field-group="checkbox" data-field-name="${esc(field.name)}" data-required="${field.required?'true':'false'}"><span class="group-label">${esc(field.label)}${reqMark}${reviewTag}</span><div class="choice-grid">${opts}</div></div>`;
  }

  const label=`<label for="${esc(id)}">${esc(field.label)}${reqMark}${reviewTag}</label>`;
  const phAttr=field.placeholder?`placeholder="${esc(field.placeholder)}"`:'';
  let control='';
  if(field.type==='select' || field.type==='year'){
    const options=field.type==='year' ? Array.from({length:57},(_,i)=>String(new Date().getFullYear()-i)) : field.options;
    control=`<select id="${esc(id)}" name="${esc(field.name)}" class="select" ${required}><option value="">${esc(field.placeholder||'Pilih')}</option>${selectOptions(options,value)}</select>`;
  }else if(field.type==='textarea'){
    control=`<textarea id="${esc(id)}" name="${esc(field.name)}" ${phAttr} ${required}>${esc(value)}</textarea>`;
  }else if(field.currency){
    control=`<input id="${esc(id)}" name="${esc(field.name)}" type="text" inputmode="numeric" data-format-number="idr" value="${esc(formatCurrency(value))}" ${phAttr} ${required}>`;
  }else{
    const type=field.type||'text';
    const inputmode=field.inputmode?`inputmode="${field.inputmode}"`:type==='number'?'inputmode="numeric"':'';
    control=`<input id="${esc(id)}" name="${esc(field.name)}" type="${type}" value="${esc(value)}" ${phAttr} ${required} ${field.readonly?'readonly':''} ${inputmode} ${field.maxlength?`maxlength="${field.maxlength}"`:''} ${field.min!==undefined?`min="${field.min}"`:''} ${field.max!==undefined?`max="${field.max}"`:''} ${field.step?`step="${field.step}"`:''} ${field.pattern?`pattern="${field.pattern}"`:''}>`;
  }
  return `<div class="form-field ${wide}">${label}${control}</div>`;
}

function sectionHtml(letter,title,body,sectionId=''){
  const attr=sectionId?` data-section-id="${esc(sectionId)}"`:'';
  return `<section class="form-section"${attr}><h2><span class="section-bullet">${esc(letter)}</span>${esc(title)}</h2>${body}</section>`;
}
function basicGrid(fields,values={}){return `<div class="form-grid">${fields.map(f=>fieldHtml(f,values)).join('')}</div>`;}
function countSelect(name,label,max,value,min=0,wide=false){
  return fieldHtml({name,label,type:'select',wide,options:Array.from({length:max-min+1},(_,i)=>String(i+min))}, {[name]:String(value??min)});
}

const REGION_API='https://www.emsifa.com/api-wilayah-indonesia/v2';
const REGION_CACHE_PREFIX='portal_region_cache_v2:';
const MAX_REGION_CACHE_ENTRIES=60;
const REGION_CACHE_TTL_MS=30*86400000;

function regionName(item){return String(item?.name||'').replace(/^(Kabupaten|Kota)\s+/i,'').trim();}
function normalizeRegionName(value){
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/^(kabupaten|kab\.?|kota)\s+/,'').replace(/[^a-z0-9]/g,'');
}
function editDistance(a,b){
  const row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let diagonal=row[0];row[0]=i;
    for(let j=1;j<=b.length;j++){
      const above=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=above;
    }
  }
  return row[b.length];
}
function findRegionMatch(items,selected){
  const key=normalizeRegionName(selected);if(!key)return null;
  const exact=items.find(item=>normalizeRegionName(regionName(item))===key);
  if(exact)return exact;
  const ranked=items.map(item=>{
    const candidate=normalizeRegionName(regionName(item));
    const score=1-editDistance(key,candidate)/Math.max(key.length,candidate.length,1);
    return {item,score};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0],second=ranked[1];
  return best&&best.score>=0.92&&(!second||best.score-second.score>=0.06)?best.item:null;
}

function listRegionCacheEntries(){
  const entries=[];
  try{
    for(let i=0;i<localStorage.length;i++){
      const fullKey=localStorage.key(i);
      if(!fullKey||!fullKey.startsWith(REGION_CACHE_PREFIX))continue;
      let savedAt=0;
      try{
        const parsed=JSON.parse(localStorage.getItem(fullKey)||'null');
        savedAt=Number(parsed?.saved_at||0);
      }catch{}
      entries.push({fullKey,savedAt});
    }
  }catch{}
  return entries.sort((a,b)=>a.savedAt-b.savedAt);
}

function pruneRegionCache(maxEntries=MAX_REGION_CACHE_ENTRIES){
  try{
    const now=Date.now();
    const entries=listRegionCacheEntries();
    const active=[];
    for(const entry of entries){
      if(!entry.savedAt || now-entry.savedAt>=REGION_CACHE_TTL_MS){
        localStorage.removeItem(entry.fullKey);
      }else{
        active.push(entry);
      }
    }
    while(active.length>maxEntries){
      const oldest=active.shift();
      if(oldest)localStorage.removeItem(oldest.fullKey);
    }
  }catch{}
}

function regionCacheGet(key){
  const fullKey=REGION_CACHE_PREFIX+key;
  try{
    const raw=localStorage.getItem(fullKey);
    if(!raw)return null;
    const value=JSON.parse(raw);
    if(Date.now()-Number(value?.saved_at||0)<REGION_CACHE_TTL_MS && Array.isArray(value?.data)){
      try{
        localStorage.setItem(fullKey,JSON.stringify({saved_at:Date.now(),data:value.data}));
      }catch{}
      return value.data;
    }
    localStorage.removeItem(fullKey);
    return null;
  }catch{
    return null;
  }
}

function regionCacheSet(key,data){
  const fullKey=REGION_CACHE_PREFIX+key;
  const payload=JSON.stringify({saved_at:Date.now(),data});
  try{
    localStorage.setItem(fullKey,payload);
    pruneRegionCache(MAX_REGION_CACHE_ENTRIES);
  }catch{
    try{
      pruneRegionCache(Math.max(5,Math.floor(MAX_REGION_CACHE_ENTRIES/2)));
      localStorage.setItem(fullKey,payload);
    }catch{}
  }
}

async function getRegionList(path){
  const cached=regionCacheGet(path);if(cached)return cached;
  const response=await fetch(`${REGION_API}/${path}`,{headers:{Accept:'application/json'},cache:'force-cache'});
  if(!response.ok)throw new Error('Daftar wilayah belum dapat dimuat. Periksa koneksi lalu coba lagi.');
  const json=await response.json();const data=Array.isArray(json.data)?json.data:[];regionCacheSet(path,data);return data;
}
function setRegionOptions(select,items,selected='',placeholder='Pilih'){
  if(!select)return null;
  const match=findRegionMatch(items,selected);
  select.innerHTML=`<option value="">${placeholder}</option>`+items.map(item=>{
    const value=regionName(item),label=String(item.name||value);
    return `<option value="${esc(value)}" data-region-id="${esc(item.id)}" data-region-name="${esc(label)}" data-postal-code="${esc(item.postal_code||'')}">${esc(label)}</option>`;
  }).join('');
  if(match){select.value=regionName(match);return match;}
  if(selected){
    const option=document.createElement('option');option.value=String(selected);option.textContent=`${selected} (perlu verifikasi)`;
    option.dataset.regionUnverified='true';option.selected=true;select.append(option);
  }
  return null;
}
function selectedRegionId(form,name){return form.querySelector(`[name="${name}"] option:checked`)?.dataset.regionId||'';}
function setRegionHidden(form,field,id){const el=form.elements.namedItem(field);if(el)el.value=id||'';}
async function initAddressDropdowns(form,values={}){
  const province=form.elements.namedItem('alamat_provinsi');if(!province)return;
  const regency=form.elements.namedItem('alamat_kota_nama'),district=form.elements.namedItem('alamat_kecamatan'),village=form.elements.namedItem('alamat_desa');
  const status=form.querySelector('#address-region-status');
  if(status)status.textContent='Mencocokkan wilayah dari hasil KTP…';
  province.disabled=true;
  try{
    const provinces=await getRegionList('provinces.json');
    const p=setRegionOptions(province,provinces,values.alamat_provinsi,'Pilih provinsi');
    province.disabled=false;
    if(!p){
      if(status)status.textContent=values.alamat_provinsi?`Provinsi “${values.alamat_provinsi}” belum cocok dengan daftar resmi. Pilih provinsi yang benar.`:'Provinsi belum terbaca dari KTP. Pilih provinsi untuk melanjutkan.';
      return;
    }
    setRegionHidden(form,'alamat_provinsi_id',p.id);
    if(!regency)return;
    const regencies=await getRegionList(`regencies/${p.id}.json`);
    const r=setRegionOptions(regency,regencies,values.alamat_kota_nama,'Pilih kabupaten / kota');
    if(!r){
      if(status)status.textContent=values.alamat_kota_nama?`Kabupaten/kota “${values.alamat_kota_nama}” belum cocok. Pilih nama resmi dari daftar.`:'Pilih kabupaten/kota.';
      return;
    }
    setRegionHidden(form,'alamat_kota_id',r.id);
    const kind=/^Kota\s/i.test(r.name)?'Kota':'Kabupaten';
    if(form.elements.namedItem('alamat_kota_jenis'))form.elements.namedItem('alamat_kota_jenis').value=kind;
    if(!district)return;
    const districts=await getRegionList(`districts/${r.id}.json`);
    const d=setRegionOptions(district,districts,values.alamat_kecamatan,'Pilih kecamatan');
    if(!d){
      if(status)status.textContent=values.alamat_kecamatan?`Kecamatan “${values.alamat_kecamatan}” belum cocok. Pilih nama resmi dari daftar.`:'Pilih kecamatan.';
      return;
    }
    setRegionHidden(form,'alamat_kecamatan_id',d.id);
    if(!village)return;
    const villages=await getRegionList(`villages/${d.id}.json`);
    const v=setRegionOptions(village,villages,values.alamat_desa,'Pilih desa / kelurahan');
    if(!v){
      if(status)status.textContent=values.alamat_desa?`Desa/kelurahan “${values.alamat_desa}” belum cocok. Pilih nama resmi dari daftar.`:'Pilih desa/kelurahan.';
      return;
    }
    setRegionHidden(form,'alamat_desa_id',v.id);
    const zip=form.elements.namedItem('alamat_kodepos');if(zip)zip.value=v.postal_code||'';
    if(status)status.textContent='Nama wilayah cocok dengan daftar resmi. Kode pos diambil dari data desa/kelurahan.';
  }catch(error){
    province.disabled=false;
    console.warn('Region lookup failed:',error);
    if(status)status.textContent=error.message||'Daftar wilayah tidak dapat dimuat.';
  }
}

async function handleAddressRegionChange(form,name){
  const province=form.elements.namedItem('alamat_provinsi'),regency=form.elements.namedItem('alamat_kota_nama'),district=form.elements.namedItem('alamat_kecamatan'),village=form.elements.namedItem('alamat_desa');
  const zip=form.elements.namedItem('alamat_kodepos');
  const reset=(el,label)=>{if(el)el.innerHTML=`<option value="">${label}</option>`;};
  const status=form.querySelector('#address-region-status');if(status)status.textContent='Memuat daftar wilayah…';
  if(name==='alamat_provinsi'){
    const id=selectedRegionId(form,name);setRegionHidden(form,'alamat_provinsi_id',id);setRegionHidden(form,'alamat_kota_id','');setRegionHidden(form,'alamat_kecamatan_id','');setRegionHidden(form,'alamat_desa_id','');
    reset(regency,'Pilih kabupaten / kota');reset(district,'Pilih kecamatan');reset(village,'Pilih desa / kelurahan');if(zip)zip.value='';
    if(id&&regency){regency.disabled=true;try{setRegionOptions(regency,await getRegionList(`regencies/${id}.json`));}finally{regency.disabled=false;}}
  }else if(name==='alamat_kota_nama'){
    const id=selectedRegionId(form,name),option=regency?.selectedOptions[0];setRegionHidden(form,'alamat_kota_id',id);setRegionHidden(form,'alamat_kecamatan_id','');setRegionHidden(form,'alamat_desa_id','');
    const kind=/^Kota\s/i.test(option?.dataset.regionName||'')?'Kota':'Kabupaten';if(form.elements.namedItem('alamat_kota_jenis'))form.elements.namedItem('alamat_kota_jenis').value=kind;
    reset(district,'Pilih kecamatan');reset(village,'Pilih desa / kelurahan');if(zip)zip.value='';
    if(id&&district){district.disabled=true;try{setRegionOptions(district,await getRegionList(`districts/${id}.json`));}finally{district.disabled=false;}}
  }else if(name==='alamat_kecamatan'){
    const id=selectedRegionId(form,name);setRegionHidden(form,'alamat_kecamatan_id',id);setRegionHidden(form,'alamat_desa_id','');reset(village,'Pilih desa / kelurahan');if(zip)zip.value='';
    if(id&&village){village.disabled=true;try{setRegionOptions(village,await getRegionList(`villages/${id}.json`));}finally{village.disabled=false;}}
  }else if(name==='alamat_desa'){
    const id=selectedRegionId(form,name);setRegionHidden(form,'alamat_desa_id',id);
    const option=village?.selectedOptions[0];if(zip)zip.value=option?.dataset.postalCode||'';
  }
  if(status){
    const selectedId=selectedRegionId(form,name);
    const label={alamat_provinsi:'Provinsi',alamat_kota_nama:'Kabupaten/kota',alamat_kecamatan:'Kecamatan',alamat_desa:'Desa/kelurahan'}[name]||'Wilayah';
    status.textContent=selectedId?`${label} cocok dengan daftar resmi.`:`${label} belum cocok. Pilih nama resmi dari daftar.`;
  }
}

function renderSiblingsRowsHtml(values={}){
  const siblingCount=Math.min(3,Math.max(0,Number(values.saudara_count??0)));
  return Array.from({length:siblingCount},(_,i)=>{
    const n=i+2,p=`saudara${n}_`;
    const fields=[
      {name:p+'nama',label:'Nama'},
      {name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},
      {name:p+'umur',label:'Umur',type:'number',min:0,max:120},
      {name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},
      {name:p+'pekerjaan',label:'Pekerjaan'}
    ];
    return `<div class="repeat-row"><div class="repeat-title">Saudara kandung ${i+1}</div>${basicGrid(fields,values)}</div>`;
  }).join('');
}

function renderChildrenRowsHtml(values={}){
  const childrenCount=Math.min(3,Math.max(0,Number(values.anak_count||0)));
  return Array.from({length:childrenCount},(_,i)=>{
    const n=i+1,p=`anak${n}_`;
    const fs=[{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:100},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
    return `<div class="repeat-row"><div class="repeat-title">Anak ${n}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
}

function renderLanguageRowsHtml(values={}){
  const count=Math.min(4,Math.max(0,Number(values.bahasa_count||0)));
  return Array.from({length:count},(_,i)=>{
    const n=i+1,p=`bahasa${n}`;
    const fs=[{name:p,label:'Bahasa',type:'select',options:choices(['Inggris','Mandarin','Arab','Jepang','Rusia','Jerman','Perancis','Latin','Lainnya'])},{name:p+'_bicara',label:'Berbicara',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_baca',label:'Membaca',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_tulis',label:'Menulis',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_lainnya',label:'Nama bahasa (jika memilih Lainnya)'}];
    return `<div class="repeat-row"><div class="repeat-title">Bahasa ${n}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
}

function renderWorkRowsHtml(values={}){
  const count=Math.min(3,Math.max(0,Number(values.kerja_count||0)));
  return Array.from({length:count},(_,i)=>{
    const n=i+1,p=`kerja${n}_`,fs=workKeys.map(([key,label,type])=>({name:p+key,label,currency:type==='currency',type:type==='number'?'number':type==='month'?'month':undefined,min:type==='number'?0:undefined,wide:['perusahaan','alasan'].includes(key)}));
    return `<div class="repeat-row"><div class="repeat-title">Pengalaman ${n}${n===1?' · terakhir':''}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
}

function renderEducationBlock(fieldConfig, values={}){
  let selected=String(values.pendidikan_terakhir||'');
  if(!selected){
    if(values.universitas_instansi)selected='S1';
    else if(values.diploma_instansi)selected='D1-D4';
    else if(values.sma_instansi)selected='SMA';
    else if(values.smp_instansi)selected='SMP';
    else if(values.sd_instansi)selected='SD';
  }
  const levels=[['SD','SD / Sederajat'],['SMP','SMP / Sederajat'],['SMA','SMA / SMK'],['D1-D4','Diploma 1–4'],['S1','Sarjana (S1)'],['S2','Magister (S2)'],['S3','Doktor (S3)']];
  let rows=[];
  if(['SD','SMP','SMA','D1-D4'].includes(selected)){
    const count=({SD:1,SMP:2,SMA:3,'D1-D4':4})[selected];
    rows=educationRows.slice(0,count);
  }else if(['S1','S2','S3'].includes(selected)){
    rows=[...educationRows.slice(0,3),educationRows[4]];
  }
  const content=rows.map(row=>{
    const fields=row.fields.map(([key,label,type])=>({name:`${row.prefix}_${key}`,label,type:type==='year'?'year':undefined}));
    return `<div class="repeat-row"><div class="repeat-title">${row.title}</div>${basicGrid(fields,values)}</div>`;
  }).join('');
  return `${basicGrid([{name:'pendidikan_terakhir',label:fieldConfig?.label||'Pendidikan Terakhir',type:'select',options:levels.map(([value,label])=>({value,label})),required:fieldConfig?.required===true}],{pendidikan_terakhir:selected})}${content}`;
}

function renderDynamicSection(sectionId, values={}){
  const meta=SECTION_META_BY_ID[sectionId];
  const secConfig=stage2Schema.sections?.[sectionId];
  if(!meta || !secConfig) return '';
  if(!MANDATORY_STAGE2_SECTIONS.has(sectionId) && secConfig.enabled===false) return '';

  const enabledFields=(secConfig.fields||[]).filter(f=>f.enabled!==false);
  if(!enabledFields.length && !MANDATORY_STAGE2_SECTIONS.has(sectionId)) return '';

  const itemsHtml=enabledFields.map(f=>{
    if(f.type==='system_domicile'){
      const different=String(values.domisili_berbeda||'false')==='true' || (!!values.domisili && !!values.alamat_asal && values.domisili!==values.alamat_asal);
      return `<div class="form-field wide"><label class="inline-toggle"><input type="checkbox" name="domisili_berbeda" value="true" ${different?'checked':''}><span>${esc(f.label)}</span></label><div class="conditional-fields" data-conditional="true" data-block="domicile" ${different?'':'hidden'}>${basicGrid([{name:'domisili',label:'Alamat domisili',placeholder:f.placeholder||'',type:'textarea',wide:true}],values)}</div></div>`;
    }
    if(f.type==='system_siblings_repeater'){
      const siblingCount=Math.min(3,Math.max(0,Number(values.saudara_count??0)));
      return `<div class="form-field wide repeat-row-wide"><div class="repeat-row"><div class="repeat-title">Saudara kandung</div>${countSelect('saudara_count',f.label||'Jumlah saudara kandung',3,siblingCount,0,true)}<div id="siblings-rows">${renderSiblingsRowsHtml(values)}</div></div></div>`;
    }
    if(f.type==='system_spouse_group'){
      const spouseHidden=values.status_kawin==='Kawin'?'':'hidden';
      return `<div class="form-field wide repeat-row-wide conditional-fields" data-conditional="true" data-block="spouse" ${spouseHidden}><div class="repeat-title">Suami / istri</div>${basicGrid(spouseFields,values)}</div>`;
    }
    if(f.type==='system_children_repeater'){
      const childrenCount=Math.min(3,Math.max(0,Number(values.anak_count||0)));
      const childrenHidden=!values.status_kawin||values.status_kawin==='Belum kawin'?'hidden':'';
      return `<div class="form-field wide repeat-row-wide conditional-fields" data-conditional="true" data-block="children" ${childrenHidden}><div class="repeat-title">Anak</div>${countSelect('anak_count',f.label||'Jumlah anak',3,childrenCount,0,true)}<div id="children-rows">${renderChildrenRowsHtml(values)}</div></div>`;
    }
    if(f.type==='system_education_repeater'){
      return `<div class="form-field wide repeat-row-wide" id="education-block">${renderEducationBlock(f,values)}</div>`;
    }
    if(f.type==='system_languages_repeater'){
      const count=Math.min(4,Math.max(0,Number(values.bahasa_count||0)));
      return `<div class="form-field wide repeat-row-wide">${countSelect('bahasa_count',f.label||'Jumlah bahasa',4,count,0,true)}<div id="language-rows">${renderLanguageRowsHtml(values)}</div></div>`;
    }
    if(f.type==='system_work_repeater'){
      const count=Math.min(3,Math.max(0,Number(values.kerja_count||0)));
      return `<div class="form-field wide repeat-row-wide">${countSelect('kerja_count',f.label||'Jumlah pengalaman kerja',3,count,0,true)}<div class="conditional-fields" data-conditional="true" data-block="work-rows" ${count?'':'hidden'}><div id="work-rows">${renderWorkRowsHtml(values)}</div></div></div>`;
    }
    return fieldHtml(buildStage2FieldDef(f), values);
  }).join('');

  let addressExtras='';
  if(sectionId==='address'){
    addressExtras=`<input type="hidden" name="alamat_provinsi_id" value="${esc(values.alamat_provinsi_id||'')}"><input type="hidden" name="alamat_kota_id" value="${esc(values.alamat_kota_id||'')}"><input type="hidden" name="alamat_kota_jenis" value="${esc(values.alamat_kota_jenis||'Kabupaten')}"><input type="hidden" name="alamat_kecamatan_id" value="${esc(values.alamat_kecamatan_id||'')}"><input type="hidden" name="alamat_desa_id" value="${esc(values.alamat_desa_id||'')}"><input type="hidden" name="alamat_wilayah_type" value="${esc(values.alamat_wilayah_type||'')}"><input type="hidden" name="alamat_asal" value="${esc(values.alamat_asal||'')}"><div class="address-preview" id="address-preview"></div>`;
  }

  return sectionHtml(meta.code, secConfig.title || meta.defaultTitle, `<div class="form-grid">${itemsHtml}</div>${addressExtras}`, sectionId);
}

function computeActiveStepDefs(adminMode = false){
  const defs=[];
  for(const stepIdx of [0,1,2,3]){
    const order=stage2Schema.stepSectionOrder?.[stepIdx] || STEP_SECTION_DEFAULTS[stepIdx] || [];
    const activeIds=order.filter(secId=>{
      const sec=stage2Schema.sections?.[secId];
      if(MANDATORY_STAGE2_SECTIONS.has(secId)) return true;
      if(!sec || sec.enabled===false) return adminMode;
      return (sec.fields||[]).some(f=>f.enabled!==false);
    });
    if(activeIds.length){
      defs.push({stepIndex:stepIdx, label:stepTitles[stepIdx], secIds:activeIds});
    }
  }
  defs.push({stepIndex:4, label:stepTitles[4], secIds:[]});
  return defs;
}

function renderOcrMappingPanel(data){
  if(!data)return '';
  const gender=data.gender==='L'?'Laki-laki':data.gender==='P'?'Perempuan':data.gender||'';
  const ttl=[data.tempat_lahir,data.tanggal_lahir?new Date(`${data.tanggal_lahir}T00:00:00`).toLocaleDateString('id-ID'):''].filter(Boolean).join(' · ');
  const street=[data.alamat_tipe,data.alamat_jalan].filter(Boolean).join(' ');
  const rtRw=(data.alamat_rt||data.alamat_rw)?`RT ${data.alamat_rt||'—'} / RW ${data.alamat_rw||'—'}`:'';
  const village=[data.alamat_wilayah_type,data.alamat_desa].filter(Boolean).join(' ');
  const city=[data.alamat_kota_jenis,data.alamat_kota_nama].filter(Boolean).join(' ');
  const rows=[
    ['NIK',data.nik],
    ['NAMA',data.nama],
    ['TEMPAT / TGL LAHIR',ttl],
    ['JENIS KELAMIN',gender],
    ['ALAMAT',street],
    ['RT / RW',rtRw],
    ['DESA / KELURAHAN',village],
    ['KECAMATAN',data.alamat_kecamatan],
    ['KABUPATEN / KOTA',city],
    ['PROVINSI',data.alamat_provinsi],
    ['AGAMA',data.agama],
    ['STATUS PERKAWINAN',data.status_kawin],
    ['KEWARGANEGARAAN',data.warga_negara],
    ['GOLONGAN DARAH',data.gol_darah],
    ['KODE POS','Diisi dari data wilayah']
  ];
  const rowsHtml=rows.map(([label,value])=>`<tr><td>${esc(label)}</td><td>${String(value||'').trim()?esc(value):'<span class="ocr-map-missing">Belum terbaca</span>'}</td></tr>`).join('');
  return `<details class="ocr-map-details" open><summary>Hasil pembacaan KTP</summary><div class="ocr-map-table-wrap"><table class="ocr-map-table"><thead><tr><th>Data KTP</th><th>Hasil</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></details>`;
}

function renderForm(values={}, options={}){
  initialData=values;
  activeStepDefs=computeActiveStepDefs(options.adminMode === true);
  const savedStep=Number(values.__form_step||0);
  activeStep=activeStepDefs.some(d=>d.stepIndex===savedStep) ? savedStep : activeStepDefs[0].stepIndex;

  const contentStepsHtml=activeStepDefs
    .filter(d=>d.stepIndex!==4)
    .map(d=>`<div class="form-step" data-form-step="${d.stepIndex}">${d.secIds.map(secId=>renderDynamicSection(secId,values)).join('')}</div>`)
    .join('');

  const consentText=stage2Schema.consentText || DEFAULT_STAGE2_SCHEMA.consentText;
  const consentChecked = String(values.setuju)==='true' || values.setuju===true;
  const consentHtml = `<label class="consent-wrap"><input type="checkbox" id="setuju" name="setuju" value="true" ${consentChecked?'checked':''} required><span>${esc(consentText)}</span></label>`;

  const adminAttachments=options.adminMode
    ? `<div class="admin-attachment-grid">
        ${values.ktp_path?`<button type="button" class="admin-attachment-action" data-admin-document="ktp"><span class="admin-attachment-icon">▧</span><span><b>Foto KTP</b><small>Buka dokumen di tab baru</small></span><strong>↗</strong></button>`:'<div class="admin-attachment-missing">Foto KTP tidak tersedia.</div>'}
        ${values.cv_path?`<button type="button" class="admin-attachment-action" data-admin-document="cv"><span class="admin-attachment-icon">▤</span><span><b>Curriculum Vitae</b><small>Buka dokumen di tab baru</small></span><strong>↗</strong></button>`:'<div class="admin-attachment-missing">CV tidak tersedia.</div>'}
      </div>`
    : '';

  const step4=options.adminMode
    ? `<div class="form-step" data-form-step="4">${sectionHtml('J','PERNYATAAN',consentHtml)}<section class="form-section admin-attachment-note"><h2><span class="section-bullet">↗</span>LAMPIRAN</h2>${adminAttachments}</section></div>`
    : `<div class="form-step" data-form-step="4">${sectionHtml('J','PERNYATAAN',consentHtml)}<section class="form-section"><h2><span class="section-bullet">KTP</span>FOTO KTP</h2><p class="field-hint">Unggah foto KTP yang jelas. Pada mode manual, foto hanya dikompres di perangkat dan tidak diproses dengan OCR.</p><label class="upload-zone"><span class="upload-icon">↥</span><b id="ktp-upload-label">Unggah foto KTP</b><small>JPG, PNG, atau WebP · Maks. 8 MB</small><input type="file" id="ktp-photo-file" accept="image/jpeg,image/png,image/webp" capture="environment"></label><div class="cv-upload-state" id="ktp-upload-state" aria-live="polite"></div><img id="ktp-photo-preview" alt="Pratinjau foto KTP" hidden style="display:none;max-width:100%;width:240px;max-height:150px;object-fit:contain;border:1px solid #dce2ea;border-radius:10px;margin-top:12px"></section><section class="form-section"><h2><span class="section-bullet">CV</span>CURRICULUM VITAE</h2><label class="upload-zone cv-upload-zone"><span class="upload-icon">↥</span><b id="cv-filename">${esc(cvFilename||'Unggah CV (PDF)')}</b><small>PDF · Maks. 10 MB</small><input type="file" id="cv-file" accept="application/pdf,.pdf"></label><div class="cv-upload-state" id="cv-upload-state"></div></section></div>`;

  const reviewCount=options.adminMode?0:Object.values(ocrFieldConfidence).filter(score=>score<0.84).length;
  const reviewNotice=reviewCount?`<div class="ocr-review-summary" role="status">${reviewCount} bagian hasil OCR memiliki tingkat keyakinan teks rendah. Periksa penanda di samping kolom sebelum mengirim lamaran.</div>`:'';

  if(options.adminMode){
    return `<div class="admin-candidate-wizard"><div class="step-top"><span class="stage-kicker">DATA KANDIDAT</span><span class="step-number" id="admin-wizard-count">01 / ${String(activeStepDefs.length).padStart(2,'0')}</span></div><div class="wizard-progress"><span id="admin-wizard-progress"></span></div><section class="candidate-card form-wizard-card"><div class="wizard-heading"><div><h1 class="candidate-title">Formulir kandidat</h1><div class="wizard-step-label" id="admin-wizard-step-label">${stepTitles[0]}</div></div><span class="admin-editor-state">MODE KOREKSI</span></div><form id="admin-candidate-form" novalidate>${contentStepsHtml}${step4}<div class="wizard-actions admin-wizard-actions"><button type="button" class="btn btn-secondary" id="admin-wizard-prev" disabled>Kembali</button><button type="button" class="btn btn-primary" id="admin-wizard-next">Lanjut</button></div></form></section></div>`;
  }
  return `<div class="step-top"><span class="stage-kicker">FORMULIR LAMARAN KERJA</span><span class="step-number" id="wizard-count"></span></div><div class="wizard-progress"><span id="wizard-progress-bar"></span></div><section class="candidate-card form-wizard-card">${renderOcrMappingPanel(ocrMappingData)}${reviewNotice}<div class="wizard-heading"><div><h1 class="candidate-title">Data pelamar</h1><div class="wizard-step-label" id="wizard-step-label"></div></div><span class="wizard-save-state" id="draft-save-state" aria-live="polite">●</span></div><form id="application-form" novalidate>${contentStepsHtml}${step4}<div id="form-error" class="form-error" role="alert"></div><div class="wizard-actions"><button type="button" class="btn btn-secondary" id="wizard-prev">Kembali</button><button type="button" class="btn btn-primary" id="wizard-next">Lanjut</button></div></form></section>`;
}

/**
 * Build the Stage 2 admin editor using the exact mobile section/field renderer.
 * Zero external emsifa.com requests are issued on modal open.
 */
export function renderAdminEditorMarkup(values={}, positions=[]){
  stage2Schema = normalizeStage2Schema(DEFAULT_STAGE2_SCHEMA);
  const source={...(values||{})};
  const normalizedPositions=[...new Set([...(Array.isArray(positions)?positions:[]),...stage2Schema.positions,source.posisi].map(v=>String(v||'').trim()).filter(Boolean))];
  availablePositions=normalizedPositions.length?normalizedPositions:stage2Schema.positions.slice();
  availableInfoSources=stage2Schema.infoSources.slice();

  const inferCount=(key,pattern,max)=>{
    if(source[key]!==undefined&&source[key]!==null&&source[key]!=='')return;
    const numbers=Object.keys(source).map(name=>name.match(pattern)).filter(Boolean).map(match=>Number(match[1]));
    source[key]=String(Math.min(max,numbers.length?Math.max(...numbers):0));
  };
  inferCount('saudara_count',/^saudara([2-4])_nama$/,3);
  inferCount('anak_count',/^anak([1-3])_nama$/,3);
  inferCount('bahasa_count',/^bahasa([1-4])_bicara$/,4);
  inferCount('kerja_count',/^kerja([1-3])_perusahaan$/,3);
  if(!source.pendidikan_terakhir){
    if(source.universitas_instansi)source.pendidikan_terakhir='S1';
    else if(source.diploma_instansi)source.pendidikan_terakhir='D1-D4';
    else if(source.sma_instansi)source.pendidikan_terakhir='SMA';
    else if(source.smp_instansi)source.pendidikan_terakhir='SMP';
    else if(source.sd_instansi)source.pendidikan_terakhir='SD';
  }
  source.nama=source.nama??source.full_name??'';
  source.nik=source.nik??'';
  source.posisi=source.posisi??source.position??'';
  initialData=source;cvFilename='';cvPath='';ktpPhotoDataUrl='';ocrMappingData=null;ocrFieldConfidence={};
  return renderForm(source,{adminMode:true});
}

/** Initialize the exact five-step mobile form inside the admin correction modal. */
export async function bindAdminEditorForm(form, values={}){
  if(!form)throw new Error('Form koreksi kandidat tidak ditemukan.');
  const host=form.closest('.admin-candidate-wizard')||form.parentElement;
  const defs=computeActiveStepDefs(true);
  let pos=0;
  const showStep=(nextPos,scroll=true)=>{
    pos=Math.max(0,Math.min(defs.length-1,nextPos));
    const stepIdx=defs[pos].stepIndex;
    form.querySelectorAll('.form-step').forEach(el=>{el.hidden=Number(el.dataset.formStep)!==stepIdx;});
    const count=host.querySelector('#admin-wizard-count');if(count)count.textContent=`${String(pos+1).padStart(2,'0')} / ${String(defs.length).padStart(2,'0')}`;
    const title=host.querySelector('#admin-wizard-step-label');if(title)title.textContent=defs[pos].label;
    const progress=host.querySelector('#admin-wizard-progress');if(progress)progress.style.width=`${(pos+1)/defs.length*100}%`;
    const prev=host.querySelector('#admin-wizard-prev');if(prev)prev.disabled=pos===0;
    const nextButton=host.querySelector('#admin-wizard-next');if(nextButton){nextButton.textContent='Lanjut';nextButton.hidden=pos===defs.length-1;}
    if(scroll)host.scrollIntoView?.({behavior:'smooth',block:'start'});
  };
  host.querySelector('#admin-wizard-prev')?.addEventListener('click',()=>showStep(pos-1));
  host.querySelector('#admin-wizard-next')?.addEventListener('click',()=>showStep(pos+1));

  const numericFields=['nik','alamat_rt','alamat_rw','alamat_kodepos'];
  let addressPreviewTimer=null;
  const scheduleAddressPreview=()=>{
    clearTimeout(addressPreviewTimer);
    addressPreviewTimer=setTimeout(()=>{updateAddressPreview(form);},120);
  };
  form.addEventListener('input',event=>{
    const el=event.target;if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement))return;
    if(numericFields.includes(el.name))normalizeDigitInput(el,el.name==='nik'?16:el.name==='alamat_kodepos'?5:3);
    if(el.name==='telepon')normalizeDigitInput(el,16);
    if(el.dataset.formatNumber==='idr')formatCurrencyInput(el);
    if(['nama','tanggal_lahir','gender'].includes(el.name))syncApplicantRow(form);
    if(ADDRESS_FIELD_NAMES.includes(el.name))scheduleAddressPreview();
  });
  form.addEventListener('change',async event=>{
    const key=event.target?.name;
    if(['alamat_provinsi','alamat_kota_nama','alamat_kecamatan','alamat_desa'].includes(key)){
      try{await handleAddressRegionChange(form,key);}catch(error){console.warn('Admin address update failed:',error);}
    }
    if(['saudara_count','anak_count','bahasa_count','kerja_count'].includes(key))rerenderGroups(form);
    if(key==='pendidikan_terakhir'){
      const old=collect(form);
      const eduBlock=$('#education-block',form);
      const eduField=stage2Schema.sections?.education?.fields?.find(f=>f.type==='system_education_repeater');
      if(eduBlock)eduBlock.innerHTML=renderEducationBlock(eduField,old);
    }else if(key==='status_kawin'||key==='domisili_berbeda')updateDynamic(form,collect(form));
    syncApplicantRow(form);
    clearTimeout(addressPreviewTimer);
    updateAddressPreview(form);
  });
  showStep(0,false);
  rerenderGroups(form);

  // Populate saved KTP region values synchronously without querying emsifa.com
  const savedRegions=[
    ['alamat_provinsi',values.alamat_provinsi,'Pilih provinsi',values.alamat_provinsi_id],
    ['alamat_kota_nama',values.alamat_kota_nama,'Pilih kabupaten / kota',values.alamat_kota_id],
    ['alamat_kecamatan',values.alamat_kecamatan,'Pilih kecamatan',values.alamat_kecamatan_id],
    ['alamat_desa',values.alamat_desa,'Pilih desa / kelurahan',values.alamat_desa_id]
  ];
  for(const [fieldName,savedVal,placeholder,savedId] of savedRegions){
    const select=form.elements.namedItem(fieldName);
    if(!select)continue;
    select.innerHTML=`<option value="">${placeholder}</option>`;
    if(savedVal){
      const opt=document.createElement('option');
      opt.value=String(savedVal);
      opt.textContent=String(savedVal);
      if(savedId)opt.dataset.regionId=String(savedId);
      opt.selected=true;
      select.append(opt);
    }
  }
  updateAddressPreview(form);
  return {goToStep:showStep};
}

export function collectAdminEditorData(form, original={}){
  const edited=collect(form);
  const merged={...(original||{}),...edited};
  merged.nama=String(edited.nama||'').trim();
  merged.nik=String(edited.nik||'').replace(/\D/g,'');
  merged.posisi=String(edited.posisi||'').trim();
  const repeatGroups=[
    {prefix:'saudara',count:Number(edited.saudara_count||0),offset:1},
    {prefix:'anak',count:Number(edited.anak_count||0),offset:0},
    {prefix:'bahasa',count:Number(edited.bahasa_count||0),offset:0},
    {prefix:'kerja',count:Number(edited.kerja_count||0),offset:0}
  ];
  for(const group of repeatGroups){
    const keepThrough=Math.max(0,group.count)+group.offset;
    const pattern=new RegExp(`^${group.prefix}(\\d+)(?:_|$)`);
    Object.keys(merged).forEach(key=>{
      const match=key.match(pattern);
      if(match&&Number(match[1])>keepThrough)delete merged[key];
    });
  }
  merged.saudara1_nama=merged.nama||'';
  merged.saudara1_lp=merged.gender||'';
  merged.saudara1_umur=merged.umur??'';
  merged.nama_terang=merged.nama||'';
  return merged;
}

function buildAddress(data){
  const address=formatKtpAddress(data);
  data.alamat_asal=address;
  data.domisili=String(data.domisili_berbeda)==='true' && String(data.domisili||'').trim() ? String(data.domisili).trim() : address;
  return data;
}
function collect(form){
  const data={};
  const radioSeen=new Set();
  const multiSeen=new Set();
  for(const el of [...form.elements]){
    const key=el.name;
    if(!key||el.disabled||el.type==='file') continue;
    if(el.type==='radio'){
      if(!radioSeen.has(key)){radioSeen.add(key);if(!(key in data))data[key]='';}
      if(el.checked)data[key]=el.value;
      continue;
    }
    if(el.type==='checkbox'){
      if(el.dataset.multiCheckbox==='true'){
        if(!multiSeen.has(key)){multiSeen.add(key);data[key]=[];}
        if(el.checked)data[key].push(el.value);
      }else{
        data[key]=el.checked?'true':'false';
      }
      continue;
    }
    data[key]=el.value;
  }
  const genderMap={'Laki-laki':'L','Perempuan':'P'};
  if(genderMap[data.gender]) data.gender=genderMap[data.gender];
  if(genderMap[data.saudara1_lp]) data.saudara1_lp=genderMap[data.saudara1_lp];
  if(genderMap[data.pasangan_lp]) data.pasangan_lp=genderMap[data.pasangan_lp];
  for(let i=2;i<=4;i++){const key=`saudara${i}_lp`;if(genderMap[data[key]])data[key]=genderMap[data[key]];}
  for(let i=1;i<=3;i++){const key=`anak${i}_lp`;if(genderMap[data[key]])data[key]=genderMap[data[key]];}
  data.umur=ageFrom(data.tanggal_lahir);
  data.nama_terang=data.nama||'';
  data.saudara1_nama=data.nama||'';
  data.saudara1_lp=data.gender||'';
  data.saudara1_umur=data.umur;
  data.saudara1_pendidikan=data.pendidikan_terakhir||data.saudara1_pendidikan||'';
  data.saudara1_pekerjaan=data.kerja1_jabatan||data.kerja1_usaha||data.saudara1_pekerjaan||'';
  return buildAddress(data);
}
function syncApplicantRow(form){
  const read=(name)=>{const el=form.elements?.namedItem(name);return el?String(el.value||''):'';};
  const set=(name,value)=>{const el=form.elements?.namedItem(name)||form.querySelector(`[name="${name}"]`);if(el&&'value'in el)el.value=value||'';};
  const nama=read('nama');
  const rawGender=read('gender');
  const normGender=rawGender==='Laki-laki'?'L':rawGender==='Perempuan'?'P':rawGender;
  const umur=ageFrom(read('tanggal_lahir'));
  set('saudara1_nama',nama);
  set('saudara1_lp',normGender==='L'?'Laki-laki':normGender==='P'?'Perempuan':'');
  set('saudara1_umur',umur);
  set('umur',umur);
  set('nama_terang',nama);
}
function updateDynamic(form,values){
  const marital=form.querySelector('[name="status_kawin"]')?.value||values.status_kawin||'';
  const spouse=form.querySelector('[data-block="spouse"]');if(spouse)spouse.hidden=marital!=='Kawin';
  const children=form.querySelector('[data-block="children"]');if(children)children.hidden=!marital||marital==='Belum kawin';
  const workCount=Number(form.querySelector('#f-kerja_count')?.value??values.kerja_count??0);
  const work=form.querySelector('[data-block="work-rows"]');if(work)work.hidden=workCount===0;

  const domicile=form.querySelector('[data-block="domicile"]');
  const domicileToggle=form.querySelector('[name="domisili_berbeda"]');
  if(domicile)domicile.hidden=!domicileToggle?.checked;
}
function rerenderGroups(form){
  const values=collect(form);
  const siblingHost=$('#siblings-rows',form);
  if(siblingHost) siblingHost.innerHTML=renderSiblingsRowsHtml(values);

  const childrenHost=$('#children-rows',form);
  if(childrenHost) childrenHost.innerHTML=renderChildrenRowsHtml(values);

  const languageHost=$('#language-rows',form);
  if(languageHost) languageHost.innerHTML=renderLanguageRowsHtml(values);

  const workHost=$('#work-rows',form);
  if(workHost) workHost.innerHTML=renderWorkRowsHtml(values);

  updateDynamic(form,values);
  syncApplicantRow(form);
  updateAddressPreview(form);
}

function updateAddressPreview(form){
  const preview=$('#address-preview',form);if(!preview)return;
  const data={};for(const key of ADDRESS_FIELD_NAMES){const el=form.elements.namedItem(key);data[key]=el?.value||'';}
  const address=formatKtpAddress(data);
  const hidden=form.elements.namedItem('alamat_asal');if(hidden)hidden.value=address;
  preview.textContent=address;
  preview.classList.toggle('empty',!address);
}
function setWizardStep(stepIndex,{push=false,replace=false}={}){
  const target=activeStepDefs.find(d=>d.stepIndex===stepIndex) || activeStepDefs[0];
  activeStep=target.stepIndex;
  const pos=activeStepDefs.indexOf(target);
  const total=activeStepDefs.length;

  queryAll('.form-step',root).forEach(el=>el.hidden=Number(el.dataset.formStep)!==activeStep);
  $('#wizard-count',root).textContent=`${String(pos+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
  $('#wizard-step-label',root).textContent=target.label;
  $('#wizard-progress-bar',root).style.width=`${(pos+1)/total*100}%`;
  $('#wizard-prev',root).disabled=pos===0;
  $('#wizard-next',root).textContent=pos===total-1?'Kirim lamaran':'Lanjut';

  if(push){try{history.pushState({portalForm:true,step:activeStep},'',location.href);}catch{}}
  else if(replace){try{history.replaceState({portalForm:true,step:activeStep},'',location.href);}catch{}}
  const form=$('#application-form');if(form)queueDraftSave(form);
  window.scrollTo({top:0,behavior:'smooth'});
}
function saveState(message,failed=false){
  const el=$('#draft-save-state');if(!el)return;
  el.textContent=message;el.classList.toggle('failed',failed);
}
function readLocalDraft(){
  try{const raw=localStorage.getItem(LOCAL_DRAFT_KEY);return raw?JSON.parse(raw):null;}catch{return null;}
}
function writeLocalDraft(form){
  if(!form)return;
  const data={...collect(form),ktp_foto:ktpPhotoDataUrl||'',__form_step:activeStep,__saved_at:Date.now(),__cv_filename:cvFilename||'',__cv_path:cvPath||''};
  try{localStorage.setItem(LOCAL_DRAFT_KEY,JSON.stringify(data));}catch(error){console.warn('Draf lokal tidak dapat disimpan:',error);}
}
function writeLocalInitialDraft(data={}){
  const payload={...data,__form_step:Number(data.__form_step||0),__saved_at:Date.now(),__cv_filename:cvFilename||data.__cv_filename||'',__cv_path:cvPath||data.__cv_path||''};
  try{localStorage.setItem(LOCAL_DRAFT_KEY,JSON.stringify(payload));}catch{}
}
function queueDraftSave(form){
  writeLocalDraft(form);
  saveState('Tersimpan di perangkat');
}
function normalizeDigitInput(el,max){
  const digits=el.value.replace(/\D/g,'').slice(0,max);
  el.value=digits;
}
function padRtRw(el){
  const digits=String(el.value||'').replace(/\D/g,'').slice(0,3);
  el.value=digits?digits.padStart(3,'0'):'';
}
function dataUrlToBlob(dataUrl){
  const match=String(dataUrl||'').match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if(!match)throw new Error('Foto KTP tidak tersedia dalam format yang valid.');
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:match[1]});
}
function updateKtpUploadUI(form){
  const status=$('#ktp-upload-state',form),preview=$('#ktp-photo-preview',form),label=$('#ktp-upload-label',form);
  if(status)status.textContent=ktpPhotoDataUrl?'Foto KTP siap dikirim.':'Foto KTP wajib diunggah sebelum lamaran dikirim.';
  if(label)label.textContent=ktpPhotoDataUrl?'Ganti foto KTP':'Unggah foto KTP';
  if(preview){
    preview.hidden=!ktpPhotoDataUrl;
    preview.style.display=ktpPhotoDataUrl?'block':'none';
    if(ktpPhotoDataUrl)preview.src=ktpPhotoDataUrl;
    else preview.removeAttribute('src');
  }
}
async function uploadManualKtp(file,form){
  if(!file)return;
  const status=$('#ktp-upload-state',form);
  const accepted=/^image\/(jpeg|png|webp)$/i.test(file.type)||/\.(jpe?g|png|webp)$/i.test(file.name||'');
  if(!accepted){if(status)status.textContent='Format foto tidak didukung. Gunakan JPG, PNG, atau WebP.';return;}
  if(file.size>8*1024*1024){if(status)status.textContent='Ukuran foto KTP maksimal 8 MB.';return;}
  if(status)status.textContent='Menyiapkan foto KTP di perangkat…';
  let objectUrl='';
  try{
    objectUrl=URL.createObjectURL(file);
    const image=await new Promise((resolve,reject)=>{
      const element=new Image();element.onload=()=>resolve(element);element.onerror=()=>reject(new Error('Foto KTP tidak dapat dibuka.'));element.src=objectUrl;
    });
    const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    ktpPhotoDataUrl=canvasToKtpDataUrl(canvas);
    initialData={...initialData,ktp_foto:ktpPhotoDataUrl};
    updateKtpUploadUI(form);
    queueDraftSave(form);
    if(status)status.textContent='Foto KTP siap. Gambar dikompres di perangkat; OCR tidak dijalankan.';
  }catch(error){
    if(status)status.textContent=error.message||'Foto KTP gagal diproses.';
  }finally{
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    const input=$('#ktp-photo-file',form);if(input)input.value='';
  }
}
async function uploadKtpForSubmission(){
  if(!ktpPhotoDataUrl)throw new Error('Foto KTP belum tersedia. Silakan ambil atau pilih foto KTP kembali.');
  const path=`candidate-identity/${crypto.randomUUID()}/ktp.jpg`;
  const blob=dataUrlToBlob(ktpPhotoDataUrl);
  const {error}=await supabase.storage.from('candidate-identity').upload(path,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
  if(error)throw error;
  return path;
}
function sanitizeFinalData(data){
  const result={...data};
  if(result.ktp_foto && result.ktp_foto.length>145000) delete result.ktp_foto;
  if(result.status_kawin!=='Kawin') for(const key of Object.keys(result)) if(key.startsWith('pasangan_')) delete result[key];
  if(!result.status_kawin||result.status_kawin==='Belum kawin') for(const key of Object.keys(result)) if(key.startsWith('anak')) delete result[key];
  if(String(result.domisili_berbeda)!=='true') result.domisili=result.alamat_asal||'';
  delete result.domisili_berbeda;
  delete result.kerja1_durasi; delete result.kerja2_durasi; delete result.kerja3_durasi;
  delete result.__saved_at; delete result.__cv_filename;
  return result;
}
function formatCurrencyInput(el){
  const before=el.value,position=el.selectionStart??before.length,digitsBefore=before.slice(0,position).replace(/\D/g,'').length;
  const digits=before.replace(/\D/g,'');el.value=digits?new Intl.NumberFormat('id-ID').format(Number(digits)):'';
  let pos=0,seen=0;while(pos<el.value.length&&seen<digitsBefore){if(/\d/.test(el.value[pos]))seen++;pos++;}
  try{el.setSelectionRange(pos,pos);}catch{}
}
function fieldValidationMessage(el){
  const value=el.type==='checkbox'?el.checked:String(el.value??'').trim();
  if(el.name==='nik'&&!/^\d{16}$/.test(String(el.value||'')))return 'NIK harus tepat 16 digit angka.';
  if(el.required&&!value)return el.type==='checkbox'?'Pernyataan ini wajib disetujui.':el.tagName==='SELECT'?'Pilih salah satu opsi.':'Kolom ini wajib diisi.';
  if(value&&!el.checkValidity()){
    if(el.type==='email')return 'Format email belum benar.';
    if(el.validity.patternMismatch)return 'Format belum sesuai.';
    if(el.validity.rangeUnderflow||el.validity.rangeOverflow)return 'Nilai berada di luar batas yang diperbolehkan.';
    if(el.validity.stepMismatch)return 'Periksa kembali nilai yang dimasukkan.';
    return 'Periksa kembali isian ini.';
  }
  return '';
}
function setFieldValidationError(el,message=''){
  const wrapper=el.closest('.form-field')||el.closest('.consent-wrap');
  if(!wrapper)return;
  wrapper.classList.toggle('is-invalid',!!message);
  const old=wrapper.querySelector('.field-validation-error');
  if(message){
    const hint=old||document.createElement('small');
    hint.className='field-validation-error';
    hint.id=`field-error-${String(el.name||el.id||'field').replace(/[^a-z0-9_-]/gi,'-')}`;
    hint.textContent=message;
    if(!old)wrapper.append(hint);
    if(el!==wrapper){
      el.setAttribute('aria-invalid','true');
      el.setAttribute('aria-describedby',hint.id);
    }
  }else{
    old?.remove();
    if(el!==wrapper){
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    }
  }
}
function validateFieldGroup(groupEl){
  if(!groupEl)return true;
  const required=groupEl.dataset.required==='true';
  const kind=groupEl.dataset.fieldGroup;
  const hasChecked=Boolean(groupEl.querySelector('input:checked'));
  const message=(required && !hasChecked)
    ? (kind==='checkbox' ? 'Pilih minimal satu opsi.' : 'Pilih salah satu opsi.')
    : '';
  groupEl.classList.toggle('is-invalid',!!message);
  const old=groupEl.querySelector('.field-validation-error');
  if(message){
    const hint=old||document.createElement('small');
    hint.className='field-validation-error';
    hint.textContent=message;
    if(!old)groupEl.append(hint);
  }else{
    old?.remove();
  }
  return !message;
}
function focusInvalidField(el){
  const wrapper=el.closest('.form-field')||el.closest('.consent-wrap')||el;
  requestAnimationFrame(()=>{
    wrapper?.scrollIntoView({behavior:'smooth',block:'center'});
    const targetInput=wrapper.querySelector?.('input,select,textarea')||el;
    targetInput.focus?.({preventScroll:true});
  });
}
function validateField(el){
  if(el.type==='radio' || el.dataset.multiCheckbox==='true'){
    return validateFieldGroup(el.closest('[data-field-group]'));
  }
  const message=fieldValidationMessage(el);
  setFieldValidationError(el,message);
  return !message;
}
function validateCurrentStep(form){
  const step=$(`[data-form-step="${activeStep}"]`,form);
  if(!step)return true;
  let firstInvalid=null;
  let invalidAddress=false;

  for(const group of queryAll('[data-field-group]',step)){
    if(group.closest('[data-conditional="true"][hidden]'))continue;
    if(!validateFieldGroup(group)&&!firstInvalid)firstInvalid=group;
  }

  for(const el of queryAll('input,select,textarea',step)){
    if(el.disabled||['file','hidden','radio'].includes(el.type)||el.dataset.multiCheckbox==='true'||el.closest('[data-conditional="true"][hidden]'))continue;
    if(!validateField(el)&&!firstInvalid)firstInvalid=el;
  }
  if(activeStep===0){
    const regionChecks=[['alamat_provinsi','alamat_provinsi_id','Provinsi'],['alamat_kota_nama','alamat_kota_id','Kabupaten/kota'],['alamat_kecamatan','alamat_kecamatan_id','Kecamatan'],['alamat_desa','alamat_desa_id','Desa/kelurahan']];
    for(const [name,idName,label] of regionChecks){
      const field=form.elements.namedItem(name),id=form.elements.namedItem(idName)?.value||selectedRegionId(form,name);
      if(field?.value&&!id){
        const message=`${label} belum cocok dengan daftar wilayah. Pilih dari daftar resmi.`;
        const status=$('#address-region-status',form);
        if(status)status.textContent=message;
        setFieldValidationError(field,message);
        firstInvalid ||= field;
        invalidAddress=true;
      }
    }
  }
  if(firstInvalid){
    $('#form-error',form).textContent=invalidAddress?'Periksa kembali alamat sesuai KTP.':'Periksa kembali kolom yang ditandai sebelum melanjutkan.';
    focusInvalidField(firstInvalid);
    return false;
  }
  $('#form-error',form).textContent='';
  return true;
}
function validateWholeForm(form){
  for(const group of queryAll('[data-field-group]',form)){
    if(group.closest('[data-conditional="true"][hidden]'))continue;
    if(!validateFieldGroup(group)){
      const step=group.closest('[data-form-step]');
      if(step)setWizardStep(Number(step.dataset.formStep));
      $('#form-error',form).textContent='Periksa kembali kolom yang ditandai sebelum mengirim lamaran.';
      focusInvalidField(group);
      return false;
    }
  }
  for(const el of queryAll('input,select,textarea',form)){
    if(el.disabled||['file','hidden','radio'].includes(el.type)||el.dataset.multiCheckbox==='true'||el.closest('[data-conditional="true"][hidden]'))continue;
    if(!validateField(el)){
      const step=el.closest('[data-form-step]');
      if(step)setWizardStep(Number(step.dataset.formStep));
      $('#form-error',form).textContent='Periksa kembali kolom yang ditandai sebelum mengirim lamaran.';
      focusInvalidField(el);
      return false;
    }
  }
  return true;
}

function stopCamera(){
  if(mediaStream){mediaStream.getTracks().forEach(track=>track.stop());mediaStream=null;}
  const video=$('#ktp-video');
  if(video && video.srcObject){
    try{video.pause();}catch{}
    video.srcObject=null;
  }
}
function setCameraFrameState(state,title,message){
  const frame=$('#ktp-camera-frame'),placeholder=$('#ktp-camera-placeholder');
  if(frame)frame.dataset.cameraState=state;
  if(placeholder){
    placeholder.hidden=state==='ready';
    const strong=placeholder.querySelector('strong'),span=placeholder.querySelector('span');
    if(strong)strong.textContent=title||'';
    if(span)span.textContent=message||'';
  }
}
function waitForCameraFrame(video,stream,timeoutMs=10000){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{
      clearInterval(interval);clearTimeout(timer);
      for(const event of ['loadedmetadata','loadeddata','canplay','playing'])video.removeEventListener(event,check);
    };
    const finish=(error)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve();};
    const check=()=>{
      const track=stream.getVideoTracks?.()[0];
      if(track?.readyState==='ended'){finish(new Error('Akses kamera terputus.'));return;}
      if(video.videoWidth>0&&video.videoHeight>0&&video.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA){finish();}
    };
    for(const event of ['loadedmetadata','loadeddata','canplay','playing'])video.addEventListener(event,check);
    const interval=setInterval(check,150);
    const timer=setTimeout(()=>finish(new Error('Kamera belum mengirim gambar. Tutup aplikasi lain yang memakai kamera, lalu coba lagi.')),timeoutMs);
    check();
  });
}
function cameraCropCanvas(){
  const video=$('#ktp-video'),container=$('#ktp-camera-frame'),guide=$('#ktp-guide');
  if(!video?.videoWidth||!container||!guide)throw new Error('Kamera belum siap.');
  const box=container.getBoundingClientRect(),frame=guide.getBoundingClientRect();
  const scale=Math.max(box.width/video.videoWidth,box.height/video.videoHeight);
  const renderedW=video.videoWidth*scale,renderedH=video.videoHeight*scale;
  const offsetX=(box.width-renderedW)/2,offsetY=(box.height-renderedH)/2;
  const sx=Math.max(0,(frame.left-box.left-offsetX)/scale);
  const sy=Math.max(0,(frame.top-box.top-offsetY)/scale);
  const sw=Math.min(video.videoWidth-sx,frame.width/scale);
  const sh=Math.min(video.videoHeight-sy,frame.height/scale);
  if(sw<80||sh<50)throw new Error('Posisi KTP belum masuk bingkai.');
  const canvas=document.createElement('canvas');
  const factor=Math.min(2,1800/sw);
  canvas.width=Math.round(sw*factor);canvas.height=Math.round(sh*factor);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  return canvas;
}
function withTimeout(promise,milliseconds,message){
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));
}
function canvasToKtpDataUrl(canvas){
  const target=document.createElement('canvas');
  const scale=Math.min(1,1100/canvas.width);
  target.width=Math.round(canvas.width*scale);target.height=Math.round(canvas.height*scale);
  target.getContext('2d').drawImage(canvas,0,0,target.width,target.height);
  let quality=.68,data=target.toDataURL('image/jpeg',quality);
  while(data.length>125000&&quality>.38){quality-=.08;data=target.toDataURL('image/jpeg',quality);}
  if(data.length>145000)throw new Error('Ukuran foto KTP terlalu besar. Ambil ulang dengan jarak lebih dekat.');
  return data;
}
const OCR_REQUIRED_FIELDS=['nik','nama','tempat_lahir','tanggal_lahir','gender','alamat_jalan','alamat_rt','alamat_desa','alamat_kecamatan'];
function parsedFieldCount(data){return OCR_REQUIRED_FIELDS.filter(key=>data?.[key]).length;}
function mapOcrFieldConfidence(parsed,items=[]){
  const rules={
    nik:/(?:\bNIK\b|NO\.?\s*KTP|(?:\d[\s.-]*){16})/i,
    nama:/\bNAMA\b/i,
    tempat_lahir:/TEMPAT\s*[/|]?\s*TGL\s*LAHIR|TEMPAT.*LAHIR|\bTTL\b/i,
    tanggal_lahir:/\b\d{1,2}[\s./-]\d{1,2}[\s./-]\d{4}\b/i,
    gender:/JENIS\s*KELAMIN|LAKI[ -]?LAKI|PEREMPUAN/i,
    alamat_jalan:/\bALAMAT\b/i,
    alamat_rt:/RT\s*[/.-]?\s*RW/i,
    alamat_rw:/RT\s*[/.-]?\s*RW/i,
    alamat_desa:/KEL\s*[/.-]?\s*DESA|KELURAHAN|\bDESA\b/i,
    alamat_kecamatan:/\bKECAMATAN\b/i,
    alamat_provinsi:/\bPROVINSI\b/i,
    alamat_kota_nama:/\b(?:KOTA|KABUPATEN)\b/i,
    agama:/\bAGAMA\b/i,
    status_kawin:/STATUS\s*PERKAWINAN/i
  };
  const confidence={};
  for(const [field,rule] of Object.entries(rules)){
    if(!parsed?.[field])continue;
    const value=String(parsed[field]).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
    const candidates=items.filter(item=>{
      const line=String(item?.text||'');
      const lineValue=line.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
      return rule.test(line)||!!(value&&lineValue.includes(value));
    }).map(item=>Number(item?.score)).filter(score=>Number.isFinite(score)&&score>=0&&score<=1);
    if(candidates.length)confidence[field]=Math.max(...candidates);
  }
  return confidence;
}
function setOcrProgress(message){const progress=$('#ocr-progress');if(progress)progress.textContent=message;}
async function runOcr(canvas,generation){
  ktpPhotoDataUrl=canvasToKtpDataUrl(canvas);
  setOcrProgress('Menyiapkan mesin OCR lokal…');
  const [{ recognizeWithPaddle }, { extractKtpText }] = await Promise.all([
    import('./ocr-engine.js?v=20261124-hrga-workspace-19'),
    import('./ktp-ocr.js?v=20261124-hrga-workspace-19')
  ]);
  let result;
  try{
    result=await withTimeout(
      recognizeWithPaddle(canvas,setOcrProgress),
      35000,
      'Persiapan atau pembacaan OCR melewati batas 35 detik. Periksa koneksi lalu ulangi pemindaian.'
    );
  }catch(error){
    if(generation!==ocrRunGeneration)return;
    throw new Error(`${error.message||'Mesin OCR lokal belum siap.'} Foto tetap berada di perangkat. Coba ulangi pemindaian.`);
  }
  if(generation!==ocrRunGeneration)return;
  const parsed=extractKtpText(result.text||'');
  const score=parsedFieldCount(parsed);
  if(score<6||!parsed.nik||!parsed.nama){
    throw new Error(`Hasil OCR belum cukup lengkap (${score} dari 9 kelompok informasi terbaca). Periksa posisi dan kejernihan foto, lalu coba lagi.`);
  }
  if(generation!==ocrRunGeneration)return;
  ocrFieldConfidence=mapOcrFieldConfidence(parsed,result.items||[]);
  ocrMappingData={...parsed};
  initialData={...initialData,...parsed,ktp_foto:ktpPhotoDataUrl};
  writeLocalInitialDraft(initialData);
  stopCamera();
  closeCropImage();
  showForm();
}
function setOcrLoading(visible){
  const camera=$('#ktp-camera-area'),crop=$('#ktp-crop-editor'),loading=$('#ocr-loading');
  if(loading)loading.hidden=!visible;
  if(visible){if(camera)camera.hidden=true;if(crop)crop.hidden=true;}
  else if(activeCaptureMode==='file'){if(camera)camera.hidden=true;if(crop)crop.hidden=false;}
  else{if(camera)camera.hidden=false;if(crop)crop.hidden=true;}
}
function updateOcrAttempt(){
  const count=$('#ocr-attempt-count');
  if(count)count.textContent=`Percobaan ${ocrAttempts} dari 3`;
}
async function processOcrAttempt(canvas,mode='camera'){
  if(ocrBusy||ocrAttempts>=3)return;
  activeCaptureMode=mode;ocrBusy=true;ocrAttempts=Math.min(3,ocrAttempts+1);
  const generation=++ocrRunGeneration;
  updateOcrAttempt();setOcrLoading(true);stopCamera();
  const loadingText=$('#ocr-loading-text');
  if(loadingText)loadingText.textContent='Foto diproses di perangkat ini. Tidak ada foto yang dikirim ke layanan OCR.';
  setOcrProgress('Menyiapkan pemindai…');
  try{
    await runOcr(canvas,generation);
  }catch(error){
    if(generation!==ocrRunGeneration)return;
    const message=error.message||'Foto KTP belum berhasil dibaca.';
    setOcrLoading(false);
    const manualEntry=$('#manual-entry');
    const status=$('#ocr-status');
    if(ocrAttempts>=3){
      if(status)status.textContent=`OCR belum berhasil setelah 3 percobaan. ${message}`;
      if(manualEntry){manualEntry.hidden=false;manualEntry.removeAttribute('aria-hidden');manualEntry.removeAttribute('tabindex');manualEntry.textContent='Lanjut isi data secara manual';}
      const camera=$('#ktp-camera-area'),crop=$('#ktp-crop-editor');
      if(camera)camera.hidden=true;if(crop)crop.hidden=true;
    }else{
      const remaining=3-ocrAttempts;
      if(manualEntry)manualEntry.hidden=true;
      if(status)status.textContent=`${message} Percobaan ${ocrAttempts} dari 3 belum berhasil. Ulangi pemindaian (${remaining} kesempatan tersisa).`;
      if(activeCaptureMode==='camera')await startCamera();
    }
  }finally{ocrBusy=false;}
}

async function startCamera(){
  const video=$('#ktp-video'),status=$('#camera-status'),fallback=$('#ktp-fallback'),capture=$('#capture-ktp');
  const frame=$('#ktp-camera-frame');
  if(!video||!frame)return;
  if(capture)capture.disabled=true;
  if(fallback)fallback.hidden=true;
  setCameraFrameState('loading','Mengaktifkan kamera…','');
  if(capture){capture.textContent='Menyiapkan kamera…';capture.disabled=true;}
  if(!navigator.mediaDevices?.getUserMedia){
    setCameraFrameState('unavailable','Kamera tidak tersedia','');
    if(fallback)fallback.hidden=false;
    if(status)status.textContent='Browser atau alamat situs tidak menyediakan akses kamera. Pastikan halaman dibuka melalui HTTPS.';
    if(capture)capture.textContent='Kamera tidak aktif';
    return;
  }
  const constraintOptions=[
    {audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}},
    {audio:false,video:{facingMode:{ideal:'environment'}}},
    {audio:false,video:true}
  ];
  let lastError=null;
  for(const constraints of constraintOptions){
    let stream=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia(constraints);
      mediaStream=stream;
      video.autoplay=true;video.muted=true;video.playsInline=true;
      video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
      video.srcObject=stream;
      await video.play();
      await waitForCameraFrame(video,stream,10000);
      if(capture){capture.disabled=false;capture.textContent='Ambil foto KTP';}
      if(status)status.textContent='';
      setCameraFrameState('ready','','');
      const track=stream.getVideoTracks?.()[0];
      if(track){
        track.addEventListener('ended',()=>{
          if(mediaStream===stream){
            stopCamera();
            if(capture){capture.disabled=true;capture.textContent='Kamera tidak aktif';}
            setCameraFrameState('unavailable','Kamera terputus','');
            if(fallback)fallback.hidden=false;
          }
        },{once:true});
      }
      return;
    }catch(error){
      lastError=error;
      if(stream)stream.getTracks().forEach(track=>track.stop());
      if(mediaStream===stream)mediaStream=null;
      video.srcObject=null;
      if(!['OverconstrainedError','TypeError'].includes(error?.name))break;
    }
  }
  if(fallback)fallback.hidden=false;
  if(capture){capture.disabled=true;capture.textContent='Kamera tidak aktif';}
  setCameraFrameState('unavailable','Kamera belum dapat ditampilkan','Coba tutup aplikasi lain yang memakai kamera, periksa izin Chrome, atau pilih foto dari perangkat.');
  const reason=lastError?.name==='NotAllowedError'?'Izin kamera ditolak.':lastError?.name==='NotFoundError'?'Kamera tidak ditemukan.':lastError?.name==='NotReadableError'?'Kamera sedang dipakai aplikasi lain.':lastError?.message||'Kamera gagal diaktifkan.';
  if(status)status.textContent=reason;
}
function cropGeometry(){
  const canvas=$('#ktp-crop-canvas');if(!canvas||!cropImage)return null;
  const rotated=cropRotation%180!==0;
  const rotatedWidth=rotated?cropImage.height:cropImage.width;
  const rotatedHeight=rotated?cropImage.width:cropImage.height;
  const base=Math.max(canvas.width/rotatedWidth,canvas.height/rotatedHeight);
  return {canvas,scale:base*cropZoom,rotatedWidth,rotatedHeight};
}
function clampCropOffsets(){
  const geometry=cropGeometry();if(!geometry)return;
  const maxX=Math.max(0,(geometry.rotatedWidth*geometry.scale-geometry.canvas.width)/2);
  const maxY=Math.max(0,(geometry.rotatedHeight*geometry.scale-geometry.canvas.height)/2);
  cropOffsetX=Math.max(-maxX,Math.min(maxX,cropOffsetX));
  cropOffsetY=Math.max(-maxY,Math.min(maxY,cropOffsetY));
}
function drawCropPreview(){
  const geometry=cropGeometry();if(!geometry)return;
  const {canvas,scale}=geometry,ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#17243a';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.translate(canvas.width/2+cropOffsetX,canvas.height/2+cropOffsetY);ctx.rotate(cropRotation*Math.PI/180);ctx.scale(scale,scale);
  ctx.drawImage(cropImage,-cropImage.width/2,-cropImage.height/2);ctx.restore();
}
function renderCropEditor(){
  const camera=$('#ktp-camera-area'),crop=$('#ktp-crop-editor');if(!crop||!camera)return;
  camera.hidden=true;crop.hidden=false;
  crop.innerHTML=`<div class="ktp-crop-heading"><strong>Sesuaikan foto KTP</strong></div><div class="ktp-crop-wrap"><canvas id="ktp-crop-canvas" width="960" height="605" aria-label="Pratinjau foto KTP"></canvas></div><label class="ktp-zoom-control" for="ktp-crop-zoom"><span>Zoom</span><input type="range" id="ktp-crop-zoom" min="1" max="2.5" step="0.01" value="1"></label><div class="ktp-crop-tools"><button type="button" class="btn btn-secondary" id="ktp-rotate-left">Putar kiri</button><button type="button" class="btn btn-secondary" id="ktp-rotate-right">Putar kanan</button></div><div class="candidate-actions ktp-crop-actions"><button type="button" class="btn btn-secondary" id="ktp-crop-cancel">Kembali</button><button type="button" class="btn btn-primary" id="ktp-crop-use">Gunakan foto</button></div>`;
  const canvas=$('#ktp-crop-canvas');
  canvas.addEventListener('pointerdown',event=>{cropDragging=true;cropLastPointer={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!cropDragging||!cropLastPointer)return;const rect=canvas.getBoundingClientRect();const dx=(event.clientX-cropLastPointer.x)*canvas.width/rect.width,dy=(event.clientY-cropLastPointer.y)*canvas.height/rect.height;cropOffsetX+=dx;cropOffsetY+=dy;clampCropOffsets();cropLastPointer={x:event.clientX,y:event.clientY};drawCropPreview();});
  const endDrag=()=>{cropDragging=false;cropLastPointer=null;};
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
  $('#ktp-crop-zoom').addEventListener('input',event=>{cropZoom=Number(event.target.value)||1;clampCropOffsets();drawCropPreview();});
  $('#ktp-rotate-left').addEventListener('click',()=>{cropRotation=(cropRotation+270)%360;cropOffsetX=0;cropOffsetY=0;clampCropOffsets();drawCropPreview();});
  $('#ktp-rotate-right').addEventListener('click',()=>{cropRotation=(cropRotation+90)%360;cropOffsetX=0;cropOffsetY=0;clampCropOffsets();drawCropPreview();});
  $('#ktp-crop-cancel').addEventListener('click',()=>{activeCaptureMode='camera';crop.hidden=true;camera.hidden=false;startCamera();});
  $('#ktp-crop-use').addEventListener('click',()=>{const output=document.createElement('canvas');output.width=1800;output.height=Math.round(1800/1.586);output.getContext('2d').drawImage(canvas,0,0,output.width,output.height);processOcrAttempt(output,'file');});
  drawCropPreview();
}
function closeCropImage(){
  if(cropImageUrl){URL.revokeObjectURL(cropImageUrl);cropImageUrl='';}
  cropImage=null;cropZoom=1;cropOffsetX=0;cropOffsetY=0;cropRotation=0;
  const crop=$('#ktp-crop-editor');if(crop)crop.hidden=true;
}
async function processPhotoFile(file){
  if(!file)return;
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){const status=$('#ocr-status');if(status)status.textContent='Format foto tidak didukung. Gunakan JPG, PNG, atau WebP.';return;}
  if(file.size>8*1024*1024){const status=$('#ocr-status');if(status)status.textContent='Ukuran foto maksimal 8 MB.';return;}
  try{
    stopCamera();closeCropImage();
    cropImageUrl=URL.createObjectURL(file);
    cropImage=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Foto tidak dapat dibuka.'));image.src=cropImageUrl;});
    activeCaptureMode='file';renderCropEditor();
    const status=$('#ocr-status');if(status)status.textContent='Periksa crop sebelum foto diproses.';
  }catch(error){const status=$('#ocr-status');if(status)status.textContent=error.message||'Foto gagal dibuka.';}
  finally{const input=$('#ktp-fallback-input');if(input)input.value='';}
}
function showEntryModeChoice(){
  root.innerHTML=`<div class="step-top"><span class="stage-kicker">HR&amp;GA WORKSPACE</span><span class="step-number">IDENTITAS</span></div><section class="candidate-card ktp-card"><h1 class="candidate-title">Pilih cara mengisi identitas</h1><p class="candidate-sub">Anda dapat memindai KTP atau mengisi seluruh data secara manual.</p><div class="candidate-actions"><button type="button" class="btn btn-primary" id="choose-ocr">Pindai KTP</button><button type="button" class="btn btn-secondary" id="choose-manual">Isi manual</button></div></section>`;
  $('#choose-ocr').addEventListener('click',showKtpScreen);
  $('#choose-manual').addEventListener('click',showForm);
}
function showKtpScreen(){
  ocrRunGeneration++;ocrAttempts=0;ocrBusy=false;ocrFieldConfidence={};ocrMappingData=null;activeCaptureMode='camera';closeCropImage();
  root.innerHTML=`<div class="step-top"><span class="stage-kicker">HR&amp;GA WORKSPACE</span><span class="step-number">IDENTITAS</span></div><div class="wizard-progress"><span style="width:8%"></span></div><section class="candidate-card ktp-card"><h1 class="candidate-title">Pindai KTP</h1><div id="ktp-camera-area"><div class="ktp-camera-frame" id="ktp-camera-frame" data-camera-state="loading"><video id="ktp-video" autoplay muted playsinline webkit-playsinline></video><div class="ktp-camera-placeholder" id="ktp-camera-placeholder" role="status"><strong>Mengaktifkan kamera…</strong></div><div class="ktp-guide" id="ktp-guide" aria-hidden="true"></div></div><div class="camera-status" id="camera-status" aria-live="polite"></div><div id="ktp-fallback" class="ktp-fallback" hidden><span>Kamera tidak tersedia. Pilih foto dari perangkat.</span></div><input type="file" id="ktp-fallback-input" accept="image/jpeg,image/png,image/webp" hidden><div class="candidate-actions camera-actions"><button type="button" class="btn btn-primary" id="capture-ktp" disabled>Ambil foto</button><button type="button" class="btn btn-secondary" id="select-ktp-photo">Pilih foto</button></div></div><div id="ktp-crop-editor" hidden></div><div class="ocr-loading-panel" id="ocr-loading" hidden aria-live="polite"><div class="ocr-spinner" aria-hidden="true"></div><strong id="ocr-loading-text">Memproses foto KTP</strong><span id="ocr-attempt-count">Percobaan 1 dari 3</span><small id="ocr-progress">Menyiapkan pemindai…</small></div><div class="ocr-status" id="ocr-status" aria-live="polite"></div><button type="button" class="manual-entry" id="manual-entry" hidden aria-hidden="true" tabindex="-1">Lanjut isi data secara manual</button></section>`;
  startCamera();
  $('#capture-ktp').addEventListener('click',async()=>{
    if(ocrBusy||ocrAttempts>=3)return;
    try{const canvas=cameraCropCanvas();await processOcrAttempt(canvas,'camera');}
    catch(error){const status=$('#ocr-status');if(status)status.textContent=error.message||'Foto gagal diproses.';}
  });
  $('#select-ktp-photo').addEventListener('click',()=>$('#ktp-fallback-input').click());
  $('#ktp-fallback-input').addEventListener('change',event=>processPhotoFile(event.target.files?.[0]));
  $('#manual-entry').addEventListener('click',()=>{
    if(ocrAttempts!==3||ocrBusy)return;
    ocrRunGeneration++;stopCamera();closeCropImage();ocrFieldConfidence={};ocrMappingData=null;
    initialData={...initialData,ktp_foto:ktpPhotoDataUrl||''};writeLocalInitialDraft(initialData);showForm();
  });
}

async function uploadCv(file){
  const status=$('#cv-upload-state'),name=$('#cv-filename');
  if(!file)return;
  if(file.size>MAX_CV_BYTES){status.textContent='Ukuran CV maksimal 10 MB.';return;}
  const signature=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());
  if(signature!=='%PDF-'){status.textContent='File harus PDF.';return;}
  status.textContent='Mengunggah CV…';
  if(isDemoQuery){
    cvPath=`${CV_PATH_PREFIX}/demo-${crypto.randomUUID()}/cv.pdf`;
    cvFilename=file.name;
    name.textContent=cvFilename;
    status.textContent='CV tersimpan (mode pratinjau).';
    writeLocalDraft($('#application-form'));
    return;
  }
  try{
    const path=`${CV_PATH_PREFIX}/${crypto.randomUUID()}/cv.pdf`;
    const {error}=await supabase.storage.from(CV_BUCKET).upload(path,file,{contentType:'application/pdf',upsert:false});
    if(error)throw error;
    cvPath=path;
    cvFilename=file.name;
    name.textContent=cvFilename;
    status.textContent='CV tersimpan. Formulir dapat dikirim setelah seluruh data lengkap.';
    writeLocalDraft($('#application-form'));
  }catch(error){
    cvPath='';
    status.textContent=error.message||'CV belum tersimpan.';
    saveState('Belum tersimpan',true);
  }
}

function showForm(){
  stopCamera();
  root.innerHTML=renderForm(initialData);
  const form=$('#application-form');
  $('#cv-filename').textContent=cvFilename||'Unggah CV (PDF)';
  initAddressDropdowns(form,initialData).then(()=>{updateAddressPreview(form);queueDraftSave(form);});
  $('#cv-upload-state').textContent=cvFilename?'CV tersimpan':'';
  const numericFields=['nik','alamat_rt','alamat_rw','alamat_kodepos'];
  form.addEventListener('input',event=>{
    const el=event.target;
    if(numericFields.includes(el.name))normalizeDigitInput(el,el.name==='nik'?16:el.name==='alamat_kodepos'?5:3);
    if(el.name==='telepon')normalizeDigitInput(el,16);
    if(el.dataset.formatNumber==='idr')formatCurrencyInput(el);
    if(['nama','tanggal_lahir','gender'].includes(el.name))syncApplicantRow(form);
    if(ADDRESS_FIELD_NAMES.includes(el.name))updateAddressPreview(form);
    const wrapper=el.closest('.form-field')||el.closest('.consent-wrap');
    if(wrapper?.classList.contains('is-invalid'))validateField(el);
    if(!form.querySelector('.is-invalid'))$('#form-error',form).textContent='';
    queueDraftSave(form);
  });
  form.addEventListener('change',event=>{
    const el=event.target;
    const key=el.name;
    if(['alamat_rt','alamat_rw'].includes(key))padRtRw(el);
    if(['alamat_provinsi','alamat_kota_nama','alamat_kecamatan','alamat_desa'].includes(key)){
      handleAddressRegionChange(form,key).then(()=>{updateAddressPreview(form);queueDraftSave(form);}).catch(error=>{const status=$('#address-region-status');if(status)status.textContent=error.message;});
    }
    if(['saudara_count','anak_count','bahasa_count','kerja_count'].includes(key))rerenderGroups(form);
    if(key==='pendidikan_terakhir'){
      const old=collect(form);
      const eduBlock=$('#education-block',form);
      const eduField=stage2Schema.sections?.education?.fields?.find(f=>f.type==='system_education_repeater');
      if(eduBlock)eduBlock.innerHTML=renderEducationBlock(eduField,old);
    }else if(key==='status_kawin' || key==='domisili_berbeda'){
      const current=collect(form);updateDynamic(form,current);
    }
    if((el.closest('.form-field')||el.closest('.consent-wrap'))?.classList.contains('is-invalid'))validateField(el);
    syncApplicantRow(form);updateAddressPreview(form);queueDraftSave(form);
  });
  updateKtpUploadUI(form);
  $('#ktp-photo-file',form).addEventListener('change',event=>uploadManualKtp(event.target.files?.[0],form));
  $('#cv-file',form).addEventListener('change',event=>uploadCv(event.target.files?.[0]));
  $('#wizard-prev').addEventListener('click',()=>{
    const pos=activeStepDefs.findIndex(d=>d.stepIndex===activeStep);
    if(pos>0)setWizardStep(activeStepDefs[pos-1].stepIndex,{replace:true});
  });
  $('#wizard-next').addEventListener('click',async()=>{
    const error=$('#form-error');error.textContent='';
    if(!validateCurrentStep(form))return;
    const pos=activeStepDefs.findIndex(d=>d.stepIndex===activeStep);
    if(pos<activeStepDefs.length-1){setWizardStep(activeStepDefs[pos+1].stepIndex,{push:true});return;}
    if(!cvFilename){error.textContent='Unggah CV dalam format PDF.';return;}
    if(!validateWholeForm(form))return;
    await submitApplication(form);
  });
  rerenderGroups(form);
  setWizardStep(activeStep);
  queueDraftSave(form);
  if(cvFilename)$('#cv-upload-state').textContent='CV tersimpan';
  history.replaceState({portalForm:true,step:activeStep,root:true},'',location.href);
  history.pushState({portalForm:true,step:activeStep,root:false},'',location.href);
  writeLocalDraft(form);
}

function renderSubmissionComplete(){
  root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Lamaran terkirim</h1><a class="btn btn-primary full" href="../disc/${isDemoQuery?'?demo=1':''}">Lanjut ke Tes DISC</a></section>`;
}

async function submitApplication(form){
  const error=$('#form-error'),button=$('#wizard-next');
  error.textContent='';
  if(!ktpPhotoDataUrl){error.textContent='Unggah foto KTP pada bagian FOTO KTP sebelum mengirim lamaran.';$('#ktp-photo-file')?.focus();return;}
  if(!cvPath){error.textContent='CV belum tersimpan. Pilih ulang file CV dalam format PDF.';$('#cv-file')?.focus();return;}
  const data=sanitizeFinalData({...collect(form),ktp_foto:ktpPhotoDataUrl||''});
  if(!/^\d{16}$/.test(String(data.nik||''))){setWizardStep(0);const field=form.elements.namedItem('nik');if(field){setFieldValidationError(field,'NIK harus tepat 16 digit angka.');focusInvalidField(field);}error.textContent='Periksa kembali NIK yang ditandai.';return;}
  if(!data.nama){setWizardStep(0);error.textContent='Nama lengkap wajib diisi.';return;}
  setBusy(button,true,'Mengirim…');
  if(isDemoQuery){
    cacheCandidateNik(data.nik);
    try{localStorage.removeItem(LOCAL_DRAFT_KEY);}catch{}
    cvPath='';cvFilename='';
    renderSubmissionComplete(data.nama);
    return;
  }
  if(!isConfigured){error.textContent='Server belum terhubung.';setBusy(button,false);return;}
  try{
    const ktpPath=await uploadKtpForSubmission();
    data.ktp_path=ktpPath;
    const {error:submitError}=await supabase.rpc('submit_candidate_application_public',{p_data:data,p_cv_path:cvPath});
    if(submitError)throw submitError;
    cacheCandidateNik(data.nik);
    try{localStorage.removeItem(LOCAL_DRAFT_KEY);}catch{}
    cvPath='';cvFilename='';
    renderSubmissionComplete(data.nama);
  }catch(err){
    error.textContent=err.message||'Lamaran belum berhasil dikirim.';
    setBusy(button,false);
  }
}

function readDemoRecruitmentConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_RECRUITMENT_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function loadStage2Config(){
  if (isDemoQuery) {
    const demoCfg = readDemoRecruitmentConfig();
    const baseSchema = demoCfg?.stage2Schema && typeof demoCfg.stage2Schema === 'object'
      ? demoCfg.stage2Schema
      : DEFAULT_STAGE2_SCHEMA;
    stage2Schema = normalizeStage2Schema(baseSchema);
    availablePositions = stage2Schema.positions.slice();
    availableInfoSources = stage2Schema.infoSources.slice();
    return;
  }

  let sbSettingsRes = {};
  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('portal_settings')
        .select('key,value')
        .in('key', ['stage2_form_schema', 'application_positions']);
      if (error) throw error;
      sbSettingsRes = Object.fromEntries((data || []).map(row => [row.key, row.value]));
    } catch (error) {
      console.warn('Konfigurasi formulir /form memakai daftar lokal:', error);
    }
  }

  const demoFallback = readDemoRecruitmentConfig();
  const sbSchema = sbSettingsRes?.stage2_form_schema && typeof sbSettingsRes.stage2_form_schema === 'object'
    ? sbSettingsRes.stage2_form_schema
    : (demoFallback?.stage2Schema || null);
  const sbPositions = Array.isArray(sbSettingsRes?.application_positions)
    ? sbSettingsRes.application_positions.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim())
    : [];

  const nextSchema = normalizeStage2Schema(sbSchema || DEFAULT_STAGE2_SCHEMA);
  if (!sbSchema && sbPositions.length) {
    nextSchema.positions = [...new Set(sbPositions)];
  }

  stage2Schema = nextSchema;
  availablePositions = stage2Schema.positions.slice();
  availableInfoSources = stage2Schema.infoSources.slice();
}

async function init(){
  if(!isConfigured && !isDemoQuery){
    root.innerHTML='<section class="candidate-card"><h1 class="candidate-title">HR&amp;GA Workspace</h1><p class="candidate-sub">Server belum terhubung.</p></section>';return;
  }
  await loadStage2Config();
  const params=new URLSearchParams(location.search);
  const paramPos=(params.get('posisi')||'').trim();
  const paramSrc=(params.get('sumber')||'').trim();
  const matchedPos=paramPos?availablePositions.find(p=>p.toLocaleLowerCase('id')===paramPos.toLocaleLowerCase('id')):'';
  const matchedSrc=paramSrc?availableInfoSources.find(s=>s.toLocaleLowerCase('id')===paramSrc.toLocaleLowerCase('id')):'';

  const localDraft=readLocalDraft();
  if(localDraft){
    initialData={
      ...localDraft,
      ...(matchedPos&&!localDraft.posisi?{posisi:matchedPos}:{}),
      ...(matchedSrc&&!localDraft.sumber_informasi?{sumber_informasi:matchedSrc}:{})
    };
    cvFilename=localDraft.__cv_filename||'';
    cvPath=localDraft.__cv_path||'';
    ktpPhotoDataUrl=localDraft.ktp_foto||'';
    showForm();
    return;
  }
  if(matchedPos)initialData.posisi=matchedPos;
  if(matchedSrc)initialData.sumber_informasi=matchedSrc;
  let ocrEnabled=false;
  if(!isDemoQuery && isConfigured && supabase){
    try{
      const {data:flag}=await supabase.from('portal_settings').select('value').eq('key','ktp_ocr_enabled').maybeSingle();
      ocrEnabled=flag?.value===true;
    }catch(error){console.warn('OCR flag unavailable; manual mode remains active.',error);}
  }
  if(ocrEnabled)showEntryModeChoice();else showForm();
}

if(root){
  window.addEventListener('popstate',event=>{
    const form=$('#application-form');if(!form)return;
    if(event.state?.portalForm){
      setWizardStep(Number(event.state.step||0));
    }else if(location.pathname.replace(/\/+$/,'').endsWith('/form')){
      setWizardStep(activeStep);history.pushState({portalForm:true,step:activeStep,root:false},'',location.href);
    }
  });
  window.addEventListener('pagehide',()=>{
    const form=$('#application-form');if(form)writeLocalDraft(form);
    stopCamera();
  });
  document.addEventListener('visibilitychange',()=>{
    const form=$('#application-form');if(document.visibilityState==='hidden'&&form)writeLocalDraft(form);
  });
  init().catch(error=>{
    stopCamera();root.innerHTML=`<section class="candidate-card"><h1 class="candidate-title">HR&amp;GA Workspace</h1><p class="candidate-sub">${esc(error.message||'Formulir belum dapat dimuat.')}</p></section>`;
  });
}
