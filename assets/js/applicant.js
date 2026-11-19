import { supabase, isConfigured } from './supabase.js?v=20261116-manual-default-07';
import { MAX_CV_BYTES, CV_BUCKET, CV_PATH_PREFIX } from './config.js?v=20261116-manual-default-07';
import { $, esc, ageFrom, cacheCandidateNik, setBusy } from './common.js?v=20261120-hrga-workspace-01';
import { extractKtpText, formatKtpAddress } from './ktp-ocr.js?v=20261116-manual-default-07';
import { recognizeWithPaddle } from './ocr-engine.js?v=20261116-manual-default-07';

const root = $('#candidate-app');
const queryAll = (selector, scope=document) => [...scope.querySelectorAll(selector)];
const choices = items => items.map(value => ({value,label:value}));
const educationChoices = choices(['Tidak sekolah','SD / Sederajat','SMP / Sederajat','SMA / SMK','D1','D2','D3','D4','S1','S2','S3']);
const religionChoices = choices(['Islam','Kristen Protestan','Katolik','Hindu','Buddha','Konghucu','Kepercayaan','Lainnya']);
const DEFAULT_POSITIONS = ['Spray','Las','CNC','Spindel Kayu','Maintenance','OP. Produksi'];
let availablePositions = DEFAULT_POSITIONS.slice();
const personalFields = [
  {name:'nama',label:'Nama lengkap',required:true},
  {name:'nik',label:'NIK',required:true,inputmode:'numeric',maxlength:16,pattern:'[0-9]{16}'},
  {name:'tempat_lahir',label:'Tempat lahir',required:true},
  {name:'tanggal_lahir',label:'Tanggal lahir',type:'date',required:true},
  {name:'gender',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan']),required:true},
  {name:'gol_darah',label:'Golongan darah',type:'select',options:choices(['A','B','AB','O','Tidak tahu'])},
  {name:'agama',label:'Agama',type:'select',options:religionChoices},
  {name:'warga_negara',label:'Kewarganegaraan',type:'select',options:choices(['WNI','WNA']),value:'WNI'}
];
const applicationFields = [
  {name:'posisi',label:'Posisi yang dilamar',type:'select',options:choices(availablePositions),required:true},
  {name:'telepon',label:'No. telepon / WhatsApp',type:'tel',required:true},
  {name:'email',label:'Email',type:'email'},
  {name:'tinggi',label:'Tinggi badan (cm)',type:'number',min:80,max:240},
  {name:'berat',label:'Berat badan (kg)',type:'number',min:20,max:250}
];
const addressFields = [
  {name:'alamat_provinsi',label:'Provinsi',type:'select',options:[],required:true},
  {name:'alamat_kota_nama',label:'Kabupaten / kota',type:'select',options:[],required:true},
  {name:'alamat_kecamatan',label:'Kecamatan',type:'select',options:[],required:true},
  {name:'alamat_desa',label:'Desa / kelurahan',type:'select',options:[],required:true},
  {name:'alamat_tipe',label:'Jenis alamat',type:'select',options:choices(['Jalan','Dusun','Kampung','Perumahan','Komplek','Lingkungan','Gang','Lorong','Blok','Apartemen','Lainnya'])},
  {name:'alamat_jalan',label:'Nama jalan / dusun / perumahan',wide:true,required:true},
  {name:'alamat_rt',label:'RT',inputmode:'numeric',maxlength:3,required:true},
  {name:'alamat_rw',label:'RW',inputmode:'numeric',maxlength:3,required:true},
  {name:'alamat_kodepos',label:'Kode pos (otomatis dari desa / kelurahan)',inputmode:'numeric',maxlength:5,readonly:true}
];
const parentFields = [
  {name:'ayah_nama',label:'Nama ayah'}, {name:'ayah_umur',label:'Umur ayah (isi 0 jika meninggal dunia)',type:'number',min:0,max:120},
  {name:'ayah_pendidikan',label:'Pendidikan ayah',type:'select',options:educationChoices}, {name:'ayah_pekerjaan',label:'Pekerjaan ayah'},
  {name:'ibu_nama',label:'Nama ibu'}, {name:'ibu_umur',label:'Umur ibu (isi 0 jika meninggal dunia)',type:'number',min:0,max:120},
  {name:'ibu_pendidikan',label:'Pendidikan ibu',type:'select',options:educationChoices}, {name:'ibu_pekerjaan',label:'Pekerjaan ibu'}
];
const maritalField = {name:'status_kawin',label:'Status perkawinan',type:'select',options:choices(['Belum kawin','Kawin','Cerai hidup','Cerai mati']),required:true};
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
const refKeys = [['nama','Nama kontak darurat'],['alamat','Alamat'],['telepon','Telepon'],['pekerjaan','Pekerjaan'],['hubungan','Hubungan dengan Anda']];
const stepNames = ['Identitas','Keluarga & pendidikan','Kemampuan & pengalaman','Informasi tambahan','Lampiran'];
const LOCAL_DRAFT_KEY = 'portal_candidate_draft_v4';
let initialData = {};
let cvFilename = '';
let cvPath = '';
let activeStep = 0;
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

const selectOptions = (options, selected) => options.map(o => {
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
  const label=`<label for="${esc(id)}">${esc(field.label)}${reviewTag}</label>`;
  let control='';
  if(field.type==='select' || field.type==='year'){
    const options=field.type==='year' ? Array.from({length:57},(_,i)=>String(new Date().getFullYear()-i)) : field.options;
    control=`<select id="${esc(id)}" name="${esc(field.name)}" class="select" ${required}><option value="">${esc(field.placeholder||'Pilih')}</option>${selectOptions(options,value)}</select>`;
  }else if(field.type==='textarea'){
    control=`<textarea id="${esc(id)}" name="${esc(field.name)}" ${required}>${esc(value)}</textarea>`;
  }else if(field.currency){
    control=`<input id="${esc(id)}" name="${esc(field.name)}" type="text" inputmode="numeric" data-format-number="idr" value="${esc(formatCurrency(value))}" ${required}>`;
  }else{
    const type=field.type||'text';
    const inputmode=field.inputmode?`inputmode="${field.inputmode}"`:type==='number'?'inputmode="numeric"':'';
    control=`<input id="${esc(id)}" name="${esc(field.name)}" type="${type}" value="${esc(value)}" ${required} ${field.readonly?'readonly':''} ${inputmode} ${field.maxlength?`maxlength="${field.maxlength}"`:''} ${field.min!==undefined?`min="${field.min}"`:''} ${field.max!==undefined?`max="${field.max}"`:''} ${field.step?`step="${field.step}"`:''} ${field.pattern?`pattern="${field.pattern}"`:''}>`;
  }
  return `<div class="form-field ${wide}">${label}${control}</div>`;
}
function sectionHtml(letter,title,body){return `<section class="form-section"><h2><span class="section-bullet">${letter}</span>${title}</h2>${body}</section>`;}
function basicGrid(fields,values={}){return `<div class="form-grid">${fields.map(f=>fieldHtml(f,values)).join('')}</div>`;}
function countSelect(name,label,max,value,min=0){
  return fieldHtml({name,label,type:'select',options:Array.from({length:max-min+1},(_,i)=>String(i+min))}, {[name]:String(value??min)});
}
const REGION_API='https://www.emsifa.com/api-wilayah-indonesia/v2';
const REGION_CACHE_PREFIX='portal_region_cache_v2:';
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
  // Auto-match only when the spelling is very close and clearly unambiguous.
  return best&&best.score>=0.92&&(!second||best.score-second.score>=0.06)?best.item:null;
}
function regionCacheGet(key){try{const raw=localStorage.getItem(REGION_CACHE_PREFIX+key);if(!raw)return null;const value=JSON.parse(raw);return Date.now()-value.saved_at<30*86400000?value.data:null;}catch{return null;}}
function regionCacheSet(key,data){try{localStorage.setItem(REGION_CACHE_PREFIX+key,JSON.stringify({saved_at:Date.now(),data}));}catch{}}
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
    const regencies=await getRegionList(`regencies/${p.id}.json`);
    const r=setRegionOptions(regency,regencies,values.alamat_kota_nama,'Pilih kabupaten / kota');
    if(!r){
      if(status)status.textContent=values.alamat_kota_nama?`Kabupaten/kota “${values.alamat_kota_nama}” belum cocok. Pilih nama resmi dari daftar.`:'Pilih kabupaten/kota.';
      return;
    }
    setRegionHidden(form,'alamat_kota_id',r.id);
    const kind=/^Kota\s/i.test(r.name)?'Kota':'Kabupaten';
    if(form.elements.namedItem('alamat_kota_jenis'))form.elements.namedItem('alamat_kota_jenis').value=kind;
    const districts=await getRegionList(`districts/${r.id}.json`);
    const d=setRegionOptions(district,districts,values.alamat_kecamatan,'Pilih kecamatan');
    if(!d){
      if(status)status.textContent=values.alamat_kecamatan?`Kecamatan “${values.alamat_kecamatan}” belum cocok. Pilih nama resmi dari daftar.`:'Pilih kecamatan.';
      return;
    }
    setRegionHidden(form,'alamat_kecamatan_id',d.id);
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
    if(id){regency.disabled=true;try{setRegionOptions(regency,await getRegionList(`regencies/${id}.json`));}finally{regency.disabled=false;}}
  }else if(name==='alamat_kota_nama'){
    const id=selectedRegionId(form,name),option=regency?.selectedOptions[0];setRegionHidden(form,'alamat_kota_id',id);setRegionHidden(form,'alamat_kecamatan_id','');setRegionHidden(form,'alamat_desa_id','');
    const kind=/^Kota\s/i.test(option?.dataset.regionName||'')?'Kota':'Kabupaten';if(form.elements.namedItem('alamat_kota_jenis'))form.elements.namedItem('alamat_kota_jenis').value=kind;
    reset(district,'Pilih kecamatan');reset(village,'Pilih desa / kelurahan');if(zip)zip.value='';
    if(id){district.disabled=true;try{setRegionOptions(district,await getRegionList(`districts/${id}.json`));}finally{district.disabled=false;}}
  }else if(name==='alamat_kecamatan'){
    const id=selectedRegionId(form,name);setRegionHidden(form,'alamat_kecamatan_id',id);setRegionHidden(form,'alamat_desa_id','');reset(village,'Pilih desa / kelurahan');if(zip)zip.value='';
    if(id){village.disabled=true;try{setRegionOptions(village,await getRegionList(`villages/${id}.json`));}finally{village.disabled=false;}}
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
function renderAddress(values={}){
  const different=String(values.domisili_berbeda||'false')==='true' || (!!values.domisili && !!values.alamat_asal && values.domisili!==values.alamat_asal);
  return sectionHtml('⌖','ALAMAT SESUAI KTP',`${basicGrid(addressFields,values)}<input type="hidden" name="alamat_provinsi_id" value="${esc(values.alamat_provinsi_id||'')}"><input type="hidden" name="alamat_kota_id" value="${esc(values.alamat_kota_id||'')}"><input type="hidden" name="alamat_kota_jenis" value="${esc(values.alamat_kota_jenis||'Kabupaten')}"><input type="hidden" name="alamat_kecamatan_id" value="${esc(values.alamat_kecamatan_id||'')}"><input type="hidden" name="alamat_desa_id" value="${esc(values.alamat_desa_id||'')}"><input type="hidden" name="alamat_wilayah_type" value="${esc(values.alamat_wilayah_type||'')}"><input type="hidden" name="alamat_asal" value="${esc(values.alamat_asal||'')}"><div class="address-preview" id="address-preview"></div><label class="inline-toggle"><input type="checkbox" name="domisili_berbeda" value="true" ${different?'checked':''}><span>Alamat domisili berbeda</span></label><div class="conditional-fields" data-conditional="true" data-block="domicile" ${different?'':'hidden'}>${basicGrid([{name:'domisili',label:'Alamat domisili',type:'textarea',wide:true}],values)}</div>`);
}
function renderFamily(values={}){
  const siblingCount=Math.min(3,Math.max(0,Number(values.saudara_count??0)));
  const siblings=Array.from({length:siblingCount},(_,i)=>{
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
  const childrenCount=Math.min(3,Math.max(0,Number(values.anak_count||0)));
  const children=Array.from({length:childrenCount},(_,i)=>{
    const n=i+1,p=`anak${n}_`;
    const fs=[{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:100},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
    return `<div class="repeat-row"><div class="repeat-title">Anak ${n}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
  const spouseHidden=values.status_kawin==='Kawin'?'':'hidden';
  const childrenHidden=!values.status_kawin||values.status_kawin==='Belum kawin'?'hidden':'';
  return sectionHtml('B','SUSUNAN KELUARGA',
    `<div class="repeat-title">Orang tua</div>${basicGrid(parentFields,values)}<div class="repeat-row"><div class="repeat-title">Saudara kandung</div>${countSelect('saudara_count','Jumlah saudara kandung',3,siblingCount,0)}<div id="siblings-rows">${siblings}</div></div><div class="repeat-row">${basicGrid([{...maritalField,label:'Status Perkawinan Anda'}],values)}</div><div class="conditional-fields" data-conditional="true" data-block="spouse" ${spouseHidden}><div class="repeat-title">Suami / istri</div>${basicGrid(spouseFields,values)}</div><div class="conditional-fields" data-conditional="true" data-block="children" ${childrenHidden}><div class="repeat-title">Anak</div>${countSelect('anak_count','Jumlah anak',3,childrenCount,0)}<div id="children-rows">${children}</div></div>`);
}

function renderEducation(values={}){
  let selected=String(values.pendidikan_terakhir||'');
  if(!selected){if(values.universitas_instansi)selected='S1';else if(values.diploma_instansi)selected='D1-D4';else if(values.sma_instansi)selected='SMA';else if(values.smp_instansi)selected='SMP';else if(values.sd_instansi)selected='SD';}
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
  return sectionHtml('C','PENDIDIKAN FORMAL',`${basicGrid([{name:'pendidikan_terakhir',label:'Pendidikan Terakhir',type:'select',options:levels.map(([value,label])=>({value,label})),required:true}],{pendidikan_terakhir:selected})}${content}`);
}
function renderLanguages(values={}){
  const count=Math.min(4,Math.max(0,Number(values.bahasa_count||0)));
  const rows=Array.from({length:count},(_,i)=>{
    const n=i+1,p=`bahasa${n}`;
    const fs=[{name:p,label:'Bahasa',type:'select',options:choices(['Inggris','Mandarin','Arab','Jepang','Rusia','Jerman','Perancis','Latin','Lainnya'])},{name:p+'_bicara',label:'Berbicara',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_baca',label:'Membaca',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_tulis',label:'Menulis',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_lainnya',label:'Nama bahasa (jika memilih Lainnya)'}];
    return `<div class="repeat-row"><div class="repeat-title">Bahasa ${n}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
  return sectionHtml('D','KEMAMPUAN BAHASA (SELAIN BAHASA INDONESIA)',`${countSelect('bahasa_count','Jumlah bahasa',4,count,0)}<div id="language-rows">${rows}</div>`);
}
function renderWork(values={}){
  const count=Math.min(3,Math.max(0,Number(values.kerja_count||0)));
  const rows=Array.from({length:count},(_,i)=>{
    const n=i+1,p=`kerja${n}_`,fs=workKeys.map(([key,label,type])=>({name:p+key,label,currency:type==='currency',type:type==='number'?'number':type==='month'?'month':undefined,min:type==='number'?0:undefined,wide:['perusahaan','alasan'].includes(key)}));
    return `<div class="repeat-row"><div class="repeat-title">Pengalaman ${n}${n===1?' · terakhir':''}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
  return sectionHtml('F','PENGALAMAN KERJA',`${countSelect('kerja_count','Jumlah pengalaman kerja',3,count,0)}<div class="conditional-fields" data-conditional="true" data-block="work-rows" ${count?'':'hidden'}><div id="work-rows">${rows}</div></div>`);
}
function renderReferences(values={}){
  const fs=refKeys.map(([key,label])=>({name:`referensi1_${key}`,label,type:key==='alamat'?'textarea':key==='telepon'?'tel':key==='hubungan'?'select':undefined,options:key==='hubungan'?choices(['Orang tua','Pasangan','Saudara','Teman','Atasan','Lainnya']):undefined,wide:key==='alamat'}));
  return sectionHtml('H','ORANG YANG BISA DIHUBUNGI DALAM KEADAAN DARURAT',`<div class="repeat-row">${basicGrid(fs,values)}</div>`);
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
  activeStep=Math.min(stepNames.length-1,Math.max(0,Number(values.__form_step||0)));
  const step0=`<div class="form-step" data-form-step="0">${sectionHtml('A','DATA PRIBADI',basicGrid(personalFields,values))}${renderAddress(values)}${sectionHtml('P','INFORMASI LAMARAN',basicGrid(applicationFields,values))}</div>`;
  const step1=`<div class="form-step" data-form-step="1">${renderFamily(values)}${renderEducation(values)}</div>`;
  const step2=`<div class="form-step" data-form-step="2">${renderLanguages(values)}${sectionHtml('E','HOBI',basicGrid([{name:'hobby',label:'Hobi dan minat',type:'textarea',wide:true}],values))}${renderWork(values)}</div>`;
  const step3=`<div class="form-step" data-form-step="3">${sectionHtml('G','EKSPEKTASI',basicGrid([{name:'mulai_kerja',label:'Tanggal mulai bisa bekerja',type:'date'},{name:'gaji_harapan',label:'Gaji yang diharapkan (Rp)',currency:true},{name:'fasilitas_harapan',label:'Fasilitas lain yang diharapkan',wide:true}],values))}${renderReferences(values)}${sectionHtml('I','PERTANYAAN TERBUKA',basicGrid([{name:'jawaban1',label:'Apa yang Anda ketahui tentang perusahaan kami?',type:'textarea',wide:true},{name:'jawaban2',label:'Ceritakan tentang pribadi Anda.',type:'textarea',wide:true},{name:'jawaban3',label:'Apa yang akan Anda lakukan untuk perusahaan kami jika diterima?',type:'textarea',wide:true}],values))}</div>`;
  const consent=`<label class="consent-wrap"><input type="checkbox" id="setuju" name="setuju" value="true" ${String(values.setuju)==='true'||values.setuju===true?'checked':''} required><span>Dengan ini saya menyatakan semua data yang saya isi benar.</span></label>`;
  const adminAttachments=options.adminMode
    ? `<div class="admin-attachment-grid">
        ${values.ktp_path?`<button type="button" class="admin-attachment-action" data-admin-document="ktp"><span class="admin-attachment-icon">▧</span><span><b>Foto KTP</b><small>Buka dokumen di tab baru</small></span><strong>↗</strong></button>`:'<div class="admin-attachment-missing">Foto KTP tidak tersedia.</div>'}
        ${values.cv_path?`<button type="button" class="admin-attachment-action" data-admin-document="cv"><span class="admin-attachment-icon">▤</span><span><b>Curriculum Vitae</b><small>Buka dokumen di tab baru</small></span><strong>↗</strong></button>`:'<div class="admin-attachment-missing">CV tidak tersedia.</div>'}
      </div>`
    : '';
  const step4=options.adminMode
    ? `<div class="form-step" data-form-step="4">${sectionHtml('J','PERNYATAAN',consent)}<section class="form-section admin-attachment-note"><h2><span class="section-bullet">↗</span>LAMPIRAN</h2>${adminAttachments}</section></div>`
    : `<div class="form-step" data-form-step="4">${sectionHtml('J','PERNYATAAN',consent)}<section class="form-section"><h2><span class="section-bullet">KTP</span>FOTO KTP</h2><p class="field-hint">Unggah foto KTP yang jelas. Pada mode manual, foto hanya dikompres di perangkat dan tidak diproses dengan OCR.</p><label class="upload-zone"><span class="upload-icon">↥</span><b id="ktp-upload-label">Unggah foto KTP</b><small>JPG, PNG, atau WebP · Maks. 8 MB</small><input type="file" id="ktp-photo-file" accept="image/jpeg,image/png,image/webp" capture="environment"></label><div class="cv-upload-state" id="ktp-upload-state" aria-live="polite"></div><img id="ktp-photo-preview" alt="Pratinjau foto KTP" hidden style="display:none;max-width:100%;width:240px;max-height:150px;object-fit:contain;border:1px solid #dce2ea;border-radius:10px;margin-top:12px"></section><section class="form-section"><h2><span class="section-bullet">CV</span>CURRICULUM VITAE</h2><label class="upload-zone cv-upload-zone"><span class="upload-icon">↥</span><b id="cv-filename">${esc(cvFilename||'Unggah CV (PDF)')}</b><small>PDF · Maks. 10 MB</small><input type="file" id="cv-file" accept="application/pdf,.pdf"></label><div class="cv-upload-state" id="cv-upload-state"></div></section></div>`;
  const reviewCount=options.adminMode?0:Object.values(ocrFieldConfidence).filter(score=>score<0.84).length;
  const reviewNotice=reviewCount?`<div class="ocr-review-summary" role="status">${reviewCount} bagian hasil OCR memiliki tingkat keyakinan teks rendah. Periksa penanda di samping kolom sebelum mengirim lamaran.</div>`:'';
  if(options.adminMode){
    return `<div class="admin-candidate-wizard"><div class="step-top"><span class="stage-kicker">DATA KANDIDAT</span><span class="step-number" id="admin-wizard-count">01 / 05</span></div><div class="wizard-progress"><span id="admin-wizard-progress"></span></div><section class="candidate-card form-wizard-card"><div class="wizard-heading"><div><h1 class="candidate-title">Formulir kandidat</h1><div class="wizard-step-label" id="admin-wizard-step-label">${stepNames[0]}</div></div><span class="admin-editor-state">MODE KOREKSI</span></div><form id="admin-candidate-form" novalidate>${step0}${step1}${step2}${step3}${step4}<div class="wizard-actions admin-wizard-actions"><button type="button" class="btn btn-secondary" id="admin-wizard-prev" disabled>Kembali</button><button type="button" class="btn btn-primary" id="admin-wizard-next">Lanjut</button></div></form></section></div>`;
  }
  return `<div class="step-top"><span class="stage-kicker">FORMULIR LAMARAN KERJA</span><span class="step-number" id="wizard-count"></span></div><div class="wizard-progress"><span id="wizard-progress-bar"></span></div><section class="candidate-card form-wizard-card">${renderOcrMappingPanel(ocrMappingData)}${reviewNotice}<div class="wizard-heading"><div><h1 class="candidate-title">Data pelamar</h1><div class="wizard-step-label" id="wizard-step-label"></div></div><span class="wizard-save-state" id="draft-save-state" aria-live="polite">●</span></div><form id="application-form" novalidate>${step0}${step1}${step2}${step3}${step4}<div id="form-error" class="form-error" role="alert"></div><div class="wizard-actions"><button type="button" class="btn btn-secondary" id="wizard-prev">Kembali</button><button type="button" class="btn btn-primary" id="wizard-next">Lanjut</button></div></form></section>`;
}

/**
 * Build the Tahap 2 admin editor from the exact field renderer used by the
 * candidate mobile form. This keeps labels, options, conditional groups and
 * wizard order in one source of truth.
 */
export function renderAdminEditorMarkup(values={}, positions=[]){
  const source={...(values||{})};
  const normalizedPositions=[...new Set([...(Array.isArray(positions)?positions:[]),source.posisi].map(v=>String(v||'').trim()).filter(Boolean))];
  availablePositions=normalizedPositions.length?normalizedPositions:DEFAULT_POSITIONS.slice();
  applicationFields[0].options=choices(availablePositions);
  // Older submissions may not contain the visible repeat-count controls. Infer
  // the number of rendered rows from the saved keys instead of hiding data.
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
    if(source.universitas_instansi)source.pendidikan_terakhir=source.sma_instansi?'S1':'S1';
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
  const labels=stepNames;
  let step=0;
  const showStep=(next,scroll=true)=>{
    step=Math.max(0,Math.min(labels.length-1,next));
    form.querySelectorAll('.form-step').forEach(el=>{el.hidden=Number(el.dataset.formStep)!==step;});
    const count=host.querySelector('#admin-wizard-count');if(count)count.textContent=`${String(step+1).padStart(2,'0')} / 05`;
    const title=host.querySelector('#admin-wizard-step-label');if(title)title.textContent=labels[step];
    const progress=host.querySelector('#admin-wizard-progress');if(progress)progress.style.width=`${(step+1)/labels.length*100}%`;
    const prev=host.querySelector('#admin-wizard-prev');if(prev)prev.disabled=step===0;
    const nextButton=host.querySelector('#admin-wizard-next');if(nextButton){nextButton.textContent='Lanjut';nextButton.hidden=step===labels.length-1;}
    if(scroll)host.scrollIntoView?.({behavior:'smooth',block:'start'});
  };
  host.querySelector('#admin-wizard-prev')?.addEventListener('click',()=>showStep(step-1));
  host.querySelector('#admin-wizard-next')?.addEventListener('click',()=>showStep(step+1));

  const numericFields=['nik','alamat_rt','alamat_rw','alamat_kodepos'];
  form.addEventListener('input',event=>{
    const el=event.target;if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement))return;
    if(numericFields.includes(el.name))normalizeDigitInput(el,el.name==='nik'?16:el.name==='alamat_kodepos'?5:3);
    if(el.name==='telepon')normalizeDigitInput(el,16);
    if(el.dataset.formatNumber==='idr')formatCurrencyInput(el);
    if(['nama','tanggal_lahir','gender'].includes(el.name))syncApplicantRow(form);
    if(addressFields.some(field=>field.name===el.name))updateAddressPreview(form);
  });
  form.addEventListener('change',async event=>{
    const key=event.target?.name;
    if(['alamat_provinsi','alamat_kota_nama','alamat_kecamatan','alamat_desa'].includes(key)){
      try{await handleAddressRegionChange(form,key);}catch(error){console.warn('Admin address update failed:',error);}
    }
    if(['saudara_count','anak_count','bahasa_count','kerja_count'].includes(key))rerenderGroups(form);
    if(key==='pendidikan_terakhir'){
      const old=collect(form);const section=[...form.querySelectorAll('.form-section')].find(el=>el.textContent.includes('PENDIDIKAN FORMAL'));
      if(section)section.outerHTML=renderEducation(old);
    }else if(key==='status_kawin'||key==='domisili_berbeda')updateDynamic(form,collect(form));
    syncApplicantRow(form);updateAddressPreview(form);
  });
  showStep(0,false);
  rerenderGroups(form);
  try{await initAddressDropdowns(form,values);updateAddressPreview(form);}catch(error){console.warn('Admin address options could not be restored:',error);}
  return {goToStep:showStep};
}

export function collectAdminEditorData(form, original={}){
  const edited=collect(form);
  const merged={...(original||{}),...edited};
  merged.nama=String(edited.nama||'').trim();
  merged.nik=String(edited.nik||'').replace(/\D/g,'');
  merged.posisi=String(edited.posisi||'').trim();
  // A visible repeat-count is an explicit instruction to retain only that many
  // entries. Remove stale keys above the chosen count instead of keeping hidden rows.
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
  // Recompute the candidate's own family-row mirror, as the mobile form does.
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
  // Keep even conditionally hidden values in the draft. If a candidate changes a
  // selection by mistake, hiding a group must not erase what was already typed.
  for(const el of [...form.elements]){
    const key=el.name;
    if(!key||el.disabled||el.type==='file') continue;
    if(el.type==='checkbox'){data[key]=el.checked?'true':'false';continue;}
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
  // Candidate is appended as the first family member automatically.
  data.saudara1_nama=data.nama||'';
  data.saudara1_lp=data.gender||'';
  data.saudara1_umur=data.umur;
  data.saudara1_pendidikan=data.pendidikan_terakhir||data.saudara1_pendidikan||'';
  data.saudara1_pekerjaan=data.kerja1_jabatan||data.kerja1_usaha||data.saudara1_pekerjaan||'';
  data.saudara1_pendidikan=data.pendidikan_terakhir||data.saudara1_pendidikan||'';
  data.saudara1_pekerjaan=data.kerja1_jabatan||data.kerja1_usaha||data.saudara1_pekerjaan||'';
  return buildAddress(data);
}
function syncApplicantRow(form){
  const values=collect(form);
  const set=(name,value)=>{const el=form.querySelector(`[name="${name}"]`);if(el)el.value=value||'';};
  set('saudara1_nama',values.nama);set('saudara1_lp',values.gender==='L'?'Laki-laki':values.gender==='P'?'Perempuan':'');set('saudara1_umur',values.umur);set('umur',values.umur);set('nama_terang',values.nama);
}
function updateDynamic(form,values){
  const marital=form.querySelector('[name="status_kawin"]')?.value||values.status_kawin||'';
  const spouse=form.querySelector('[data-block="spouse"]');if(spouse)spouse.hidden=marital!=='Kawin';
  const children=form.querySelector('[data-block="children"]');if(children)children.hidden=!marital||marital==='Belum kawin';
  const workCount=Number(form.querySelector('#kerja_count')?.value??values.kerja_count??0);
  const work=form.querySelector('[data-block="work-rows"]');if(work)work.hidden=workCount===0;
  
  const domicile=form.querySelector('[data-block="domicile"]');
  const domicileToggle=form.querySelector('[name="domisili_berbeda"]');
  if(domicile)domicile.hidden=!domicileToggle?.checked;
}
function rerenderGroups(form){
  const values=collect(form);
  const siblingCount=Math.min(3,Math.max(0,Number(values.saudara_count??0)));
  const siblingHost=$('#siblings-rows',form);
  if(siblingHost){
    siblingHost.innerHTML=Array.from({length:siblingCount},(_,i)=>{
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
  const childrenHost=$('#children-rows',form);
  if(childrenHost){
    const count=Math.min(3,Math.max(0,Number(values.anak_count||0)));
    childrenHost.innerHTML=Array.from({length:count},(_,i)=>{
      const n=i+1,p=`anak${n}_`,fields=[{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:100},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
      return `<div class="repeat-row"><div class="repeat-title">Anak ${n}</div>${basicGrid(fields,values)}</div>`;
    }).join('');
  }
  const languageHost=$('#language-rows',form);
  if(languageHost){
    const count=Math.min(4,Math.max(0,Number(values.bahasa_count||0)));
    languageHost.innerHTML=Array.from({length:count},(_,i)=>{
      const p=`bahasa${i+1}`,fields=[{name:p,label:'Bahasa',type:'select',options:choices(['Inggris','Mandarin','Arab','Jepang','Rusia','Jerman','Perancis','Latin','Lainnya'])},{name:p+'_bicara',label:'Berbicara',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_baca',label:'Membaca',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_tulis',label:'Menulis',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_lainnya',label:'Nama bahasa (jika memilih Lainnya)'}];
      return `<div class="repeat-row"><div class="repeat-title">Bahasa ${i+1}</div>${basicGrid(fields,values)}</div>`;
    }).join('');
  }
  const workHost=$('#work-rows',form);
  if(workHost){
    const count=Math.min(3,Math.max(0,Number(values.kerja_count||0)));
    workHost.innerHTML=Array.from({length:count},(_,i)=>{
      const n=i+1,p=`kerja${n}_`,fields=workKeys.map(([key,label,type])=>({name:p+key,label,currency:type==='currency',type:type==='number'?'number':type==='month'?'month':undefined,min:type==='number'?0:undefined,wide:['perusahaan','alasan'].includes(key)}));
      return `<div class="repeat-row"><div class="repeat-title">Pengalaman ${n}${n===1?' · terakhir':''}</div>${basicGrid(fields,values)}</div>`;
    }).join('');
  }
  updateDynamic(form,values);
  syncApplicantRow(form);
  updateAddressPreview(form);
}

function updateAddressPreview(form){
  const preview=$('#address-preview',form);if(!preview)return;
  const data={};for(const key of addressFields.map(f=>f.name)){const el=form.elements.namedItem(key);data[key]=el?.value||'';}
  const address=formatKtpAddress(data);
  const hidden=form.elements.namedItem('alamat_asal');if(hidden)hidden.value=address;
  preview.textContent=address;
  preview.classList.toggle('empty',!address);
}
function setWizardStep(step,{push=false,replace=false}={}){
  activeStep=Math.max(0,Math.min(stepNames.length-1,step));
  queryAll('.form-step',root).forEach(el=>el.hidden=Number(el.dataset.formStep)!==activeStep);
  $('#wizard-count',root).textContent=`${String(activeStep+1).padStart(2,'0')} / 05`;
  $('#wizard-step-label',root).textContent=stepNames[activeStep];
  $('#wizard-progress-bar',root).style.width=`${(activeStep+1)/stepNames.length*100}%`;
  $('#wizard-prev',root).disabled=activeStep===0;
  $('#wizard-next',root).textContent=activeStep===stepNames.length-1?'Kirim lamaran':'Lanjut';
  if(push){try{history.pushState({portalForm:true,step:activeStep},'',location.href);}catch{}}
  else if(replace){try{history.replaceState({portalForm:true,step:activeStep},'',location.href);}catch{}}
  const form=$('#application-form');if(form)queueDraftSave(form);
  window.scrollTo({top:0,behavior:'smooth'});
}
function saveState(message,failed=false){
  const el=$('#draft-save-state');if(!el)return;
  el.textContent=message;el.classList.toggle('failed',failed);
}
function localDraftKey(){return LOCAL_DRAFT_KEY;}
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
async function flushDraft(form){
  writeLocalDraft(form);
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
  // Conditional data is retained in the local draft but excluded from the final
  // application record when the corresponding branch does not apply.
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
    el.setAttribute('aria-invalid','true');
    el.setAttribute('aria-describedby',hint.id);
  }else{
    old?.remove();
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  }
}
function focusInvalidField(el){
  const wrapper=el.closest('.form-field')||el.closest('.consent-wrap');
  requestAnimationFrame(()=>{
    wrapper?.scrollIntoView({behavior:'smooth',block:'center'});
    el.focus({preventScroll:true});
  });
}
function validateField(el){
  const message=fieldValidationMessage(el);
  setFieldValidationError(el,message);
  return !message;
}
function validateCurrentStep(form){
  const step=$(`[data-form-step="${activeStep}"]`,form);
  let firstInvalid=null;
  let invalidAddress=false;
  for(const el of queryAll('input,select,textarea',step)){
    if(el.disabled||['file','hidden'].includes(el.type)||el.closest('[data-conditional="true"][hidden]'))continue;
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
  for(const el of queryAll('input,select,textarea',form)){
    if(el.disabled||['file','hidden'].includes(el.type)||el.closest('[data-conditional="true"][hidden]'))continue;
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
  let result;
  try{
    result=await withTimeout(
      recognizeWithPaddle(canvas,setOcrProgress),
      35000,
      'Persiapan atau pembacaan OCR melewati batas 35 detik. Periksa koneksi lalu ulangi pemindaian.'
    );
  }catch(error){
    if(generation!==ocrRunGeneration)return;
    // Avoid silently launching a second large OCR runtime after the primary
    // model times out; that double-download caused long mobile loading loops.
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
      // Retry weaker constraints only when the browser says a requested
      // constraint is unsupported. Permission / device / first-frame failures
      // should fail fast instead of presenting a long black camera preview.
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
  root.innerHTML=`<div class="step-top"><span class="stage-kicker">HR&GA WORKSPACE</span><span class="step-number">IDENTITAS</span></div><section class="candidate-card ktp-card"><h1 class="candidate-title">Pilih cara mengisi identitas</h1><p class="candidate-sub">Anda dapat memindai KTP atau mengisi seluruh data secara manual.</p><div class="candidate-actions"><button type="button" class="btn btn-primary" id="choose-ocr">Pindai KTP</button><button type="button" class="btn btn-secondary" id="choose-manual">Isi manual</button></div></section>`;
  $('#choose-ocr').addEventListener('click',showKtpScreen);
  $('#choose-manual').addEventListener('click',showForm);
}
function showKtpScreen(){
  ocrRunGeneration++;ocrAttempts=0;ocrBusy=false;ocrFieldConfidence={};ocrMappingData=null;activeCaptureMode='camera';closeCropImage();
  root.innerHTML=`<div class="step-top"><span class="stage-kicker">HR&GA WORKSPACE</span><span class="step-number">IDENTITAS</span></div><div class="wizard-progress"><span style="width:8%"></span></div><section class="candidate-card ktp-card"><h1 class="candidate-title">Pindai KTP</h1><div id="ktp-camera-area"><div class="ktp-camera-frame" id="ktp-camera-frame" data-camera-state="loading"><video id="ktp-video" autoplay muted playsinline webkit-playsinline></video><div class="ktp-camera-placeholder" id="ktp-camera-placeholder" role="status"><strong>Mengaktifkan kamera…</strong></div><div class="ktp-guide" id="ktp-guide" aria-hidden="true"></div></div><div class="camera-status" id="camera-status" aria-live="polite"></div><div id="ktp-fallback" class="ktp-fallback" hidden><span>Kamera tidak tersedia. Pilih foto dari perangkat.</span></div><input type="file" id="ktp-fallback-input" accept="image/jpeg,image/png,image/webp" hidden><div class="candidate-actions camera-actions"><button type="button" class="btn btn-primary" id="capture-ktp" disabled>Ambil foto</button><button type="button" class="btn btn-secondary" id="select-ktp-photo">Pilih foto</button></div></div><div id="ktp-crop-editor" hidden></div><div class="ocr-loading-panel" id="ocr-loading" hidden aria-live="polite"><div class="ocr-spinner" aria-hidden="true"></div><strong id="ocr-loading-text">Memproses foto KTP</strong><span id="ocr-attempt-count">Percobaan 1 dari 3</span><small id="ocr-progress">Menyiapkan pemindai…</small></div><div class="ocr-status" id="ocr-status" aria-live="polite"></div><button type="button" class="manual-entry" id="manual-entry" hidden aria-hidden="true" tabindex="-1">Lanjut isi data secara manual</button></section>`;
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
  const nik=form.querySelector('[name="nik"]');
  const numericFields=['nik','alamat_rt','alamat_rw','alamat_kodepos'];
  form.addEventListener('input',event=>{
    const el=event.target;
    if(numericFields.includes(el.name))normalizeDigitInput(el,el.name==='nik'?16:el.name==='alamat_kodepos'?5:3);
    if(el.name==='telepon')normalizeDigitInput(el,16);
    if(el.dataset.formatNumber==='idr')formatCurrencyInput(el);
    if(['nama','tanggal_lahir','gender'].includes(el.name))syncApplicantRow(form);
    if(addressFields.some(f=>f.name===el.name))updateAddressPreview(form);
    const wrapper=el.closest('.form-field')||el.closest('.consent-wrap');
    if(wrapper?.classList.contains('is-invalid'))validateField(el);
    if(!form.querySelector('.is-invalid'))$('#form-error',form).textContent='';
    queueDraftSave(form);
  });
  form.addEventListener('change',event=>{
    const key=event.target.name;
    if(['alamat_rt','alamat_rw'].includes(key))padRtRw(event.target);
    if(['alamat_provinsi','alamat_kota_nama','alamat_kecamatan','alamat_desa'].includes(key))handleAddressRegionChange(form,key).then(()=>{updateAddressPreview(form);queueDraftSave(form);}).catch(error=>{const el=$('#address-region-status');if(el)el.textContent=error.message;});
    if(['saudara_count','anak_count','bahasa_count','kerja_count'].includes(key))rerenderGroups(form);
    if(key==='pendidikan_terakhir'){const old=collect(form);const section=[...form.querySelectorAll('.form-section')].find(x=>x.textContent.includes('PENDIDIKAN FORMAL'));if(section)section.outerHTML=renderEducation(old);}
    else if(key==='status_kawin' || key==='domisili_berbeda'){
      const current=collect(form);updateDynamic(form,current);
    }
    if((event.target.closest('.form-field')||event.target.closest('.consent-wrap'))?.classList.contains('is-invalid'))validateField(event.target);
    syncApplicantRow(form);updateAddressPreview(form);queueDraftSave(form);
  });
  updateKtpUploadUI(form);
  $('#ktp-photo-file',form).addEventListener('change',event=>uploadManualKtp(event.target.files?.[0],form));
  $('#cv-file',form).addEventListener('change',event=>uploadCv(event.target.files?.[0]));
  $('#wizard-prev').addEventListener('click',()=>{if(activeStep>0)setWizardStep(activeStep-1,{replace:true});});
  $('#wizard-next').addEventListener('click',async()=>{
    const error=$('#form-error');error.textContent='';
    if(!validateCurrentStep(form))return;
    if(activeStep<stepNames.length-1){setWizardStep(activeStep+1,{push:true});return;}
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
  root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Lamaran terkirim</h1><a class="btn btn-primary full" href="../disc/">Lanjut ke Tes DISC</a></section>`;
}
async function submitApplication(form){
  const error=$('#form-error'),button=$('#wizard-next');
  error.textContent='';
  if(!isConfigured){error.textContent='Server belum terhubung.';return;}
  if(!ktpPhotoDataUrl){error.textContent='Unggah foto KTP pada bagian FOTO KTP sebelum mengirim lamaran.';$('#ktp-photo-file')?.focus();return;}
  if(!cvPath){error.textContent='CV belum tersimpan. Pilih ulang file CV dalam format PDF.';$('#cv-file')?.focus();return;}
  const data=sanitizeFinalData({...collect(form),ktp_foto:ktpPhotoDataUrl||''});
  if(!/^\d{16}$/.test(String(data.nik||''))){setWizardStep(0);const field=form.elements.namedItem('nik');if(field){setFieldValidationError(field,'NIK harus tepat 16 digit angka.');focusInvalidField(field);}error.textContent='Periksa kembali NIK yang ditandai.';return;}
  if(!data.nama){setWizardStep(0);error.textContent='Nama lengkap wajib diisi.';return;}
  setBusy(button,true,'Mengirim…');
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
async function loadApplicationPositions(){
  try{
    const {data,error}=await supabase.from('portal_settings').select('value').eq('key','application_positions').maybeSingle();
    if(error)throw error;
    const list=Array.isArray(data?.value)?data.value.filter(x=>typeof x==='string'&&x.trim()):[];
    if(list.length)availablePositions=[...new Set(list.map(x=>x.trim()))];
    applicationFields[0].options=choices(availablePositions);
  }catch(error){
    console.warn('Daftar posisi memakai daftar cadangan:',error);
    applicationFields[0].options=choices(availablePositions);
  }
}
async function init(){
  if(!isConfigured){
    root.innerHTML='<section class="candidate-card"><h1 class="candidate-title">HR&GA Workspace</h1><p class="candidate-sub">Server belum terhubung.</p></section>';return;
  }
  await loadApplicationPositions();
  const localDraft=readLocalDraft();
  if(localDraft){
    initialData=localDraft;
    cvFilename=localDraft.__cv_filename||'';
    cvPath=localDraft.__cv_path||'';
    ktpPhotoDataUrl=localDraft.ktp_foto||'';
    showForm();
    return;
  }
  let ocrEnabled=false;
  try{
    const {data:flag}=await supabase.from('portal_settings').select('value').eq('key','ktp_ocr_enabled').maybeSingle();
    ocrEnabled=flag?.value===true;
  }catch(error){console.warn('OCR flag unavailable; manual mode remains active.',error);}
  if(ocrEnabled)showEntryModeChoice();else showForm();
}
if(root){
  window.addEventListener('popstate',event=>{
    const form=$('#application-form');if(!form)return;
    if(event.state?.portalForm){
      setWizardStep(Number(event.state.step||0));
      // The root state is the final in-form back stop. A further back may leave
      // the page, but the draft is durable and will be restored on return.
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
    stopCamera();root.innerHTML=`<section class="candidate-card"><h1 class="candidate-title">HR&GA Workspace</h1><p class="candidate-sub">${esc(error.message||'Formulir belum dapat dimuat.')}</p></section>`;
  });
}
