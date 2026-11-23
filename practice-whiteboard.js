(() => {
 const board=$('whiteboardPanel'),canvas=$('whiteboardCanvas');
 const context=canvas.getContext('2d');
 if(!context)return;
 const tools=board.querySelector('.whiteboard-tools'),status=$('whiteboardStatus');
 const pen=$('whiteboardPen'),eraser=$('whiteboardEraser'),scroll=$('whiteboardScrollMode');
 const undo=$('whiteboardUndo'),clear=$('whiteboardClear');
 const teacherMode=new URLSearchParams(location.search).get('teacher')==='1';
 const maxLength=200000;
 let strokes=[],tool='pen',pointer=null,stroke=null;
 let width=0,height=0,ready=false,editing=false,unsubscribe,subscription=0;
 const canEdit=()=>editing&&ready&&cloudReady&&cloud?.isTeacher&&authInstance?.currentUser?.uid===cloud.uid;
 function updateTools(){
  pen.setAttribute('aria-pressed',String(tool==='pen'));
  eraser.setAttribute('aria-pressed',String(tool==='eraser'));
  scroll.setAttribute('aria-pressed',String(tool==='scroll'));
  canvas.classList.toggle('whiteboard-drawing',canEdit()&&tool!=='scroll');
  for(const button of [pen,eraser,scroll])button.disabled=!canEdit();
  undo.disabled=clear.disabled=!canEdit()||!strokes.length;
 }
 function paint(item,from,to){
  context.globalCompositeOperation=item.tool==='eraser'?'destination-out':'source-over';
  context.strokeStyle='#173648';
  context.fillStyle='#173648';
  context.lineWidth=item.tool==='eraser'?20:2.6;
  context.lineCap=context.lineJoin='round';
  context.beginPath();
  if(from.x===to.x&&from.y===to.y){
   context.arc(to.x*width,to.y*height,context.lineWidth/2,0,2*Math.PI);
   context.fill();
  }else{
   context.moveTo(from.x*width,from.y*height);
   context.lineTo(to.x*width,to.y*height);
   context.stroke();
  }
  context.globalCompositeOperation='source-over';
 }
 function redraw(){
  if(!board.open)return;
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const ratio=Math.min(window.devicePixelRatio||1,3,Math.sqrt(8_000_000/(rect.width*rect.height)));
  width=rect.width;height=rect.height;
  canvas.width=Math.round(width*ratio);
  canvas.height=Math.round(height*ratio);
  context.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
  for(const item of stroke?[...strokes,stroke]:strokes){
   paint(item,item.points[0],item.points[0]);
   for(let i=1;i<item.points.length;i++)paint(item,item.points[i-1],item.points[i]);
  }
 }
 function parse(value){
  if(typeof value!=='string')return [];
  try{
   const result=JSON.parse(value);
   return Array.isArray(result)?result.filter(item=>
    ['pen','eraser'].includes(item?.tool)&&Array.isArray(item.points)&&item.points.length&&
    item.points.every(point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&
     point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1)):[];
  }catch{return [];}
 }
 const boardRef=()=>dbAPI.ref(databaseInstance,'math-practice-demo/teacherWhiteboard');
 async function changeBoard(change){
  if(!canEdit())return;
  const current=subscription;
  try{
   const result=await dbAPI.runTransaction(boardRef(),value=>{
    const next=JSON.stringify(change(parse(value)));
    return next.length<=maxLength?next:undefined;
   });
   if(current!==subscription)return;
   status.textContent=result.committed?'Доска синхронизирована.':'Доска заполнена. Очистите её, чтобы продолжить.';
  }catch{
   if(current===subscription)status.textContent='Изменение не удалось передать ученикам.';
  }
 }
 function finish(save){
  const active=pointer,item=stroke;
  pointer=null;stroke=null;
  if(active!==null&&canvas.hasPointerCapture(active))canvas.releasePointerCapture(active);
  if(save&&item)changeBoard(previous=>[...previous,item]);
  redraw();
 }
 function connect(edit){
  editing=edit;
  tools.hidden=!edit;
  if(!board.open)board.showModal();
  unsubscribe?.();
  unsubscribe=null;
  const current=++subscription;
  strokes=[];ready=false;updateTools();redraw();
  if(edit&&!cloud?.isTeacher){status.textContent='Войдите через Google в панели учителя.';return;}
  if(!cloudReady||!databaseInstance){status.textContent='Подключение к доске…';return;}
  status.textContent='Загружаем доску…';
  unsubscribe=dbAPI.onValue(boardRef(),snapshot=>{
   if(current!==subscription)return;
   strokes=parse(snapshot.val());ready=true;
   status.textContent=edit?'Изменения видны ученикам.':'Решение обновляется автоматически.';
   updateTools();redraw();
  },()=>{
   if(current!==subscription)return;
   ready=false;updateTools();
   status.textContent='Доска недоступна. Закройте её и попробуйте открыть снова.';
  });
 }
 function point(event){
  const rect=canvas.getBoundingClientRect();
  const normalize=value=>Math.round(Math.max(0,Math.min(1,value))*10000)/10000;
  return {x:normalize((event.clientX-rect.left)/rect.width),y:normalize((event.clientY-rect.top)/rect.height)};
 }
 canvas.addEventListener('pointerdown',event=>{
  if(!canEdit()||tool==='scroll'||pointer!==null||event.button!==0)return;
  event.preventDefault();
  const p=point(event);
  pointer=event.pointerId;
  canvas.setPointerCapture(pointer);
  stroke={tool,points:[p]};
  paint(stroke,p,p);
 });
 function appendPoint(event){
  if(event.pointerId!==pointer||!stroke)return;
  const p=point(event),previous=stroke.points.at(-1);
  if(previous.x===p.x&&previous.y===p.y)return;
  stroke.points.push(p);paint(stroke,previous,p);
 }
 canvas.addEventListener('pointermove',appendPoint);
 canvas.addEventListener('pointerup',event=>{
  if(event.pointerId===pointer){appendPoint(event);finish(true);}
 });
 for(const type of ['pointercancel','lostpointercapture']){
  canvas.addEventListener(type,event=>{if(event.pointerId===pointer)finish(false);});
 }
 $('showWhiteboard').hidden=teacherMode;
 $('showWhiteboard').onclick=()=>connect(false);
 $('openTeacherWhiteboard').onclick=()=>connect(true);
 $('closeWhiteboard').onclick=()=>board.close();
 board.addEventListener('close',()=>{
  unsubscribe?.();unsubscribe=null;++subscription;ready=false;finish(false);
 });
 window.addEventListener('practice-chat-session',()=>{if(board.open)connect(editing);});
 window.addEventListener('practice-whiteboard-session',()=>{if(board.open)connect(editing);});
 for(const [button,mode] of [[pen,'pen'],[eraser,'eraser'],[scroll,'scroll']]){
  button.onclick=()=>{finish(false);tool=mode;updateTools();};
 }
 undo.onclick=()=>changeBoard(previous=>previous.slice(0,-1));
 clear.onclick=()=>changeBoard(()=>[]);
 if(typeof ResizeObserver==='function')new ResizeObserver(redraw).observe(canvas);
 else window.addEventListener('resize',redraw);
})();
