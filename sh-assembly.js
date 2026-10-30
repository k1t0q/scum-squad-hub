(()=>{
'use strict';
const host=document.querySelector('.sh-motion');if(!host)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const key='sh-particles-cinematic-v3',duration=7.8,hold=1.8;
let finished=reduced.matches;try{finished=finished||sessionStorage.getItem(key)==='1'}catch{}
const mask=document.createElement('canvas');mask.width=mask.height=480;
const m=mask.getContext('2d');if(!m)return;
m.fillStyle='#fff';m.beginPath();m.roundRect(44,44,392,392,32);m.fill();
m.globalCompositeOperation='destination-out';m.save();m.transform(.095,0,0,-.145,87.145,348.0975);for(const d of ["M1227 1446V1130Q1104 1185 987 1213Q870 1241 766 1241Q628 1241 562 1203Q496 1165 496 1085Q496 1025 540.5 991.5Q585 958 702 934L866 901Q1115 851 1220 749Q1325 647 1325 459Q1325 212 1178.5 91.5Q1032 -29 731 -29Q589 -29 446 -2Q303 25 160 78V403Q303 327 436.5 288.5Q570 250 694 250Q820 250 887 292Q954 334 954 412Q954 482 908.5 520Q863 558 727 588L578 621Q354 669 250.5 774Q147 879 147 1057Q147 1280 291 1400Q435 1520 705 1520Q828 1520 958 1501.5Q1088 1483 1227 1446Z","M1733 1493H2118V924H2686V1493H3071V0H2686V633H2118V0H1733Z"])m.fill(new Path2D(d));m.restore();m.globalCompositeOperation='source-over';

const pixels=m.getImageData(0,0,480,480).data,points=[];
let seed=404;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
for(let y=44;y<=436;y+=5)for(let x=44;x<=436;x+=5){if(pixels[(y*480+x)*4+3]<180)continue;
points.push({x,y,dx:random()*2-1,dy:random()*2-1,delay:random()*.35,curve:(random()-.5)*100,group:Math.floor(random()*3)})}
const localCanvas=document.createElement('canvas');localCanvas.className='sh-settled-particles';localCanvas.setAttribute('aria-hidden','true');
const local=localCanvas.getContext('2d');if(!local)return;host.appendChild(localCanvas);
const screen=document.createElement('canvas');screen.className='sh-screen-particles';screen.setAttribute('aria-hidden','true');
const ctx=screen.getContext('2d');if(!ctx){localCanvas.remove();return}document.body.appendChild(screen);
let width=0,height=0,frame=0,visible=false,last=null,time=0,localSize=0;
const clamp=t=>Math.max(0,Math.min(1,t)),smooth=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10)};
function amount(t,delay){
if(t<=hold)return 0;
if(t<4)return smooth((t-hold-delay)/1.65);
if(t<4.5)return 1;
return 1-smooth((t-4.5-delay)/2.9);
}
function drawLocal(){
const size=host.getBoundingClientRect().width,dpr=Math.min(devicePixelRatio||1,3);
if(!size)return;localSize=size;
localCanvas.width=localCanvas.height=Math.round(size*dpr);
local.setTransform(localCanvas.width/480,0,0,localCanvas.height/480,0,0);
local.fillStyle='#f05255';
for(let group=0;group<3;group++){local.globalAlpha=.88+group*.05;local.beginPath();for(const p of points){if(p.group!==group)continue;local.moveTo(p.x+1.05,p.y);local.arc(p.x,p.y,1.05,0,Math.PI*2)}local.fill()}
host.classList.add('sh-canvas-ready');document.documentElement.classList.remove('sh-assembly-pending');
}
function finish(){finished=true;cancelAnimationFrame(frame);frame=0;screen.style.display='none';localCanvas.style.visibility='visible';try{sessionStorage.setItem(key,'1')}catch{}}
function draw(){
if(finished||time<=hold){localCanvas.style.visibility='visible';screen.style.display='none';return}
localCanvas.style.visibility='hidden';screen.style.display='block';
const box=host.getBoundingClientRect(),scale=box.width/480;
ctx.clearRect(0,0,width,height);ctx.fillStyle='#f05255';
for(let group=0;group<3;group++){
ctx.globalAlpha=.88+group*.05;ctx.beginPath();
for(const p of points){if(p.group!==group)continue;
const a=amount(time,p.delay),flow=Math.sin(a*Math.PI),r=1.05*scale;
const x=box.left+p.x*scale+p.dx*width*.68*a+Math.sin(p.y*.012+a*2)*p.curve*flow;
const y=box.top+p.y*scale+p.dy*height*.56*a+Math.cos(p.x*.012+a*2)*p.curve*flow;
ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2)}
ctx.fill()}ctx.globalAlpha=1;
}
function tick(now){
frame=0;if(!visible||document.hidden){last=null;return}
if(last!==null)time+=Math.min((now-last)/1000,.05);last=now;
if(time>=duration){finish();return}draw();frame=requestAnimationFrame(tick);
}
function schedule(){if(!finished&&visible&&!frame)frame=requestAnimationFrame(tick)}
function resize(){
width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,3);
screen.style.width=width+'px';screen.style.height=height+'px';
screen.width=Math.round(width*dpr);screen.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
drawLocal();if(finished)finish();else{draw();schedule()}
}
resize();
const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=null;if(visible)schedule();else{cancelAnimationFrame(frame);frame=0;screen.style.display='none';localCanvas.style.visibility='visible'}},{threshold:.05});observer.observe(host);
new ResizeObserver(()=>{if(Math.abs(host.getBoundingClientRect().width-localSize)>.5)resize()}).observe(host);
addEventListener('resize',resize,{passive:true});
addEventListener('scroll',()=>{if(!finished&&visible)draw()},{passive:true});
document.addEventListener('visibilitychange',()=>{last=null;schedule()});
if(window.visualViewport)visualViewport.addEventListener('resize',()=>{if(visualViewport.scale>1.02&&!finished)finish()},{passive:true});
reduced.addEventListener('change',()=>{if(reduced.matches)finish()});
})();