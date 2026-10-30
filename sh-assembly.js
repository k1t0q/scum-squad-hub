(()=>{
const host=document.querySelector('.sh-motion');if(!host)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');if(reduced.matches)return;
const canvas=document.createElement('canvas');canvas.className='sh-screen-particles';canvas.setAttribute('aria-hidden','true');const ctx=canvas.getContext('2d');if(!ctx)return;
const mask=document.createElement('canvas');mask.width=mask.height=480;const m=mask.getContext('2d');if(!m)return;
m.strokeStyle='#fff';m.lineWidth=3;m.setLineDash([68,12]);m.beginPath();m.moveTo(240,38);m.lineTo(410,136);m.lineTo(410,310);m.lineTo(240,438);m.lineTo(70,310);m.lineTo(70,136);m.closePath();m.stroke();m.setLineDash([]);
m.lineWidth=2;for(const [x,y,dx,dy] of [[240,16,0,42],[240,422,0,42],[38,240,42,0],[400,240,42,0]]){m.beginPath();m.moveTo(x,y);m.lineTo(x+dx,y+dy);m.stroke()}
m.save();m.translate(16,50);m.scale(1.8,1.8);m.fillStyle='#fff';for(const d of ['M112 48H64L44 68V116H90V146H44V170H94L112 152V92H66V72H112Z','M132 48H156V94H180V48H204V170H180V118H156V170H132Z'])m.fill(new Path2D(d));m.restore();
const pixels=m.getImageData(0,0,480,480).data;let seed=404;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296},points=[];
for(let y=18;y<466;y+=4)for(let x=18;x<466;x+=4){const i=(y*480+x)*4;if(pixels[i+3]<80)continue;points.push({x,y,sx:random(),sy:random(),delay:random()*.9,alpha:.55+random()*.45,size:.7+random()*.6,curve:(random()-.5)*140,color:random()>.9?'#adad7c':'#ed484b'})}
document.body.appendChild(canvas);let width=0,height=0,frame=0,start=0,last=0,visible=false;
function resize(){width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}addEventListener('resize',resize,{passive:true});resize();
const clamp=t=>Math.max(0,Math.min(1,t)),ease=t=>1-Math.pow(1-t,3);
function paint(now){if(!visible||reduced.matches){frame=0;return}frame=requestAnimationFrame(paint);if(now-last<32)return;last=now;if(!start)start=now;
const t=((now-start)/1000)%19,box=host.getBoundingClientRect(),scale=box.width/480;ctx.clearRect(0,0,width,height);
for(const p of points){const settle=t<5?ease(clamp((t-p.delay)/3.6)):t<14.5?1:1-ease(clamp((t-14.5-p.delay*.4)/4));
const tx=box.left+p.x*scale,ty=box.top+p.y*scale,sx=p.sx*width,sy=p.sy*height,bend=Math.sin(settle*Math.PI)*p.curve;
const x=sx+(tx-sx)*settle+bend*Math.sin(p.y*.02),y=sy+(ty-sy)*settle+bend*Math.cos(p.x*.02),wave=Math.max(0,1-Math.abs(p.y/480-((t-5)%5)/5)*12);
ctx.globalAlpha=p.alpha*(.16+.84*settle);ctx.fillStyle=settle>.99&&wave>.6?'#ffb09a':p.color;ctx.beginPath();ctx.arc(x,y,Math.max(.65,p.size*scale)+(settle>.99?wave*.3:0),0,Math.PI*2);ctx.fill()}
ctx.globalAlpha=1;host.classList.add('sh-canvas-ready')}
const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible&&!frame){start=0;frame=requestAnimationFrame(paint)}else if(!visible&&frame){cancelAnimationFrame(frame);frame=0;ctx.clearRect(0,0,width,height)}},{threshold:.15});observer.observe(host);
reduced.addEventListener('change',()=>{if(reduced.matches){cancelAnimationFrame(frame);frame=0;ctx.clearRect(0,0,width,height);host.classList.remove('sh-canvas-ready')}else if(visible&&!frame){start=0;frame=requestAnimationFrame(paint)}});
})();