/** 6.0.11-chat-ux: visual output only. Does NOT parse, calculate, confirm or fetch.
 * Finished report text is revealed progressively; it is not model generation.
 * No innerHTML, external dependency, persistent storage or remote connection.
 */
import {CHAT_EXAMPLES,exampleQuestion} from './chat_examples.js';
const reduceMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
const bound=(value,fallback,low,high)=>Number.isFinite(value)?Math.max(low,Math.min(high,value)):fallback;
export function createChatPresentation({history,question,config={},getContext=()=>({}),canEdit=()=>true}) {
  const doc=history.ownerDocument,win=doc.defaultView,footer=doc.querySelector('body > footer');
  const active=new Map(),cleanups=[];
  let follow=true,scrollFrame=0,lastTop=0,ownScroll=false,alive=true,touchY=null;
  const on=(node,type,listener,options)=>{node?.addEventListener(type,listener,options);cleanups.push(()=>node?.removeEventListener(type,listener,options));};
  function scroller(){
    for(let p=history.parentElement;p&&p!==doc.body;p=p.parentElement){
      const s=win.getComputedStyle(p);
      if(/auto|scroll/.test(s.overflowY)&&p.scrollHeight>p.clientHeight+1)return p;
    }
    return doc.scrollingElement||doc.documentElement;
  }
  const documentScroll=s=>s===doc.scrollingElement||s===doc.documentElement||s===doc.body;
  function bounds(s){
    const r=documentScroll(s)?{top:0,bottom:win.innerHeight}:s.getBoundingClientRect();
    const f=footer?.getBoundingClientRect();
    return {top:r.top,bottom:Math.min(r.bottom,f&&f.height&&f.top<win.innerHeight?f.top-12:r.bottom-12)};
  }
  function nearTail(){const s=scroller(),last=history.lastElementChild;return !last||last.getBoundingClientRect().bottom<=bounds(s).bottom+48;}
  const jump=doc.getElementById('jump-latest');
  function jumpState(){if(jump)jump.hidden=follow||!history.children.length;}
  function scrollNow(force=false){
    if(!alive||(!follow&&!force)||!history.isConnected)return;
    const last=history.lastElementChild;if(!last)return;
    const s=scroller(),delta=last.getBoundingClientRect().bottom-bounds(s).bottom;
    // Keep the full bottom of the answer above the fixed composer. The layout
    // reserves its measured height; never scroll the transcript below the input.
    const target=Math.max(0,Math.min(s.scrollHeight-s.clientHeight,s.scrollTop+delta));
    ownScroll=true;s.scrollTop=target;lastTop=s.scrollTop;
    win.requestAnimationFrame(()=>{ownScroll=false;});
    jumpState();
  }
  function followLatest(force=false){
    if(force){follow=true;jumpState();}
    if(!follow||!alive)return;
    if(scrollFrame)win.cancelAnimationFrame(scrollFrame);
    scrollFrame=win.requestAnimationFrame(()=>{scrollFrame=0;scrollNow();});
  }
  function stopFollowing(){follow=false;jumpState();}
  on(win,'wheel',e=>{if(e.deltaY<0)stopFollowing();},{passive:true});
  on(win,'touchstart',e=>{touchY=e.touches?.[0]?.clientY??null;},{passive:true});
  on(win,'touchmove',e=>{const y=e.touches?.[0]?.clientY;if(touchY!==null&&y>touchY+4)stopFollowing();touchY=y??null;},{passive:true});
  on(win,'keydown',e=>{
    if(!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||'')&&['PageUp','Home','ArrowUp'].includes(e.key))stopFollowing();
  });
  on(doc,'scroll',()=>{
    const s=scroller(),top=s.scrollTop;
    if(!ownScroll){if(top<lastTop-3&&!nearTail())stopFollowing();else if(nearTail()){follow=true;jumpState();}}
    lastTop=top;
  },true);
  on(jump,'click',()=>followLatest(true));
  function measureComposer(){
    if(!footer)return;
    doc.documentElement.style.setProperty('--rwa-composer-height',Math.ceil(footer.getBoundingClientRect().height)+'px');
    followLatest();
  }
  const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(measureComposer):null;
  observer?.observe(footer||history);on(win,'resize',measureComposer);measureComposer();
  on(win.visualViewport,'resize',measureComposer);
  on(doc,'rwa:splash-hidden',()=>{measureComposer();followLatest();});

  function cancel(element){active.get(element)?.cancel();}
  function finishAll(){for(const item of [...active.values()])item.finish();}
  function cancelAll(){for(const item of [...active.values()])item.cancel();}
  function reveal(element,value,done=()=>{}){
    cancel(element);const text=String(value??'');
    // Segment complete characters; never cut a UTF-16 surrogate pair. Prefer
    // graphemes so combined accents and emoji also stay intact.
    const chars=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment):Array.from(text);
    if(config.animateAnswers===false||reduceMotion()||doc.hidden||!chars.length){element.textContent=text;done();followLatest();return;}
    const rate=bound(config.answerCharsPerSecond,180,40,1000),limit=bound(config.answerMaxDurationMs,5000,250,15000);
    const duration=Math.min(limit,chars.length/rate*1000);
    const output=doc.createElement('span');output.className='rwa-typing-text';output.setAttribute('aria-hidden','true');
    const cursor=doc.createElement('span');cursor.className='rwa-typing-cursor';cursor.setAttribute('aria-hidden','true');cursor.textContent='\u258e';
    const sr=doc.createElement('span');sr.className='rwa-sr-only';
    const skip=doc.createElement('button');skip.type='button';skip.className='rwa-show-full';skip.textContent='Show full answer';
    const holder=element.closest('article');
    const oldLive=element.getAttribute('aria-live');element.setAttribute('aria-live','off');element.setAttribute('aria-busy','true');
    element.replaceChildren(output,cursor,sr);element.after(skip);holder?.setAttribute('data-answer-typing','true');
    let frame=0,start=null,settled=false;
    function cleanup(){
      if(frame)win.cancelAnimationFrame(frame);cursor.remove();skip.remove();element.removeAttribute('aria-busy');holder?.removeAttribute('data-answer-typing');
      if(oldLive===null)element.removeAttribute('aria-live');else element.setAttribute('aria-live',oldLive);
      active.delete(element);
    }
    function finish(){if(settled)return;settled=true;cleanup();element.textContent=text;done();followLatest();}
    function abort(){if(settled)return;settled=true;cleanup();element.textContent=text;}
    function tick(time){
      if(settled)return;
      if(!element.isConnected){abort();return;}
      if(start===null)start=time;
      const count=Math.min(chars.length,Math.max(1,Math.floor(chars.length*(time-start)/duration)));
      output.textContent=chars.slice(0,count).join('');
      followLatest();
      if(count===chars.length)finish();else frame=win.requestAnimationFrame(tick);
    }
    active.set(element,{finish,cancel:abort});skip.onclick=finish;
    frame=win.requestAnimationFrame(tick);
  }
  on(doc,'visibilitychange',()=>{if(doc.hidden)finishAll();});

  const panel=doc.getElementById('example-panel'),list=doc.getElementById('example-list'),toggle=doc.getElementById('examples-toggle');
  if(panel&&list){
    let section;
    for(const e of CHAT_EXAMPLES){
      if(section?.dataset.category!==e.category){section=doc.createElement('section');section.dataset.category=e.category;const h=doc.createElement('h3');h.textContent=e.category;section.append(h);list.append(section);}
      const b=doc.createElement('button');b.type='button';b.className='rwa-example';b.textContent=e.label;b.title=e.text.replaceAll('{group}',' for the selected group').replaceAll('{month}','the analysis month');
      b.onclick=()=>{
        if(!canEdit())return;
        question.value=exampleQuestion(e,getContext());question.dispatchEvent(new Event('input',{bubbles:true}));
        // Never submit automatically or overwrite the currently selected identity.
        question.focus({preventScroll:true});
        if(win.innerWidth<1150){panel.classList.remove('is-open');toggle?.setAttribute('aria-expanded','false');}
        followLatest(true);
      };
      section.append(b);
    }
    on(toggle,'click',()=>{const open=panel.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));});
    on(doc.getElementById('examples-close'),'click',()=>{panel.classList.remove('is-open');toggle?.setAttribute('aria-expanded','false');toggle?.focus({preventScroll:true});});
    on(win,'keydown',e=>{if(e.key==='Escape'&&panel.classList.contains('is-open')){panel.classList.remove('is-open');toggle?.setAttribute('aria-expanded','false');}});
  }
  return {
    reveal,cancel,finishAll,cancelAll,followLatest,
    beginTurn(){finishAll();follow=true;scrollNow(true);followLatest(true);},
    refreshControls(){for(const b of list?.querySelectorAll('button')||[])b.disabled=!canEdit();},
    dispose(){if(!alive)return;cancelAll();alive=false;observer?.disconnect();for(const f of cleanups)f();if(scrollFrame)win.cancelAnimationFrame(scrollFrame);}
  };
}
