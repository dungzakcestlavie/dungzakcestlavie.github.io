/* DUNGZAK.ART DCAR listing: accessible entry settings.
   Shares dcar-accessibility-v2 with the individual reports and Artist Bio.
   Does not overwrite the saved language or user content. */
(function(){
'use strict';
var root=document.getElementById('reports');
var btn=document.getElementById('reportsDisplaySettings');
var panel=document.getElementById('reportsDisplayPanel');
if(!root||!btn||!panel)return;
var KEY='dcar-accessibility-v2',SIZES=['1','1.5','2','3','4'];
var prefs={size:'1',contrast:false},status=document.getElementById('reportsDisplayStatus');
var reset=document.getElementById('reportsDisplayReset'),close=document.getElementById('reportsDisplayClose');
var title=document.getElementById('reportsDisplayHeading');
function read(){
  try{var o=JSON.parse(localStorage.getItem(KEY)||'{}');
    prefs.size=SIZES.indexOf(String(o.size))===-1?'1':String(o.size);
    prefs.contrast=o.contrast===true;
  }catch(e){prefs={size:'1',contrast:false};}
}
function save(){
  try{var o={};try{o=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){}
    o.size=prefs.size;o.contrast=prefs.contrast;
    localStorage.setItem(KEY,JSON.stringify(o));
  }catch(e){}
}
function apply(){
  root.style.setProperty('--dcar-home-scale',prefs.size);
  root.dataset.dcarScale=prefs.size;
  root.classList.toggle('dcar-zoom',parseFloat(prefs.size)>1);
  root.classList.toggle('dcar-high-contrast',prefs.contrast);
  panel.querySelectorAll('[data-dcar-size]').forEach(function(b){
    b.setAttribute('aria-pressed',String(b.getAttribute('data-dcar-size')===prefs.size));
  });
  panel.querySelectorAll('[data-dcar-contrast]').forEach(function(b){
    b.setAttribute('aria-pressed',String((b.getAttribute('data-dcar-contrast')==='on')===prefs.contrast));
  });
}
function say(ko,en){
  if(!status)return;
  var l=document.body.classList.contains('english')?'en':document.body.classList.contains('hybrid')?'both':'ko';
  status.textContent=l==='en'?en:l==='both'?ko+' / '+en:ko;
}
function open(opened){
  panel.hidden=!opened;btn.setAttribute('aria-expanded',String(opened));
  if(opened&&title)title.focus({preventScroll:true});
  else if(!opened)btn.focus({preventScroll:true});
}
btn.addEventListener('click',function(){open(panel.hidden);});
close.addEventListener('click',function(){open(false);});
panel.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();open(false);}});
panel.querySelectorAll('[data-dcar-size]').forEach(function(b){
  b.addEventListener('click',function(){
    prefs.size=b.getAttribute('data-dcar-size');save();apply();
    var percent=Math.round(parseFloat(prefs.size)*100);
    say('글자 크기 '+percent+'%','Text size '+percent+'%');
  });
});
panel.querySelectorAll('[data-dcar-contrast]').forEach(function(b){
  b.addEventListener('click',function(){
    prefs.contrast=b.getAttribute('data-dcar-contrast')==='on';save();apply();
    say(prefs.contrast?'고대비 적용':'기본 대비 적용',prefs.contrast?'High contrast enabled':'Standard contrast enabled');
  });
});
reset.addEventListener('click',function(){
  prefs.size='1';prefs.contrast=false;save();apply();
  say('보기 설정을 초기화했습니다. 글자 100%, 기본 대비.','Display settings reset to 100% and standard contrast.');
});
window.addEventListener('storage',function(e){if(e.key===KEY||e.key===null){read();apply();}});
window.addEventListener('pageshow',function(){read();apply();});
read();apply();
})();