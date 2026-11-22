import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
const engineName=process.env.QA_ENGINE||'chromium';
const engine={chromium,firefox,webkit}[engineName];
const widths=[['iPhone-small',320,568],['iPhone-Pro',402,874],['Fold-open',884,1104],['iPad',820,1180],['Desktop',1440,900]];
const rows=[];
function log(dev,name,ok,msg=''){
  rows.push({engine:engineName,device:dev,check:name,status:ok?'PASS':'FAIL',detail:String(msg).slice(0,1200)});
  console.log((ok?'PASS':'FAIL')+' '+dev+' '+name+' '+msg);
}
async function check(dev,name,fn){
  try{await fn();log(dev,name,true)}catch(e){log(dev,name,false,e.message)}
}
async function attr(el,name,want){let got=await el.getAttribute(name);if(got!==want)throw Error(name+' expected '+want+' got '+got)}
const browser=await engine.launch({headless:true});
for(const [dev,width,height] of widths){
 const ctx=await browser.newContext({viewport:{width,height},hasTouch:dev!=='Desktop',isMobile:dev!=='Desktop'&&engineName!=='firefox'});
 const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await check(dev,'home-load',async()=>{
  const r=await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:20000});
  if(!r||r.status()!==200)throw Error('HTTP '+r?.status());
  await page.locator('.dz-sr-skip').waitFor({timeout:8000});
 });
 await check(dev,'skip-link',async()=>{
  await page.keyboard.press('Tab');
  let current=await page.evaluate(()=>document.activeElement.id);
  if(current!=='dz-sr-skip')throw Error('first Tab focus was '+current);
  await page.keyboard.press('Enter');
  current=await page.evaluate(()=>document.activeElement.tagName);
  if(current!=='MAIN')throw Error('skip focus was '+current);
 });
 await check(dev,'language-select',async()=>{
  await page.locator('#enBtn').click();
  await attr(page.locator('#enBtn'),'aria-pressed','true');
  await attr(page.locator('html'),'lang','en');
  await page.locator('#koBtn').click();
  await attr(page.locator('#koBtn'),'aria-pressed','true');
 });
 await check(dev,'works-tabs',async()=>{
  await page.locator('nav.primary [data-target="works"]').click();
  await page.locator('#works .tabs .tab.active').waitFor({timeout:3000});
  let buttons=page.locator('#works .tabs .tab');
  await attr(buttons.nth(1),'role','tab');
  await buttons.nth(1).focus();
  await page.keyboard.press('ArrowRight');
  await attr(buttons.nth(2),'aria-selected','true');
  await attr(page.locator('#panel-human'),'role','tabpanel');
  await page.keyboard.press('Home');
  await attr(buttons.nth(0),'aria-selected','true');
 });
 await check(dev,'bio-dialog-focus',async()=>{
  await page.locator('#tab-bio').click();
  await page.locator('#bio-modal').waitFor({state:'visible',timeout:7000});
  const inCard=await page.evaluate(()=>document.querySelector('#bio-modal .bio-card').contains(document.activeElement));
  if(!inCard)throw Error('focus not moved to bio dialog');
  await page.locator('#bio-modal .bio-close').click();
  await page.locator('#bio-modal').waitFor({state:'hidden',timeout:7000});
  await page.waitForTimeout(120);
  let id=await page.evaluate(()=>document.activeElement.id);
  if(id!=='tab-bio')throw Error('focus not restored to opener: '+id);
 });
 await check(dev,'reports-settings',async()=>{
  await page.locator('nav.primary [data-target="reports"]').click();
  await page.locator('#reportsDisplaySettings').click();
  await attr(page.locator('#reportsDisplaySettings'),'aria-expanded','true');
  await page.locator('#reportsDisplayPanel [data-dcar-size="4"]').click();
  await attr(page.locator('#reports'),'data-dcar-scale','4');
  await page.locator('#reportsDisplayReset').click();
  await attr(page.locator('#reports'),'data-dcar-scale','1');
  await page.locator('#reportsDisplayClose').click();
  await attr(page.locator('#reportsDisplaySettings'),'aria-expanded','false');
 });
 await check(dev,'report-filter-state',async()=>{
  await page.locator('#reports .r-tab[data-r="theory"]').click();
  await attr(page.locator('#reports .r-tab[data-r="theory"]'),'aria-pressed','true');
  await page.locator('#reportsToggle').click();
  await attr(page.locator('#reportsToggle'),'aria-expanded','true');
 });
 await check(dev,'artwork-card-keyboard-viewer',async()=>{
  await page.locator('nav.primary [data-target="works"]').click();
  await page.locator('#works .tabs [data-panel="pray"]').click();
  const first=page.locator('#works #panel-pray .w-card').first();
  await first.waitFor({state:'visible',timeout:12000});
  await attr(first,'role','button');
  await first.focus();
  await page.keyboard.press('Enter');
  await page.locator('#lf-lightbox.active').waitFor({timeout:8000});
  await page.waitForTimeout(150);
  let id=await page.evaluate(()=>document.activeElement.id);
  if(id!=='lf-close')throw Error('viewer focus went '+id);
  await page.locator('#lf-close').click();
  await page.waitForTimeout(180);
  const restored=await first.evaluate(el=>document.activeElement===el);
  if(!restored)throw Error('viewer focus not restored to artwork card');
 });
 await check(dev,'horizontal-overflow',async()=>{
  const v=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}));
  if(v.scroll>v.w+12)throw Error(JSON.stringify(v));
 });
 await check(dev,'axe-critical-serious',async()=>{
  await page.locator('nav.primary [data-target="reports"]').click();
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  fs.mkdirSync('qa-results/'+engineName,{recursive:true});
  fs.writeFileSync('qa-results/'+engineName+'/axe-'+dev+'.json',JSON.stringify(
    {violations:axe.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.slice(0,8).map(n=>({target:n.target,summary:n.failureSummary}))}))},null,2));
  const serious=axe.violations.filter(v=>v.impact==='critical'||v.impact==='serious');
  if(serious.length)throw Error(serious.map(v=>v.id+':'+v.nodes.length).join(','));
 });
 if(errors.length)log(dev,'runtime-errors',false,errors.slice(0,6).join('; '));
 await ctx.close();
}
await browser.close();
const fail=rows.filter(x=>x.status==='FAIL');
fs.mkdirSync('qa-results/'+engineName,{recursive:true});
fs.writeFileSync('qa-results/'+engineName+'/results.json',JSON.stringify({engine:engineName,rows,pass:rows.length-fail.length,fail:fail.length,
 limitations:'Axe DOM checks + keyboard emulation, NOT real VoiceOver/TalkBack hardware speech testing.'},null,2));
console.log('SUMMARY '+engineName+' PASS '+(rows.length-fail.length)+' FAIL '+fail.length);
if(fail.length)process.exitCode=1;
