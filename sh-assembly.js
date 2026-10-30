(()=>{
const host=document.querySelector('.sh-motion');if(!host)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');if(reduced.matches)return;
const canvas=document.createElement('canvas');canvas.className='sh-assembly';canvas.setAttribute('aria-hidden','true');
const ctx=canvas.getContext('2d');if(!ctx)return;
const mask=document.createElement('canvas');mask.width=mask.height=480;const m=mask.getContext('2d');if(!m)return;
m.fillStyle='#fff';m.beginPath();m.roundRect(24,24,432,432,60);m.fill();m.save();m.translate(16,37);m.scale(1.8,1.8);m.fillStyle='#000';
for(const d of ['M112 48H64L44 68V116H90V146H44V170H94L112 152V92H66V72H112Z','M132 48H156V94H180V48H204V170H180V118H156V170H132Z'])m.fill(new Path2D(d));m.restore();
const pixels=m.getImageData(0,0,480,480).data;let seed=404;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const points=[];for(let y=27;y<456;y+=6)for(let x=27;x<456;x+=6){const i=(y*480+x)*4;if(pixels[i]<200||pixels[i+3]<200)continue;const a=random()*Math.PI*2,r=250+random()*150;points.push({x,y,sx:240+Math.cos(a)*r,sy:240+Math.sin(a)*r,delay:(x+y)/960*.65+random()*.45,alpha:.5+random()*.5,size:.9+random()*.5})}
host.appendChild(canvas);let frame=0,start=0,last=0,visible=false;
const resize=()=>{const size=host.getBoundingClientRect().width,dpr=Math.min(devicePixelRatio||1,2);canvas.width=canvas.height=Math.round(size*dpr);ctx.setTransform(canvas.width/480,0,0,canvas.height/480,0,0)};new ResizeObserver(resize).observe(host);resize();
const ease=t=>1-Math.pow(1-t,3),clamp=t=>Math.max(0,Math.min(1,t));
function paint(now){if(!visible||reduced.matches){frame=0;return}frame=requestAnimationFrame(paint);if(now-last<32)return;last=now;if(!start)start=now;
const t=((now-start)/1000)%15;ctx.clearRect(0,0,480,480);
for(const p of points){let settle= t<4?ease(clamp((t-p.delay)/2.7)):t<12?1:1-ease(clamp((t-12-p.delay*.3)/2.6));
const bend=Math.sin(settle*Math.PI)*24;const x=p.sx+(p.x-p.sx)*settle+bend*Math.sin(p.y*.03),y=p.sy+(p.y-p.sy)*settle+bend*Math.cos(p.x*.03);
const wave=Math.max(0,1-Math.abs((p.x+p.y)/960-((t-4)%5)/5)*14);ctx.globalAlpha=p.alpha*(.22+.78*settle);ctx.fillStyle=settle>.98&&wave>.4?'#ff8c80':'#ed484b';ctx.beginPath();ctx.arc(x,y,p.size+(settle>.98?wave*.45:0),0,Math.PI*2);ctx.fill()}
ctx.globalAlpha=1;host.classList.add('sh-canvas-ready')}
const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible&&!frame){start=0;frame=requestAnimationFrame(paint)}else if(!visible&&frame){cancelAnimationFrame(frame);frame=0}},{threshold:.08});observer.observe(host);
reduced.addEventListener('change',()=>{if(reduced.matches){cancelAnimationFrame(frame);frame=0;host.classList.remove('sh-canvas-ready')}else if(visible&&!frame){start=0;frame=requestAnimationFrame(paint)}});
})();