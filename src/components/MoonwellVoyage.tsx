import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { Rarity } from '../game/types';
import type { SeqPhase } from '../game/summon/sequence';
import { buildMeteors, meteorPoint } from '../game/summon/meteors';
import { useReducedMotion } from './animation/timing';
import '../styles/moonwellVoyage.css';

const COLORS: Record<Rarity, [string,string]> = { common:['#adc8df','#eff7ff'], rare:['#418fde','#bcefff'], epic:['#9460ce','#f0cfff'], legendary:['#de9741','#fff1b9'] };

/** One curved meteor per persisted pull; canvas keeps trails coherent at any viewport size. */
export function MoonwellVoyage({ phase, tier, duration = 900, pulls }: { phase: SeqPhase; tier: Rarity; duration?: number; pulls?: readonly { rarity: Rarity }[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const meteors = useMemo(() => buildMeteors(pulls ?? [{ rarity: tier }]), [pulls, tier]);
  const released = ['emerge', 'reveal', 'result', 'slot'].includes(phase);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    const started = performance.now();
    const resize = () => { const rect = element.getBoundingClientRect(); element.width = Math.min(900, Math.max(320, Math.round(rect.width / 2))); element.height = Math.round(element.width * rect.height / Math.max(1,rect.width)); };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(element);
    const draw = (now: number) => {
      const w=element.width,h=element.height;
      ctx.clearRect(0,0,w,h);
      const elapsed=Math.min(1,(now-started)/Math.max(1,duration));
      if (!reduced && !document.hidden && (phase === 'telegraph' || phase === 'opening')) {
        for (const m of [...meteors].sort((a,b)=>a.depth-b.depth)) {
          const progress = phase === 'opening' ? 1 : Math.max(0, Math.min(1, (elapsed-m.delay)/(1-m.delay)));
          if (progress <= 0) continue;
          const [color,core]=COLORS[m.rarity];
          const exit = phase === 'opening' ? Math.max(0,(elapsed-.12-m.delay*.35)/(.88-m.delay*.35)) : 0;
          const move=(p:number) => { const a=meteorPoint(m,p); return {x:(a.x-.95*exit*exit)*w,y:(a.y+(.32+(m.index%4)*.04)*exit*exit)*h}; };
          const head=move(progress);
          const size=(m.rarity==='legendary'?3.2:m.rarity==='epic'?2.6:2)*m.depth*(.75+progress*.35+exit*.15);
          const alpha=Math.min(1,progress*7)*(1-Math.max(0,exit-.65)/.35);
          ctx.globalAlpha=alpha;
          // Curved continuous wake, broad faint edge and narrow bright spine.
          for (const [width,opacity] of [[size*5,.07],[size*2,.22],[size*.6,.9]]) {
            ctx.beginPath();
            for(let j=0;j<=18;j++) { const p=Math.max(0,progress-(.13+m.depth*.07)+j/18*(.13+m.depth*.07)); const a=move(p); if(j===0)ctx.moveTo(a.x,a.y);else ctx.lineTo(a.x,a.y); }
            const tail=move(Math.max(0,progress-(.13+m.depth*.07)));
            const gradient=ctx.createLinearGradient(tail.x,tail.y,head.x,head.y);gradient.addColorStop(0,'transparent');gradient.addColorStop(.65,color);gradient.addColorStop(1,core);
            ctx.strokeStyle=gradient;ctx.globalAlpha=alpha*opacity;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();
          }
          ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fillRect(Math.round(head.x-size),Math.round(head.y-size),Math.ceil(size*2),Math.ceil(size*2));ctx.fillStyle=core;ctx.fillRect(Math.round(head.x-size*.5),Math.round(head.y-size*.5),Math.ceil(size),Math.ceil(size));
          if(m.rarity==='legendary') { ctx.globalAlpha=alpha*.6;ctx.fillRect(Math.round(head.x-7),Math.round(head.y),14,1);ctx.fillRect(Math.round(head.x),Math.round(head.y-7),1,14); }
        }
      }
      ctx.globalAlpha=1;
      if (!reduced && (phase==='telegraph'||phase==='opening') && elapsed<1) frame=requestAnimationFrame(draw);
    };
    draw(started);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [phase,duration,meteors,reduced]);
  return <div className={`voyage v-${phase} v-${tier} ${released ? 'v-released' : ''}`} style={{ '--beat': `${duration}ms` } as CSSProperties} aria-hidden="true">
    <div className="sky-depth" />
    <canvas ref={canvas} className="meteor-field" data-summon-count={meteors.length} />
    <div className="sky-impact" /><div className="sky-afterglow" />
  </div>;
}
