(() => {
 const grade=document.body.dataset.practiceGrade;
 const root='math-practice-demo/privateCalls/'+grade;
 const dialog=document.createElement('dialog');
 dialog.className='practice-chat';
 dialog.innerHTML='<header><strong>Личный звонок</strong></header><div class="chat-content"><p role="status"></p><audio autoplay></audio><video autoplay playsinline muted hidden style="max-width:100%;max-height:60vh"></video><div class="flex"><button type="button" data-accept>Принять</button><button type="button" data-share>Показать экран</button><button type="button" class="secondary" data-end>Закрыть</button></div></div>';
 document.body.append(dialog);
 const status=dialog.querySelector('p'), audio=dialog.querySelector('audio'), video=dialog.querySelector('video');
 const accept=dialog.querySelector('[data-accept]'), share=dialog.querySelector('[data-share]'), end=dialog.querySelector('[data-end]');
 let active, listener, identity;
 const ignored=new Set();
 let rulesAvailable=false;
 let autoJoin=false;
 const optIn=document.createElement('button');
 optIn.type='button';optIn.className='secondary';optIn.hidden=true;
 optIn.textContent='Разрешить автоподключение к звонкам';
 document.getElementById('openStudentChat')?.after(optIn);
 optIn.onclick=async()=>{
  if(autoJoin){autoJoin=false;optIn.textContent='Разрешить автоподключение к звонкам';return;}
  const session=identity;
  optIn.disabled=true;
  try{
   const permission=await navigator.mediaDevices.getUserMedia({audio:true});
   permission.getTracks().forEach(track=>track.stop());
   if(identity!==session)return;
   autoJoin=true;
   optIn.textContent='Выключить автоподключение';
  }catch{optIn.textContent='Разрешите микрофон и попробуйте снова';}
  finally{optIn.disabled=false;}
 };
 const databaseRef=path=>dbAPI.ref(databaseInstance,path);
 const say=message=>{status.textContent=message;};
 function show(message){
  say(message);
  if(!dialog.open)dialog.showModal();
 }
 function clear(call){
  clearTimeout(call.timer);
  call.unsubscribe?.();
  call.pc?.close();
  for(const stream of [call.mic,call.screen])stream?.getTracks().forEach(track=>track.stop());
  if(active===call){
   active=null;
   share.textContent='Показать экран';
   audio.srcObject=video.srcObject=null;
   video.hidden=true;
   accept.hidden=share.hidden=true;
   if(dialog.open)dialog.close();
  }
 }
 function finish(call){
  if(!call||active!==call)return;
  ignored.add(call.id);
  if(call.ref&&call.sent){
   const write=call.teacher?dbAPI.remove(call.ref):dbAPI.update(call.ref,{ended:true});
   write.catch(()=>{});
  }
  clear(call);
 }
 function fail(call,error){
  if(active!==call)return;
  finish(call);
  show(error?.name==='NotAllowedError'?'Доступ к микрофону запрещён.':'Не удалось соединиться. Проверьте доступ к микрофону и подключение к сети.');
  end.textContent='Закрыть';
 }
 function current(call){if(active!==call)throw Error('Звонок завершён');}
 function begin(call,message){
  active=call;
  accept.hidden=call.teacher||autoJoin;
  accept.disabled=false;
  share.hidden=true;
  end.textContent=call.teacher||autoJoin?'Завершить':'Отклонить';
  call.timer=setTimeout(()=>finish(call),60000);
  show(message);
 }
 async function connect(call){
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('Browser does not support calls');
  const mic=await navigator.mediaDevices.getUserMedia({audio:true});
  if(active!==call){mic.getTracks().forEach(track=>track.stop());return;}
  call.mic=mic;
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  call.pc=pc;
  mic.getAudioTracks().forEach(track=>pc.addTrack(track,mic));
  if(call.teacher)call.videoSender=pc.addTransceiver('video',{direction:'sendonly'}).sender;
  pc.ontrack=({track})=>{
   if(active!==call)return;
   const player=track.kind==='audio'?audio:video;
   player.srcObject=new MediaStream([track]);
   if(player===video){
    track.onunmute=()=>{video.hidden=false;};
    track.onmute=()=>{video.hidden=true;};
    video.hidden=track.muted;
   }
   player.play().catch(()=>{if(player===audio){audio.controls=true;say('Нажмите «Воспроизвести», чтобы услышать собеседника.');}});
  };
  pc.onconnectionstatechange=()=>{
   if(active!==call)return;
   if(pc.connectionState==='connected'){
    clearTimeout(call.timer);
    if(dialog.open){dialog.close();dialog.show();}
    end.textContent='Завершить';
    share.hidden=!call.teacher||!navigator.mediaDevices.getDisplayMedia;
    say('Звонок подключён.');
   }
   if(pc.connectionState==='failed')fail(call);
  };
 }
 async function localDescription(call,description){
  const pc=call.pc;
  await pc.setLocalDescription(description);
  if(pc.iceGatheringState!=='complete')await new Promise(resolve=>{
   const check=()=>{
    if(pc.iceGatheringState!=='complete')return;
    clearTimeout(timer);
    pc.removeEventListener('icegatheringstatechange',check);
    resolve();
   };
   const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);resolve();},6000);
   pc.addEventListener('icegatheringstatechange',check);
  });
  current(call);
  return pc.localDescription.sdp;
 }
 async function dial(uid,name){
  if(!rulesAvailable||!cloudReady||!cloud?.isTeacher||active||!databaseInstance)return;
  const ref=dbAPI.push(databaseRef(root+'/'+uid));
  const call={id:ref.key,ref,teacher:true,sent:false};
  begin(call,'Звонок: '+name);
  try{
   await connect(call);
   current(call);
   const offer=await localDescription(call,await call.pc.createOffer());
   const disconnect=dbAPI.onDisconnect(ref);
   await disconnect.remove();
   current(call);
   call.sent=true;
   await dbAPI.set(ref,{offer,createdAt:dbAPI.serverTimestamp()});
   current(call);
   say('Ожидаем ответа: '+name);
   call.unsubscribe=dbAPI.onValue(ref,async snapshot=>{
    if(active!==call)return;
    const value=snapshot.val();
    if(!value||value.ended){clear(call);return;}
    if(!value.answer||call.answerApplied)return;
    call.answerApplied=true;
    try{await call.pc.setRemoteDescription({type:'answer',sdp:value.answer});}catch(error){fail(call,error);}
   },error=>fail(call,error));
  }catch(error){fail(call,error);}
 }
 accept.onclick=async()=>{
  const call=active;
  if(!call||call.teacher||accept.disabled)return;
  accept.disabled=true;
  try{
   await connect(call);
   current(call);
   await call.pc.setRemoteDescription({type:'offer',sdp:call.offer});
   const answer=await localDescription(call,await call.pc.createAnswer());
   await dbAPI.update(call.ref,{answer});
   current(call);
   accept.hidden=true;
   end.textContent='Завершить';
   if(call.pc.connectionState!=='connected')say('Подключаем звук…');
  }catch(error){fail(call,error);}
 };
 share.onclick=async()=>{
  const call=active;
  if(!call?.videoSender)return;
  if(call.screen){call.screen.getTracks().forEach(track=>track.stop());call.screen=null;share.textContent='Показать экран';await call.videoSender.replaceTrack(null).catch(()=>{});return;}
  share.disabled=true;
  try{
   const screen=await navigator.mediaDevices.getDisplayMedia({video:true});
   if(active!==call){screen.getTracks().forEach(track=>track.stop());return;}
   call.screen=screen;
   const track=screen.getVideoTracks()[0];
   await call.videoSender.replaceTrack(track);
   share.textContent='Остановить показ';
   track.onended=()=>{if(active===call&&call.screen===screen){call.screen=null;share.textContent='Показать экран';call.videoSender.replaceTrack(null).catch(()=>{});}};
  }catch{
   call.screen?.getTracks().forEach(track=>track.stop());
   call.screen=null;
  }finally{share.disabled=false;}
 };
 end.onclick=()=>{if(active)finish(active);else dialog.close();};
 dialog.addEventListener('cancel',event=>{event.preventDefault();end.click();});
 function watch(){
  const uid=cloudReady?authInstance?.currentUser?.uid:null;
  const next=uid&&databaseInstance;
  if(identity?.uid===uid&&identity?.db===next)return;
  listener?.();listener=null;
  if(active)clear(active);
  identity={uid,db:next};
  autoJoin=false;
  optIn.hidden=true;
  optIn.textContent='Разрешить автоподключение к звонкам';
  rulesAvailable=false;
  document.body.classList.remove('private-calls-ready');
  if(!next)return;
  if(cloud.isTeacher){
   dbAPI.get(databaseRef(root+'/'+uid)).then(()=>{
    if(identity?.uid!==uid||identity.db!==next)return;
    rulesAvailable=true;
    document.body.classList.add('private-calls-ready');
   }).catch(()=>{});
   return;
  }
  listener=dbAPI.onValue(databaseRef(root+'/'+uid),snapshot=>{
   optIn.hidden=false;
   const calls=snapshot.val()||{};
   if(active){
    if(!active.teacher&&(!calls[active.id]||calls[active.id].ended))clear(active);
    else return;
   }
   const incoming=Object.entries(calls).find(([id,v])=>!ignored.has(id)&&!v.ended&&!v.answer&&v.offer&&Date.now()+(typeof practiceServerOffset==='number'?practiceServerOffset:0)-v.createdAt<60000);
   if(!incoming)return;
   const [id,value]=incoming;
   begin({id,offer:value.offer,ref:databaseRef(root+'/'+uid+'/'+id),sent:true},'Учитель приглашает вас на личный звонок.');
   if(autoJoin)accept.onclick();
  },()=>{});
 }
 window.addEventListener('practice-chat-session',watch);
 window.addEventListener('pagehide',()=>finish(active));
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-practice-call]');
  if(button)dial(button.dataset.practiceCall,button.dataset.studentName);
 });
 watch();
})();
