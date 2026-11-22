const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=(process.env.CP04_QA_BASE_URL||'https://hrmbm.github.io/coba').replace(/\/+$/,'');
const ARTIFACTS=path.join(process.cwd(),'artifacts');
fs.mkdirSync(ARTIFACTS,{recursive:true});
const results=[];
const SUPABASE_STUB="const state = () => globalThis.__cp04qa || {};\nfunction persist(){try{sessionStorage.setItem('__cp04qa_state_v1',JSON.stringify(state()));}catch{}}\nfunction log(event){const s=state();s.events=s.events||[];s.events.push(event);persist();}\nfunction rowsFor(table){const s=state();if(table==='applicants')return s.applicants||[];if(table==='employees')return s.employees||[];if(table==='candidate_stage1_applications')return s.stage1||[];if(table==='print_templates')return s.templates||[];return [];}\nfunction execute(table,op,payload,filters){const s=state();log({kind:'table',table,op,payload,filters});\n if(op==='insert'){if(table==='candidate_stage1_applications'){s.stage1=s.stage1||[];s.stage1.push(Object.assign({id:'qa-stage1-new'},payload));}if(table==='print_templates'){persist();return {data:{id:'qa-template'},error:null};}persist();return {data:null,error:null};}\n if(op==='upsert'&&table==='portal_settings'){if(payload.key==='application_positions')s.positions=payload.value;else if(payload.key==='ktp_ocr_enabled')s.ocrEnabled=payload.value===true;persist();return {data:payload,error:null};}\n if(op==='update'){for(const row of rowsFor(table))if(Object.entries(filters||{}).every(([k,v])=>String(row[k])===String(v)))Object.assign(row,payload);persist();return {data:null,error:null};}\n return {data:rowsFor(table),error:null};}\nfunction makeQuery(table){let op='select',payload=null,filters={};const q={select(){return q;},order(){return q;},limit(){return q;},eq(k,v){filters[k]=v;return q;},insert(v){op='insert';payload=v;return q;},update(v){op='update';payload=v;return q;},upsert(v){op='upsert';payload=v;return q;},maybeSingle(){const s=state();let data=null;if(table==='portal_settings'){data=filters.key==='application_positions'?{value:s.positions||[]}:filters.key==='ktp_ocr_enabled'?{value:s.ocrEnabled===true}:null;}else if(table==='admin_users')data={display_name:'QA Admin'};else if(table==='print_templates'&&filters.is_active)data=(s.templates||[]).find(x=>x.is_active)||null;return Promise.resolve({data,error:null});},single(){return Promise.resolve(execute(table,op,payload,filters));},then(resolve,reject){return Promise.resolve(execute(table,op,payload,filters)).then(resolve,reject);}};return q;}\nexport function createClient(){const s=state();const auth={async getSession(){return {data:{session:null},error:null};},async setSession(){const session={user:{id:'qa-admin-user',email:'qa.admin@qa.test'},access_token:'qa-access',refresh_token:'qa-refresh'};s.session=session;persist();return {data:{session},error:null};},async signOut(){s.session=null;persist();return {error:null};}};\n const storage={from(bucket){return {async upload(filePath,file,options){log({kind:'upload',bucket,path:filePath,size:file&&file.size,options});s.uploads=s.uploads||[];s.uploads.push({bucket,path:filePath,size:file&&file.size});persist();return {data:{path:filePath},error:null};},async createSignedUrl(filePath,seconds){log({kind:'signed-url',bucket,path:filePath,seconds});return {data:{signedUrl:'https://files.qa.test/signed-cv.pdf'},error:null};}};}};\n async function rpc(name,args){log({kind:'rpc',name,args});\n  if(name==='submit_candidate_application_public'){const data=args.p_data||{},row={id:'qa-applicant-'+((s.applicants||[]).length+1),full_name:data.nama||'Kandidat QA',nik:data.nik||'',position:data.posisi||'CNC',stage:'application_submitted',application_data:data,cv_path:args.p_cv_path,ktp_path:data.ktp_path,created_at:new Date().toISOString(),background_check_status:'pending',disc_invited:false,disc_submissions:[],employees:[]};s.applicants=s.applicants||[];s.applicants.push(row);persist();return {data:{application_id:row.id,full_name:row.full_name,stage:row.stage},error:null};}\n  if(name==='get_disc_candidate_by_nik'){const row=(s.applicants||[]).find(item=>item.nik===String(args.p_nik||'').replace(/\\D/g,''));if(!row||!['application_submitted','disc_completed'].includes(row.stage))return {data:null,error:null};return {data:{full_name:row.full_name,position:row.position,stage:row.stage,disc_completed:!!(row.disc_submissions||[]).length},error:null};}\n  if(name==='submit_disc_answers_by_nik'){const row=(s.applicants||[]).find(item=>item.nik===String(args.p_nik||'').replace(/\\D/g,''));if(row){row.stage='disc_completed';row.disc_submissions=[{id:'qa-disc-e2e',answers:args.p_answers,completed_at:new Date().toISOString()}];}persist();return {data:{ok:true,stage:'disc_completed'},error:null};}\n  if(name==='is_portal_admin')return {data:true,error:null};\n  if(name==='convert_applicant_to_employee'){s.employees=s.employees||[];const e={id:'qa-employee',applicant_id:args.p_applicant_id,employee_no:args.p_employee_no,department:args.p_department||'',position:args.p_position||'',employment_status:args.p_employment_status||'Aktif',join_date:args.p_join_date,notes:args.p_notes||'',created_at:new Date().toISOString()};s.employees.push(e);const a=(s.applicants||[]).find(x=>x.id===args.p_applicant_id);if(a)a.employees=[{id:e.id}];persist();return {data:{ok:true,employee_id:e.id},error:null};}\n  if(name==='activate_print_template')return {data:{ok:true},error:null};return {data:null,error:null};}\n return {auth,storage,rpc,from:makeQuery};}";
const XLSX_STUB="export const utils={book_new:()=>({sheets:[]}),json_to_sheet:rows=>({rows}),book_append_sheet:(book,sheet,name)=>book.sheets.push({sheet,name})};\nexport function writeFile(book,name){globalThis.__cp04qa.events.push({kind:'xlsx-export',name,sheets:book.sheets.length});const url=URL.createObjectURL(new Blob(['CP04 QA XLSX']));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}";
function freshState(overrides={}){
 const value={events:[],uploads:[],positions:['Spray','Las','CNC','Spindel Kayu','Maintenance','OP. Produksi'],ocrEnabled:false,
  stage1:[{id:'qa-stage1-1',full_name:'Kandidat Tahap Satu QA',position:'Spray',city:'Pasuruan',district:'Bangil',whatsapp:'628123456789',experience_details:{sprayType:'Spray Booth',company:'PT Contoh'},status:'received',cv_path:'stage1-cv/qa/cv.pdf',created_at:new Date().toISOString()}],
  applicants:[{id:'qa-applicant-1',full_name:'Kandidat Portal QA',nik:'3517091201900001',position:'CNC',stage:'application_submitted',application_data:{nama:'Kandidat Portal QA',nik:'3517091201900001',posisi:'CNC',telepon:'628123456789',email:'qa@example.test',tempat_lahir:'Jombang',umur:36,alamat_kota_nama:'Jombang',setuju:true},cv_path:'candidate-cv/qa/cv.pdf',ktp_path:'candidate-identity/qa/ktp.jpg',created_at:new Date().toISOString(),background_check_status:'pending',disc_invited:false,disc_submissions:[],employees:[]}],
  employees:[],templates:[]};
 return Object.assign(value,overrides);
}
async function installMocks(context,state){
 await context.addInitScript(value=>{const key='__cp04qa_state_v1';if(!globalThis.__cp04qa){let saved=null;try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}globalThis.__cp04qa=saved||structuredClone(value);}const persist=()=>{try{sessionStorage.setItem(key,JSON.stringify(globalThis.__cp04qa));}catch{}};Object.defineProperty(globalThis,'__cp04qaPersist',{value:persist,configurable:true});persist();},state);
 await context.route('**/@supabase/supabase-js@2*',route=>route.fulfill({status:200,contentType:'application/javascript',body:SUPABASE_STUB}));
 await context.route('https://www.emsifa.com/api-wilayah-indonesia/v2/**',route=>{
  const p=new URL(route.request().url()).pathname;let data=[];
  if(p.endsWith('/provinces.json'))data=[{id:'35',name:'JAWA TIMUR'}];
  else if(p.endsWith('/regencies/35.json'))data=[{id:'3517',name:'Kabupaten Jombang'}];
  else if(p.endsWith('/districts/3517.json'))data=[{id:'351710',name:'Peterongan'}];
  else if(p.endsWith('/villages/351710.json'))data=[{id:'3517102001',name:'Ngronggo',postal_code:'61481'}];
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});
 });
 await context.route('**/functions/v1/admin-login*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,display_name:'QA Admin',session:{access_token:'qa-access',refresh_token:'qa-refresh'}})}));
 await context.route('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm',route=>route.fulfill({status:200,contentType:'application/javascript',body:XLSX_STUB}));
 await context.route('https://wa.me/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>WhatsApp QA stub</title>'}));
 await context.route('https://files.qa.test/**',route=>route.fulfill({status:200,contentType:'application/pdf',body:'%PDF-1.4 QA'}));
}
async function newTestPage(browser,state,viewport={width:390,height:844}){
 const context=await browser.newContext({viewport,acceptDownloads:true});
 await installMocks(context,state);const page=await context.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 return {context,page,errors};
}
async function runCase(name,fn){
 const started=Date.now();
 try{const detail=await fn();results.push({name,status:'PASS',ms:Date.now()-started,detail:detail||{}});console.log('PASS '+name);}
 catch(error){results.push({name,status:'FAIL',ms:Date.now()-started,error:error.stack||error.message});console.error('FAIL '+name+': '+error.message);throw error;}
}
async function fillRequired(page,selector){
 const scope=page.locator(selector),fields=scope.locator('input:visible,select:visible,textarea:visible'),count=await fields.count(),radios=new Set();
 for(let i=0;i<count;i++){
  const field=fields.nth(i);if(!(await field.isVisible())||(await field.getAttribute('required'))===null)continue;
  const type=(await field.getAttribute('type')||'').toLowerCase(),tag=await field.evaluate(el=>el.tagName.toLowerCase()),name=await field.getAttribute('name')||'';
  if(type==='file')continue;
  if(type==='radio'){if(!radios.has(name)){radios.add(name);await scope.locator('input[type="radio"][name="'+name+'"]').first().check();}continue;}
  if(type==='checkbox'){await field.check();continue;}
  if(tag==='select'){const v=await field.locator('option').evaluateAll(opts=>{const o=opts.find(x=>x.value&&!x.disabled);return o?o.value:'';});if(v)await field.selectOption(v);continue;}
  if(type==='date')await field.fill('1990-01-12');
  else if(type==='number')await field.fill('30');
  else if(type==='email')await field.fill('qa.candidate@example.test');
  else if(type==='tel')await field.fill('081234567890');
  else if(name==='nik')await field.fill('3517091201900001');
  else await field.fill('Data Kandidat QA');
 }
}
async function selectAddress(page){
 await page.waitForFunction(()=>document.querySelector('[name="alamat_provinsi"] option[data-region-id]'));
 await page.locator('[name="alamat_provinsi"]').selectOption('JAWA TIMUR');
 await page.waitForFunction(()=>document.querySelector('[name="alamat_kota_nama"] option[data-region-id]'));
 await page.locator('[name="alamat_kota_nama"]').selectOption('Jombang');
 await page.waitForFunction(()=>document.querySelector('[name="alamat_kecamatan"] option[data-region-id]'));
 await page.locator('[name="alamat_kecamatan"]').selectOption('Peterongan');
 await page.waitForFunction(()=>document.querySelector('[name="alamat_desa"] option[data-region-id]'));
 await page.locator('[name="alamat_desa"]').selectOption('Ngronggo');
}
async function auditLayout(page,name,screenshot){
 const metrics=await page.evaluate(()=>{
  const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
  const fields=[...document.querySelectorAll('input:not([type="hidden"]),select,textarea')].filter(visible);
  const unlabelled=fields.filter(el=>!el.labels?.length&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')).map(el=>el.name||el.id||el.tagName);
  const small=[...document.querySelectorAll('button,a.btn,[role="button"]')].filter(visible).map(el=>({text:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,30),w:Math.round(el.getBoundingClientRect().width),h:Math.round(el.getBoundingClientRect().height)})).filter(x=>x.w<40||x.h<40);
  return {viewportWidth:innerWidth,documentWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),horizontalOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+2,unlabelled,smallButtons:small};
 });
 assert.equal(metrics.horizontalOverflow,false,name+' horizontal overflow '+JSON.stringify(metrics));
 assert.equal(metrics.unlabelled.length,0,name+' unlabeled fields '+JSON.stringify(metrics.unlabelled));
 assert.equal(metrics.smallButtons.length,0,name+' small buttons '+JSON.stringify(metrics.smallButtons));
 await page.screenshot({path:path.join(ARTIFACTS,screenshot),fullPage:true});
 return metrics;
}
async function stage1Variant(browser,position){
 const test=await newTestPage(browser,freshState());const page=test.page;
 await page.goto(BASE+'/apply/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#applicationForm');
 await page.waitForFunction(()=>document.documentElement.dataset.applyReady==='true');
 await page.waitForFunction(()=>document.querySelector('#position')?.options.length>1);
 await page.locator('#position').selectOption({label:position});
 await page.locator('#name').fill('Kandidat '+position+' QA');
 await page.locator('#city').selectOption('Pasuruan');await page.waitForFunction(()=>[...(document.querySelector('#district')?.options||[])].some(option=>option.value==='Bangil'),{timeout:5000});await page.locator('#district').selectOption('Bangil');
 await page.locator('#whatsapp').fill('081234567890');await page.locator('#nextBtn').click();
 await fillRequired(page,'.step[data-title="Pengalaman kerja"]');await page.locator('#nextBtn').click();
 assert.equal(await page.locator('#confirm').isVisible(),true,'Apply wizard must reach confirm for '+position);
 await page.locator('#cv').setInputFiles({name:'cv-qa.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 CP04 QA')});
 await page.locator('#confirm').check();await page.waitForSelector('#resultArea:not(.hidden)',{timeout:15000});
 assert.match(await page.locator('#resultTitle').innerText(),/lamaran tahap 1 berhasil dikirim/i);
 assert.equal(await page.locator('#waLink').isVisible(),true,'Stage 1 must show its HR WhatsApp hand-off');
 const waPopupPromise=page.waitForEvent('popup');await page.locator('#waLink').click();const waPopup=await waPopupPromise;
 await waPopup.waitForURL(url=>url.hostname==='wa.me'&&url.pathname==='/628133193313',{timeout:15000});
 const waText=new URL(waPopup.url()).searchParams.get('text')||'';
 assert.match(waText,/Kandidat /i);assert.match(waText,new RegExp(position.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
 assert.match(waText,/WhatsApp kandidat: 081234567890/i);assert.match(waText,/Pengalaman kerja/i);
 assert.match(waText,/Tautan CV/i);assert.match(waText,/https:\/\/files\.qa\.test\/signed-cv\.pdf/i);
 await waPopup.close();
 const state=await page.evaluate(()=>globalThis.__cp04qa);
 assert.ok(state.events.some(e=>e.kind==='table'&&e.table==='candidate_stage1_applications'&&e.op==='insert'));
 assert.ok(state.uploads.some(u=>u.bucket==='candidate-stage1-cv'));
 assert.ok(state.events.some(e=>e.kind==='signed-url'&&e.bucket==='candidate-stage1-cv'&&e.seconds===604800));
 assert.deepEqual(test.errors,[]);
 await page.screenshot({path:path.join(ARTIFACTS,'apply-'+position.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.png'),fullPage:true});
 await test.context.close();return {position,inserted:true,cvUploaded:true};
}
async function candidateFormDirect(browser){
 const test=await newTestPage(browser,freshState());const page=test.page;
 await page.goto(BASE+'/form/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#application-form',{timeout:20000});
 assert.equal(new URL(page.url()).searchParams.has('k'),false,'Form must be accessible without an invitation token');
 const order=await page.evaluate(()=>{const f=document.querySelector('#application-form');const n=[...f.querySelectorAll('[name]')].map(el=>el.name);return {position:n.indexOf('posisi'),phone:n.indexOf('telepon'),email:n.indexOf('email'),height:n.indexOf('tinggi'),weight:n.indexOf('berat'),address:n.indexOf('alamat_rt')};});
 assert.ok(order.position>order.address,'Position field must appear after KTP address fields on mobile');
 assert.ok(order.phone>order.address&&order.email>order.address&&order.height>order.address&&order.weight>order.address,'All non-KTP fields must follow the KTP data');
 await selectAddress(page);
 for(let step=0;step<5;step++){
  assert.equal(await page.locator('[data-form-step="'+step+'"]').evaluate(el=>!el.hidden),true);
  await fillRequired(page,'[data-form-step="'+step+'"]');
  if(step===0){
   await page.locator('[name="alamat_rt"]').fill('001');await page.locator('[name="alamat_rw"]').fill('002');
   await page.locator('[name="nik"]').fill('12345');
   await page.locator('[name="tanggal_lahir"]').fill('');
   await page.locator('#wizard-next').click();
   assert.equal(await page.locator('[data-form-step="0"]').evaluate(el=>!el.hidden),true,'Invalid fields must keep the candidate on the current step');
   assert.equal(await page.locator('[name="nik"]').getAttribute('aria-invalid'),'true');
   assert.equal(await page.locator('[name="nik"]').evaluate(el=>el.closest('.form-field').classList.contains('is-invalid')),true,'Invalid NIK must be visually highlighted');
   assert.ok(await page.locator('.field-validation-error').count()>=2,'All invalid fields in the step must be marked together');
   assert.match(await page.locator('.field-validation-error').first().innerText(),/16 digit/i);
   await page.locator('[name="nik"]').fill('3517091201900001');
   await page.locator('[name="tanggal_lahir"]').fill('1990-01-12');
  }
  if(step===2){
   await page.locator('[name="kerja_count"]').selectOption('1');
   await page.waitForSelector('[name="kerja1_jabatan"]');
   await page.locator('[name="kerja1_jabatan"]').fill('Operator QA');
  }
  if(step===1){
   await page.locator('[name="saudara_count"]').selectOption('1');
   await page.waitForSelector('[name="saudara2_nama"]');
   assert.equal(await page.locator('[name="saudara1_nama"]').count(),0,'Applicant must not be shown as a sibling input');
   assert.doesNotMatch(await page.locator('#siblings-rows').innerText(),/Anda/);
   await page.locator('[name="saudara2_nama"]').fill('Saudara QA');
  }
  await auditLayout(page,'form-step-'+step+'-mobile','form-step-'+step+'.png');
  if(step<4){await page.locator('#wizard-next').click();await page.waitForFunction(x=>document.querySelector('.form-step:not([hidden])')?.dataset.formStep===String(x),step+1,{timeout:5000});}
 }
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;const x=c.getContext('2d');x.fillStyle='#d7c2a1';x.fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#ktp-photo-file').setInputFiles({name:'ktp-qa.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>document.querySelector('#ktp-upload-state')?.textContent.includes('OCR tidak dijalankan'));
 await page.locator('#cv-file').setInputFiles({name:'cv-qa.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 CP04 QA')});
 await page.waitForFunction(()=>document.querySelector('#cv-upload-state')?.textContent.includes('CV tersimpan'),{timeout:15000});
 await page.locator('#setuju').check();await page.locator('#wizard-next').click();
 await page.waitForFunction(()=>document.querySelector('#candidate-app')?.innerText.includes('Lamaran terkirim'),{timeout:20000});
 await page.waitForFunction(()=>document.querySelector('a[href="../disc/"]')?.textContent.includes('Lanjut ke Tes DISC'));
 assert.equal(await page.locator('a[href="../disc/"]').innerText(),'Lanjut ke Tes DISC');
 const state=await page.evaluate(()=>globalThis.__cp04qa);
 assert.ok(state.uploads.some(u=>u.bucket==='candidate-files'&&/^candidate-cv\/[0-9a-f-]{36}\/cv\.pdf$/i.test(u.path)));
 assert.ok(state.uploads.some(u=>u.bucket==='candidate-identity'&&/^candidate-identity\/[0-9a-f-]{36}\/ktp\.jpg$/i.test(u.path)));
 const event=state.events.find(e=>e.kind==='rpc'&&e.name==='submit_candidate_application_public');assert.ok(event);
 assert.equal(event.args.p_data.nik,'3517091201900001');
 assert.equal(event.args.p_data.saudara1_nama,'Data Kandidat QA','Applicant should be appended automatically as the first family record');
 assert.equal(event.args.p_data.saudara2_nama,'Saudara QA','Sibling input should be stored after the applicant record');
 assert.equal(event.args.p_data.saudara1_pendidikan,event.args.p_data.pendidikan_terakhir,'Applicant education should be appended automatically');
 assert.equal(event.args.p_data.saudara1_pekerjaan,'Operator QA','Applicant occupation should be appended from the latest job entry');
 assert.equal('access_token' in state.applicants[0],false,'New candidate row must not have an access token');
 assert.ok(await page.evaluate(()=>!!sessionStorage.getItem('portal_candidate_nik_cache_v1')),'NIK should be cached for the same tab');
 assert.deepEqual(test.errors,[]);
 await page.screenshot({path:path.join(ARTIFACTS,'form-submitted.png'),fullPage:true});
 await test.context.close();return {directAccess:true,steps:5,ktpAndCvUploaded:true,nikBaseline:true};
}
async function discRequiresNIK(browser){
 const test=await newTestPage(browser,freshState());const page=test.page;
 await page.goto(BASE+'/disc/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#disc-identity-form');
 assert.doesNotMatch(await page.locator('#disc-app').innerText(),/Masukkan NIK 16 angka/i,'DISC identity should not expose the long instruction copy');
 assert.equal(await page.locator('#disc-nik').count(),1,'NIK field must remain available');
 assert.equal(await page.locator('.disc-option').count(),0);
 await page.locator('#disc-nik').fill('0000000000000000');await page.locator('#disc-identity-submit').click();
 await page.waitForFunction(()=>document.querySelector('#disc-identity-error')?.textContent.includes('tidak ditemukan'));
 assert.equal(await page.locator('.disc-option').count(),0);
 assert.deepEqual(test.errors,[]);await page.screenshot({path:path.join(ARTIFACTS,'disc-locked-by-nik.png'),fullPage:true});
 await test.context.close();return {noTokenGate:true,nikRequired:true,unknownNikBlocked:true};
}
async function discByNIK(browser){
 const applicant={id:'qa-disc-candidate',full_name:'Kandidat DISC QA',nik:'3517091201900001',position:'CNC',stage:'application_submitted',application_data:{},background_check_status:'pending',disc_invited:false,disc_submissions:[],employees:[]};
 const test=await newTestPage(browser,freshState({applicants:[applicant]}));const page=test.page;
 await page.goto(BASE+'/disc/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#disc-identity-form');
 await page.locator('#disc-nik').fill(applicant.nik);await page.locator('#disc-identity-submit').click();await page.waitForSelector('.disc-option');
 await auditLayout(page,'disc-question-mobile','disc-mobile.png');
 assert.match(await page.locator('.disc-pick').first().getAttribute('aria-label'),/Paling menggambarkan:/);
 for(let i=0;i<24;i++){
  await page.locator('.disc-option').nth(0).locator('[data-kind="most"]').click();
  await page.locator('.disc-option').nth(1).locator('[data-kind="least"]').click();
  await page.locator('#disc-next').click();
 }
 await page.waitForFunction(()=>document.querySelector('#disc-app')?.innerText.includes('Tes DISC selesai'),{timeout:20000});
 const state=await page.evaluate(()=>globalThis.__cp04qa);
 const event=state.events.find(e=>e.kind==='rpc'&&e.name==='submit_disc_answers_by_nik');
 assert.ok(event);assert.equal(event.args.p_nik,applicant.nik);assert.equal(event.args.p_answers.length,24);
 assert.equal(state.applicants[0].stage,'disc_completed');
 assert.deepEqual(test.errors,[]);await page.screenshot({path:path.join(ARTIFACTS,'disc-completed.png'),fullPage:true});
 await test.context.close();return {matchedByNIK:true,questions:24,answersSaved:true};
}
async function adminDashboard(browser){
 const test=await newTestPage(browser,freshState(),{width:1440,height:1000});const page=test.page;
 await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#login-form');
 await page.locator('#login-user').fill('qa.admin');await page.locator('#login-pin').fill('123456');
 await page.locator('#login-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#admin-shell')&&!document.querySelector('#admin-shell').classList.contains('hidden'),{timeout:15000});
 await page.locator('[data-view="stage1"]').click();await page.waitForSelector('[data-stage1-wa]');
 assert.match(await page.locator('#admin-content').innerText(),/SPRAY TYPE/i);
 const popupPromise=page.waitForEvent('popup');await page.locator('[data-stage1-wa]').click();const popup=await popupPromise;
 await popup.waitForURL(url=>url.hostname==='wa.me',{timeout:15000});
 const text=new URL(popup.url()).searchParams.get('text')||'';
 assert.match(text,/https:\/\/hrmbm\.github\.io\/coba\/form\//i);
 assert.equal(new URL(text.match(/https:\/\/hrmbm\.github\.io\/coba\/form\/[^\\s]*/i)[0]).searchParams.has('k'),false);
 const stage1State=await page.evaluate(()=>globalThis.__cp04qa.stage1[0]);
 assert.equal(stage1State.status,'received');assert.equal('invite_token' in stage1State,false);
 await popup.close();
 await page.locator('[data-stage1-cv]').click();await page.waitForSelector('a.icon-btn[href*="signed-cv.pdf"]');
 await page.locator('[data-stage1-status]').click();await page.waitForFunction(()=>globalThis.__cp04qa.stage1[0].status==='reviewed');
 await page.locator('[data-view="stage2"]').click();await page.waitForSelector('[data-bg-check]');
 const stage2Text=await page.locator('#admin-content').innerText();
 assert.match(stage2Text,/EMAIL/i);assert.match(stage2Text,/WHATSAPP \/ TELEPON/i);
 assert.match(stage2Text,/PERNYATAAN KEBENARAN DATA/i);
 assert.match(stage2Text,/FOTO KTP/i);assert.match(stage2Text,/\bCV\b/i);
 assert.equal(await page.locator('[data-stage2-ktp]').count(),1);
 assert.equal(await page.locator('[data-stage2-cv]').count(),1);
 await page.locator('[data-stage2-ktp]').click();await page.waitForSelector('a.icon-btn[href*="signed-cv.pdf"]');
 await page.locator('[data-stage2-cv]').click();await page.waitForFunction(()=>document.querySelectorAll('a.icon-btn[href*="signed-cv.pdf"]').length>=2);
 const documentEvents=await page.evaluate(()=>globalThis.__cp04qa.events.filter(e=>e.kind==='signed-url').map(e=>({bucket:e.bucket,path:e.path,seconds:e.seconds})));
 assert.ok(documentEvents.some(e=>e.bucket==='candidate-identity'&&e.seconds===300));
 assert.ok(documentEvents.some(e=>e.bucket==='candidate-files'&&e.seconds===300));
 await page.locator('#new-position').fill('Pekerja QA');await page.locator('#add-position').click();
 await page.waitForFunction(()=>globalThis.__cp04qa.positions.includes('Pekerja QA'));
 await page.locator('[data-position-index="0"]').fill('Spray - Edited');await page.locator('#save-positions').click();
 await page.waitForFunction(()=>globalThis.__cp04qa.positions[0]==='Spray - Edited');
 await page.locator('[data-position-delete="6"]').click();await page.waitForFunction(()=>!globalThis.__cp04qa.positions.includes('Pekerja QA'));
 let popupSeen=false;page.on('popup',()=>{popupSeen=true;});
 await page.locator('[data-bg-value]').selectOption('passed');await page.locator('[data-bg-check]').click();
 await page.waitForFunction(()=>globalThis.__cp04qa.applicants[0].disc_invited===true);
 await page.waitForTimeout(500);assert.equal(popupSeen,false,'Stage 2 must not open WhatsApp automatically');
 await page.evaluate(()=>{
  const a=globalThis.__cp04qa.applicants[0];a.stage='disc_completed';
  a.disc_submissions=[{id:'qa-disc-result',answers:Array.from({length:24},()=>({most:0,least:1}))}];
 });
 await page.locator('[data-view="stage3"]').click();await page.waitForSelector('.disc-mini-graph');
 assert.match(await page.locator('#admin-content').innerText(),/GRAFIK DISC/i);
 assert.match(await page.locator('#admin-content').innerText(),/NAMA KEPRIBADIAN/i);
 assert.deepEqual(test.errors,[]);await page.screenshot({path:path.join(ARTIFACTS,'admin-stage3-disc-graph.png'),fullPage:true});
 await test.context.close();
 return {stage1AllFields:true,manualWhatsAppOnly:true,stage2AllFields:true,positionAddEditDelete:true,noAutomaticStage2WA:true,stage3Graph:true};
}
async function endToEndCandidateFlow(browser){
 const test=await newTestPage(browser,freshState({stage1:[],applicants:[],employees:[]}),{width:390,height:844});const page=test.page;
 await page.goto(BASE+'/apply/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#applicationForm');
 await page.waitForFunction(()=>document.documentElement.dataset.applyReady==='true');
 await page.waitForFunction(()=>document.querySelector('#position')?.options.length>1);
 await page.locator('#position').selectOption({label:'CNC'});await page.locator('#name').fill('Kandidat E2E QA');
 await page.locator('#city').selectOption('Pasuruan');await page.waitForFunction(()=>[...(document.querySelector('#district')?.options||[])].some(option=>option.value==='Bangil'),{timeout:5000});await page.locator('#district').selectOption('Bangil');await page.locator('#whatsapp').fill('081234567890');
 await page.locator('#nextBtn').click();
 await fillRequired(page,'.step[data-title="Pengalaman kerja"]');
 const activeStage1Step=await page.locator('#stepLabel').innerText();
 assert.ok(['Pengalaman kerja','CV & konfirmasi'].includes(activeStage1Step),'Stage 1 should be on the experience or CV step, got '+activeStage1Step);
 if(await page.locator('#nextBtn').isVisible())await page.locator('#nextBtn').click();
 await page.locator('#submitBtn').waitFor({state:'visible'});
 await page.locator('#cv').setInputFiles({name:'cv-e2e.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 CP04 E2E')});
 await page.locator('#confirm').check();await page.waitForSelector('#resultArea:not(.hidden)');
 let state=await page.evaluate(()=>globalThis.__cp04qa);assert.equal(state.stage1.length,1);
 await page.setViewportSize({width:1440,height:960});await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#login-form');await page.locator('#login-user').fill('qa.admin');await page.locator('#login-pin').fill('123456');
 await page.locator('#login-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#admin-shell')&&!document.querySelector('#admin-shell').classList.contains('hidden'));
 await page.locator('[data-view="stage1"]').click();await page.waitForSelector('[data-stage1-wa]');
 const popupPromise=page.waitForEvent('popup');await page.locator('[data-stage1-wa]').click();const popup=await popupPromise;
 await popup.waitForURL(url=>url.hostname==='wa.me');const msg=new URL(popup.url()).searchParams.get('text')||'';
 assert.match(msg,/\/form\//);assert.doesNotMatch(msg,/\\?k=/i);await popup.close();
 await page.setViewportSize({width:390,height:844});await page.goto(BASE+'/form/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#application-form');
 await selectAddress(page);
 for(let step=0;step<5;step++){
  await fillRequired(page,'[data-form-step="'+step+'"]');
  if(step===0){await page.locator('[name="alamat_rt"]').fill('001');await page.locator('[name="alamat_rw"]').fill('002');}
  if(step<4){await page.locator('#wizard-next').click();await page.waitForFunction(x=>document.querySelector('.form-step:not([hidden])')?.dataset.formStep===String(x),step+1);}
 }
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;const x=c.getContext('2d');x.fillStyle='#d7c2a1';x.fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#ktp-photo-file').setInputFiles({name:'ktp-e2e.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>document.querySelector('#ktp-upload-state')?.textContent.includes('OCR tidak dijalankan'));
 await page.locator('#cv-file').setInputFiles({name:'cv-e2e.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 CP04 E2E')});
 await page.waitForFunction(()=>document.querySelector('#cv-upload-state')?.textContent.includes('CV tersimpan'));
 await page.locator('#setuju').check();await page.locator('#wizard-next').click();
 await page.waitForFunction(()=>document.querySelector('#candidate-app')?.innerText.includes('Lamaran terkirim'),{timeout:20000});
 state=await page.evaluate(()=>globalThis.__cp04qa);assert.equal(state.applicants.length,1);assert.equal(state.applicants[0].nik,'3517091201900001');
 assert.equal('access_token' in state.applicants[0],false);
 await page.setViewportSize({width:1440,height:960});await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#login-form');await page.locator('#login-user').fill('qa.admin');await page.locator('#login-pin').fill('123456');
 await page.locator('#login-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#admin-shell')&&!document.querySelector('#admin-shell').classList.contains('hidden'));
 await page.locator('[data-view="stage2"]').click();await page.waitForSelector('[data-bg-check]');
 let popupSeen=false;page.on('popup',()=>{popupSeen=true;});
 await page.waitForTimeout(200);assert.equal(globalThis.__cp04qa.applicants[0].background_check_status,'pending');
 assert.equal(globalThis.__cp04qa.applicants[0].disc_invited,false,'DISC must not require the HR invitation flag');
 assert.equal(popupSeen,false);
 await page.setViewportSize({width:390,height:844});await page.goto(BASE+'/disc/',{waitUntil:'domcontentloaded'});await page.waitForSelector('.disc-option');
 await auditLayout(page,'e2e-disc-mobile','e2e-disc-mobile.png');
 for(let q=0;q<24;q++){await page.locator('.disc-option').nth(0).locator('[data-kind="most"]').click();await page.locator('.disc-option').nth(1).locator('[data-kind="least"]').click();await page.locator('#disc-next').click();}
 await page.waitForFunction(()=>document.querySelector('#disc-app')?.innerText.includes('Tes DISC selesai'),{timeout:20000});
 state=await page.evaluate(()=>globalThis.__cp04qa);const ev=state.events.find(e=>e.kind==='rpc'&&e.name==='submit_disc_answers_by_nik');
 assert.ok(ev);assert.equal(ev.args.p_nik,'3517091201900001');assert.equal(state.applicants[0].stage,'disc_completed');
 const nikCache=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('portal_candidate_nik_cache_v1')||'null'));
 assert.equal(nikCache?.nik,'3517091201900001','NIK cache must remain available for a near-term Stage 4 / SPM check');
 assert.deepEqual(test.errors,[]);await page.screenshot({path:path.join(ARTIFACTS,'e2e-disc-completed.png'),fullPage:true});
 await test.context.close();return {flow:'/apply -> manual WA -> direct /form -> NIK-matched /disc',tokenFree:true,stages:3,discAnswers:24};
}
async function productionRoutes(browser){
 const context=await browser.newContext();const page=await context.newPage();const checked=[];
 const source=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8'),adminAsset=source.match(/assets\/js\/admin\.js\?v=([^"' ]+)/)?.[1];
 const discSource=fs.readFileSync(path.join(process.cwd(),'disc/index.html'),'utf8'),discAsset=discSource.match(/disc\.js\?v=([^"' ]+)/)?.[1];
 const applySource=fs.readFileSync(path.join(process.cwd(),'apply/index.html'),'utf8'),applyBuild=applySource.match(/<meta name="pk-build" content="([^"]+)"/)?.[1];
 assert.ok(adminAsset&&discAsset&&applyBuild);
 let live=false,applyLive=false;
 for(let i=0;i<60;i++){
  const response=await page.request.get(BASE+'/?cp04='+Date.now()+'-'+i,{timeout:15000,headers:{'Cache-Control':'no-cache'}}).catch(()=>null);
  if(response&&response.status()===200&&(await response.text()).includes('admin.js?v='+adminAsset)){live=true;break;}
  await page.waitForTimeout(5000);
 }
 assert.ok(live,'GitHub Pages did not publish admin asset '+adminAsset);
 for(let i=0;i<60;i++){
  const response=await page.request.get(BASE+'/apply/?cp04='+Date.now()+'-'+i,{timeout:15000,headers:{'Cache-Control':'no-cache'}}).catch(()=>null);
  if(response&&response.status()===200&&(await response.text()).includes('pk-build" content="'+applyBuild+'"')){applyLive=true;break;}
  await page.waitForTimeout(5000);
 }
 assert.ok(applyLive,'GitHub Pages has not published /apply build '+applyBuild);
 for(const p of ['/','/apply/','/form/','/disc/','/spm/']){
  const res=await page.request.get(BASE+p,{timeout:15000});assert.equal(res.status(),200,'Route '+p);
  const body=await res.text();assert.ok(body.length>100);checked.push({route:p,status:res.status(),bytes:body.length});
 }
 await context.close();return {routes:checked,assetVersion:adminAsset};
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  await runCase('production-pages-routes',()=>productionRoutes(browser));
  await runCase('stage1-all-six-position-forms',async()=>{const items=[];for(const p of ['Spray','Las','CNC','Spindel Kayu','Maintenance','OP. Produksi'])items.push(await stage1Variant(browser,p));return {positions:items.length};});
  await runCase('form-direct-access-and-ktp-first-layout',()=>candidateFormDirect(browser));
  await runCase('disc-nik-identity-and-unknown-nik-block',()=>discRequiresNIK(browser));
  await runCase('disc-24-answers-by-nik',()=>discByNIK(browser));
  await runCase('admin-stage-fields-roles-and-graph',()=>adminDashboard(browser));
  await runCase('end-to-end-apply-to-disc-without-tokens',()=>endToEndCandidateFlow(browser));
 }finally{
  await browser.close();fs.writeFileSync(path.join(ARTIFACTS,'cp04-browser-results.json'),JSON.stringify(results,null,2));
 }
 const failed=results.filter(item=>item.status!=='PASS');
 console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,results},null,2));
 if(failed.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});