(() => {
 const dialog=document.getElementById('practiceChat');
 if(!dialog)return;
 const $chat=id=>dialog.querySelector('#'+id);
 const form=$chat('chatForm'), message=$chat('chatMessage'), status=$chat('chatStatus');
 const gradeLevelForChat=document.body.dataset.practiceGrade;
 const rootPath='math-practice-demo/teacherChat/'+gradeLevelForChat;
 let unsubscribe, state, busy=false;
 const sorted=value=>Object.entries(value||{}).map(([id,item])=>({...item,id}))
  .sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
 const badge=document.getElementById('chatUnread'), notificationButton=$chat('chatNotifications');
 let teacherWatch, teacherThreads={}, teacherReady=false, teacherError=false, teacherSession, readByThread={};
 const after=(item,last)=>!last||item.time>last.time||(item.time===last.time&&item.id.localeCompare(last.id)>0);
 const unread=(uid,threads=teacherThreads)=>(threads[uid]||[]).filter(item=>item.role==='student'&&after(item,readByThread[uid]));
 const readKey=()=>rootPath+'/read/'+teacherSession.uid;
 function loadRead(){
  try{readByThread=JSON.parse(localStorage.getItem(readKey())||'{}')||{};}catch{readByThread={};}
 }
 function syncBadge(){
  const total=Object.keys(teacherThreads).reduce((sum,uid)=>sum+unread(uid).length,0);
  badge.hidden=!total;
  badge.textContent=total>99?'99+':String(total);
  badge.setAttribute('aria-label','Непрочитанных сообщений: '+total);
 }
 function markCurrentThread(){
  if(!state?.teacher||!state.ready||!state.uid||!dialog.open||document.visibilityState!=='visible'||!document.hasFocus())return;
  const latest=unread(state.uid).at(-1);
  if(!latest)return;
  readByThread[state.uid]={id:latest.id,time:latest.time};
  try{localStorage.setItem(readKey(),JSON.stringify(readByThread));}catch{}
 }
 function syncNotificationButton(){
  notificationButton.hidden=!state?.teacher||!('Notification' in window)||Notification.permission!=='default';
 }
 notificationButton.onclick=async()=>{
  try{await Notification.requestPermission();}catch{}
  syncNotificationButton();
 };
 function notifyTeacher(count){
  if(!count||!('Notification' in window)||Notification.permission!=='granted')return;
  try{
   const note=new Notification('Math Practice · '+gradeLevelForChat+' класс',{
    body:count===1?'Новое сообщение от ученика.':'Новых сообщений: '+count,
    tag:'math-practice-chat-'+gradeLevelForChat
   });
   note.onclick=()=>{window.focus();open(true);note.close();};
  }catch{}
 }
 function watchTeacher(){
  const uid=authInstance?.currentUser?.uid;
  if(!cloudReady||!cloud?.isTeacher||!databaseInstance||!uid){
   teacherWatch?.();
   teacherWatch=null;teacherSession=null;teacherThreads={};teacherReady=false;teacherError=false;readByThread={};
   syncBadge();
   if(state?.teacher&&dialog.open)dialog.close();
   return;
  }
  if(teacherSession?.uid===uid&&teacherSession.database===databaseInstance&&teacherWatch)return;
  teacherWatch?.();
  const session={uid,database:databaseInstance};
  teacherSession=session;teacherThreads={};teacherReady=false;teacherError=false;
  loadRead();syncBadge();
  teacherWatch=dbAPI.onValue(chatRef(),snapshot=>{
   if(teacherSession!==session)return;
   const previous=teacherThreads;
   const next=Object.fromEntries(Object.entries(snapshot.val()||{}).map(([id,thread])=>[id,sorted(thread.messages)]));
   const wasReady=teacherReady;
   teacherThreads=next;teacherReady=true;teacherError=false;
   if(state?.teacher){state.threads=next;state.ready=true;render();}
   syncBadge();
   if(wasReady){
    let count=0;
    for(const id of Object.keys(next)){
     const prior=new Set((previous[id]||[]).map(item=>item.id));
     count+=unread(id,next).filter(item=>!prior.has(item.id)).length;
    }
    notifyTeacher(count);
   }
  },()=>{
   if(teacherSession!==session)return;
   teacherReady=false;teacherError=true;teacherWatch=null;
   if(state?.teacher){state.ready=false;form.hidden=true;status.textContent='Чат пока недоступен. Попробуйте позже.';}
  });
 }
 window.addEventListener('practice-chat-session',watchTeacher);
 window.addEventListener('focus',()=>{if(state?.teacher&&dialog.open)render();});
 window.addEventListener('storage',event=>{
  if(teacherSession&&event.key===readKey()){loadRead();if(state?.teacher)render();syncBadge();}
 });
 const firstStudent=thread=>thread.find(item=>item.role==='student');
 function chatRef(uid){return dbAPI.ref(databaseInstance,rootPath+(uid?'/'+uid:''));}
 function reset(){
  unsubscribe?.();
  unsubscribe=null;
  state=null;
  message.value='';
 }
 function render(){
  if(!state)return;
  const picker=$chat('chatThreads'), list=$chat('chatMessages');
  if(state.teacher){
   const threads=Object.entries(state.threads).map(([uid,thread])=>[uid,firstStudent(thread),thread.at(-1)?.time||0])
    .filter(([,student])=>student).sort((a,b)=>b[2]-a[2]);
   if(!threads.some(([uid])=>uid===state.uid))state.uid=threads[0]?.[0];
   markCurrentThread();
   picker.replaceChildren(...threads.map(([uid,student])=>{
    const count=unread(uid).length;
    return new Option(student.name+' · '+student.className+(count?' · '+count+' новых':''),uid);
   }));
   syncBadge();
   if(state.uid)picker.value=state.uid;
  }
  const thread=state.threads[state.uid]||[];
  const student=firstStudent(thread);
  const sameIdentity=!student||state.teacher||(student.name.toLowerCase()===state.name.toLowerCase()&&student.className===state.className);
  list.replaceChildren();
  for(const item of sameIdentity?thread:[]){
   const row=document.createElement('li');
   row.className='chat-bubble'+((item.role==='teacher')===state.teacher?' chat-own':'');
   const label=document.createElement('strong');
   label.textContent=item.role==='teacher'?'Учитель':item.name;
   const body=document.createElement('div');body.textContent=item.text;
   const time=document.createElement('time');
   if(Number.isFinite(item.time))time.textContent=new Date(item.time).toLocaleString('ru-RU');
   row.append(label,body,time);list.append(row);
  }
  list.scrollTop=list.scrollHeight;
  form.hidden=!state.ready||!state.uid||!sameIdentity;
  status.textContent=!state.ready?'Подключаем чат…':!sameIdentity?'Этот диалог открыт под другим именем или классом. Восстановите исходные данные или откройте отдельную сессию.':thread.length?'':'Сообщений пока нет.';
 }
 async function open(teacher){
  if(dialog.open)return;
  reset();
  $chat('chatTitle').textContent=teacher?'Чат с учениками':'Чат с учителем';
  $chat('chatPicker').hidden=!teacher;
  $chat('chatMessages').replaceChildren();
  $chat('chatThreads').replaceChildren();
  form.hidden=true;
  status.textContent='Подключаем чат…';
  dialog.showModal();
  const next={teacher,uid:null,threads:{},ready:false};
  state=next;
  syncNotificationButton();
  try{
   if(!cloudReady||!databaseInstance)throw Error('Дождитесь подключения сайта.');
   if(teacher){
    if(!cloud?.isTeacher)throw Error('Войдите через Google как учитель.');
    watchTeacher();
    next.threads=teacherThreads;next.ready=teacherReady;
    if(teacherError)status.textContent='Чат пока недоступен. Попробуйте позже.';
    else render();
    return;
   }else{
    next.name=document.getElementById('studentName').value.trim();
    next.className=document.getElementById('grade').value;
    next.uid=await ensureStudentSession(next.name,next.className);
   }
   if(state!==next||!dialog.open)return;
   unsubscribe=dbAPI.onValue(chatRef(next.uid),snapshot=>{
    if(state!==next)return;
    const value=snapshot.val()||{};
    next.threads={[next.uid]:sorted(value.messages)};
    next.ready=true;render();
   },()=>{
    if(state!==next)return;
    next.ready=false;form.hidden=true;
    status.textContent='Чат пока недоступен. Попробуйте позже.';
   });
  }catch(error){if(state===next)status.textContent=error.message;}
 }
 dialog.addEventListener('close',reset);
 $chat('chatThreads').addEventListener('change',event=>{
  if(!state?.teacher)return;
  state.uid=event.target.value;
  message.value='';render();
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const active=state,text=message.value.trim(),uid=active?.uid;
  if(busy||!active?.ready||!uid||form.hidden||!text||text.length>1000)return;
  const student=active.teacher?firstStudent(active.threads[uid]||[]):active;
  if(!student)return;
  if(!active.teacher&&(document.getElementById('studentName').value.trim()!==active.name||document.getElementById('grade').value!==active.className)){
   status.textContent='Имя или класс изменились. Откройте чат заново.';return;
  }
  const submit=form.querySelector('button');
  busy=true;submit.disabled=true;
  try{
   const pending=dbAPI.push(dbAPI.child(chatRef(uid),'messages'));
   await dbAPI.set(pending,{text,name:student.name,className:student.className,role:active.teacher?'teacher':'student',time:dbAPI.serverTimestamp()});
   if(state===active&&active.uid===uid){message.value='';status.textContent='';}
  }catch{
   if(state===active)status.textContent='Сообщение не отправлено. Попробуйте ещё раз.';
  }finally{busy=false;submit.disabled=false;}
 });
 document.getElementById('openStudentChat').addEventListener('click',()=>open(false));
 document.getElementById('openTeacherChat').addEventListener('click',()=>open(true));
 watchTeacher();
})();
