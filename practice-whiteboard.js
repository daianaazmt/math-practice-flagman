(() => {
 const switcher=document.getElementById('whiteboardSwitch');
 const board=document.getElementById('whiteboardPanel');
 const canvas=document.getElementById('whiteboardCanvas');
 const fullscreen=typeof board.showModal==='function';
 const context=canvas.getContext('2d');
 if(!context)return;
 const questionButton=document.getElementById('showTaskAnswer');
 const boardButton=document.getElementById('showWhiteboard');
 const pen=document.getElementById('whiteboardPen');
 const eraser=document.getElementById('whiteboardEraser');
 const undo=document.getElementById('whiteboardUndo');
 const clear=document.getElementById('whiteboardClear');
 const sketches=new Map();
 let scope=null,key=null,visible=false,tool='pen',pointer=null,stroke=null;
 let width=0,height=0;
 const strokes=()=>sketches.get(key)||[];
 function updateTools(){
  pen.setAttribute('aria-pressed',String(tool==='pen'));
  eraser.setAttribute('aria-pressed',String(tool==='eraser'));
  undo.disabled=clear.disabled=!strokes().length;
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
  if(!visible)return;
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const ratio=Math.min(window.devicePixelRatio||1,3);
  width=rect.width;height=rect.height;
  canvas.width=Math.round(width*ratio);
  canvas.height=Math.round(height*ratio);
  context.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
  for(const item of strokes()){
   paint(item,item.points[0],item.points[0]);
   for(let i=1;i<item.points.length;i++)paint(item,item.points[i-1],item.points[i]);
  }
 }
 function finish(){
  const active=pointer;
  pointer=null;stroke=null;
  if(active!==null&&canvas.hasPointerCapture(active))canvas.releasePointerCapture(active);
 }
 function setMode(showBoard){
  finish();
  visible=showBoard&&key!==null;
  boardButton.setAttribute('aria-expanded',String(visible));
  if(fullscreen){
   if(visible&&!board.open)board.showModal();
   if(!visible&&board.open)board.close();
  }else{
   board.hidden=!visible;
   document.getElementById('taskAnswerPanel').hidden=visible;
   questionButton.setAttribute('aria-pressed',String(!visible));
   boardButton.setAttribute('aria-pressed',String(visible));
  }
  if(visible)redraw();
  updateTools();
 }
 function setTask(nextScope,questionId){
  const nextKey=questionId?JSON.stringify([nextScope,questionId]):null;
  if(key===nextKey&&scope===nextScope)return;
  const keepMode=visible&&scope===nextScope;
  scope=nextScope;key=nextKey;
  switcher.hidden=!key;
  setMode(keepMode);
 }
 function point(event){
  const rect=canvas.getBoundingClientRect();
  const clamp=value=>Math.max(0,Math.min(1,value));
  return {x:clamp((event.clientX-rect.left)/rect.width),y:clamp((event.clientY-rect.top)/rect.height)};
 }
 canvas.addEventListener('pointerdown',event=>{
  if(!visible||pointer!==null||event.button!==0)return;
  event.preventDefault();
  const p=point(event);
  pointer=event.pointerId;
  canvas.setPointerCapture(pointer);
  stroke={tool,points:[p]};
  if(!sketches.has(key))sketches.set(key,[]);
  sketches.get(key).push(stroke);
  paint(stroke,p,p);updateTools();
 });
 function appendPoint(event){
  if(event.pointerId!==pointer||!stroke)return;
  const p=point(event),previous=stroke.points.at(-1);
  if(previous.x===p.x&&previous.y===p.y)return;
  stroke.points.push(p);paint(stroke,previous,p);
 }
 canvas.addEventListener('pointermove',appendPoint);
 canvas.addEventListener('pointerup',event=>{
  if(event.pointerId===pointer){appendPoint(event);finish();}
 });
 for(const type of ['pointercancel','lostpointercapture']){
  canvas.addEventListener(type,event=>{if(event.pointerId===pointer)finish();});
 }
 questionButton.onclick=()=>setMode(false);
 board.addEventListener('cancel',event=>{event.preventDefault();setMode(false);});
 board.addEventListener('close',()=>{if(!board.open&&visible)setMode(false);});
 boardButton.onclick=()=>setMode(true);
 pen.onclick=()=>{tool='pen';updateTools();};
 eraser.onclick=()=>{tool='eraser';updateTools();};
 undo.onclick=()=>{finish();strokes().pop();redraw();updateTools();};
 clear.onclick=()=>{finish();sketches.delete(key);redraw();updateTools();};
 if(typeof ResizeObserver==='function')new ResizeObserver(redraw).observe(canvas);
 else window.addEventListener('resize',redraw);
 window.practiceWhiteboard={setTask};
})();
