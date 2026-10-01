/** Accessible clickable identities. Labels are untrusted data: use textContent only. */
export function renderIdentityChoices(article,request,{onSelect,onCancel}={}){
  const root=document.createElement('section'),title=document.createElement('p'),list=document.createElement('ul');
  root.className='rwa-identity-picker';root.setAttribute('aria-label','Choose a group or client');
  title.className='rwa-identity-heading';
  title.textContent=request.reason==='PARTIAL_NAME'?'No exact match. Choose the name you intended.':'Choose the group or client you meant.';
  const info=document.createElement('p');info.className='rwa-identity-help';
  info.textContent=request.targets.length+' available matches for “'+request.span.text+'”. Your original question and conditions will be kept.';
  list.className='rwa-identity-list';root.append(title,info,list);
  const more=document.createElement('button'),cancel=document.createElement('button'),actions=document.createElement('div');
  more.type=cancel.type='button';more.textContent='Show more matches';cancel.textContent='Edit question';
  actions.className='rwa-identity-actions';actions.append(more,cancel);root.append(actions);
  const note=document.createElement('p');note.className='rwa-identity-help';
  note.textContent='Groups come from the authorised index. Clients are listed only after their authorised details have been loaded. Selecting a name opens a report preview; it does not run a report.';
  root.append(note);article.append(root);let shown=0,finished=false;
  const disable=()=>{finished=true;for(const b of root.querySelectorAll('button')){b.disabled=true;b.dataset.finished='true';}};
  function page(){
    for(const target of request.targets.slice(shown,shown+8)){
      const li=document.createElement('li'),button=document.createElement('button'),name=document.createElement('span'),meta=document.createElement('span');
      button.type='button';button.className='rwa-identity-choice';button.dataset.identityKey=target.key;
      name.className='rwa-identity-name';name.textContent=target.name;
      meta.className='rwa-identity-meta';meta.textContent=target.kind==='GROUP'?'Group · Group ID: '+target.id:
        'Client / legal entity · LEID: '+target.id+' · Group: '+(target.parentName||target.parentId)+' ['+target.parentId+']';
      button.append(name,meta);li.append(button);list.append(li);
      button.onclick=()=>{if(finished||button.disabled)return;onSelect?.(target,disable);};
    }
    shown=Math.min(shown+8,request.targets.length);more.hidden=shown>=request.targets.length;
    more.textContent='Show more matches ('+(request.targets.length-shown)+' remaining)';
  }
  more.onclick=()=>{if(!finished){const old=shown;page();list.children[old]?.querySelector('button')?.focus();}};
  cancel.onclick=()=>{if(!finished){disable();onCancel?.();}};
  root.onkeydown=e=>{if(e.key==='Escape'&&!finished){e.preventDefault();disable();onCancel?.();}};
  page();return {root,disable,focus:()=>root.querySelector('button:not([disabled])')?.focus({preventScroll:true})};
}
