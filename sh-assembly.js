(()=>{
const host=document.querySelector('.sh-motion');if(!host)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const canvas=document.createElement('canvas');canvas.className='sh-screen-particles';canvas.setAttribute('aria-hidden','true');const ctx=canvas.getContext('2d');if(!ctx)return;
const mask=document.createElement('canvas');mask.width=mask.height=480;const m=mask.getContext('2d');if(!m)return;
m.fillStyle='#fff';m.beginPath();m.roundRect(44,44,392,392,32);m.fill();
m.globalCompositeOperation='destination-out';m.save();m.transform(.095,0,0,-.145,87.145,348.0975);for(const d of ["M1227 1446V1130Q1104 1185 987 1213Q870 1241 766 1241Q628 1241 562 1203Q496 1165 496 1085Q496 1025 540.5 991.5Q585 958 702 934L866 901Q1115 851 1220 749Q1325 647 1325 459Q1325 212 1178.5 91.5Q1032 -29 731 -29Q589 -29 446 -2Q303 25 160 78V403Q303 327 436.5 288.5Q570 250 694 250Q820 250 887 292Q954 334 954 412Q954 482 908.5 520Q863 558 727 588L578 621Q354 669 250.5 774Q147 879 147 1057Q147 1280 291 1400Q435 1520 705 1520Q828 1520 958 1501.5Q1088 1483 1227 1446Z","M1733 1493H2118V924H2686V1493H3071V0H2686V633H2118V0H1733Z"])m.fill(new Path2D(d));m.restore();m.globalCompositeOperation='source-over';
const pixels=m.getImageData(0,0,480,480).data;let seed=404;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296},points=[];
for(let y=18;y<466;y+=4)for(let x=18;x<466;x+=4){const i=(y*480+x)*4;if(pixels[i+3]<80)continue;points.push({x,y,sx:random(),sy:random(),delay:random()*.9,alpha:.55+random()*.45,size:.7+random()*.6,curve:(random()-.5)*140,color:'#ed484b'})}
const key='sh-intro-assembled-balanced-v2';let done=reduced.matches;try{done=done||sessionStorage.getItem(key)==='1'}catch{}
const settled=document.createElement('canvas');settled.className='sh-settled-particles';settled.width=settled.height=960;settled.setAttribute('aria-hidden','true');const local=settled.getContext('2d');if(!local)return;local.scale(2,2);for(const p of points){local.globalAlpha=p.alpha;local.fillStyle=p.color;local.beginPath();local.arc(p.x,p.y,p.size,0,Math.PI*2);local.fill()}settled.style.visibility='hidden';host.appendChild(settled);
document.body.appendChild(canvas);let width=0,height=0,frame=0,start=null,elapsed=0,visible=false;
const clamp=t=>Math.max(0,Math.min(1,t)),ease=t=>1-Math.pow(1-t,3);
function draw(t){if(done){canvas.style.display='none';settled.style.visibility='visible';host.classList.add('sh-canvas-ready');document.documentElement.classList.remove('sh-assembly-pending');return}const box=host.getBoundingClientRect(),scale=box.width/480;ctx.clearRect(0,0,width,height);if(!visible)return;
for(const p of points){const settle=done?1:ease(clamp((t-1.4-p.delay)/3.6));const tx=box.left+p.x*scale,ty=box.top+p.y*scale,sx=p.sx*width,sy=p.sy*height,bend=Math.sin(settle*Math.PI)*p.curve;
const x=sx+(tx-sx)*settle+bend*Math.sin(p.y*.02),y=sy+(ty-sy)*settle+bend*Math.cos(p.x*.02);
ctx.globalAlpha=p.alpha*(.16+.84*settle);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(x,y,Math.max(.65,p.size*scale),0,Math.PI*2);ctx.fill()}
ctx.globalAlpha=1;host.classList.add('sh-canvas-ready');document.documentElement.classList.remove('sh-assembly-pending')}
function paint(now){frame=0;if(!visible)return;if(start===null)start=now-elapsed*1000;elapsed=(now-start)/1000;
if(elapsed>=6.2){done=true;try{sessionStorage.setItem(key,'1')}catch{}}
draw(elapsed);if(!done)frame=requestAnimationFrame(paint)}
function schedule(){if(!frame)frame=requestAnimationFrame(done?()=>{frame=0;draw(5)}:paint)}
function resize(){width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);schedule()}
addEventListener('resize',resize,{passive:true});addEventListener('scroll',schedule,{passive:true});resize();
const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){start=null;schedule()}else{cancelAnimationFrame(frame);frame=0;start=null;ctx.clearRect(0,0,width,height)}},{threshold:.01});observer.observe(host);
reduced.addEventListener('change',()=>{if(reduced.matches){done=true;cancelAnimationFrame(frame);frame=0;schedule()}});
})();
