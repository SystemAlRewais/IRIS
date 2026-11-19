(() => {
"use strict";
const $=id=>document.getElementById(id);
const cfg=window.IRIS_CONFIG||{API_BASE_URL:"",REQUEST_TIMEOUT_MS:30000};
let token=sessionStorage.getItem("iris_token")||"";
let player=null,activeSection="overview";
async function api(path,payload){
 if(!cfg.API_BASE_URL)throw new Error("لم يتم ربط خدمة IRIS السحابية بعد.");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),cfg.REQUEST_TIMEOUT_MS);
 try{
  const base=cfg.API_BASE_URL+(path.startsWith("?")?path:"?path="+encodeURIComponent(path));
  const url=payload?base:base+"&token="+encodeURIComponent(token);
  const response=await fetch(url,payload?{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,token}),signal:controller.signal}:{signal:controller.signal});
  const data=await response.json();if(!data.success)throw new Error(data.message||"تعذر تنفيذ الطلب.");return data;
 }finally{clearTimeout(timer);}
}
function message(text,isError=false){$("authMessage").textContent=text;$("authMessage").style.color=isError?"var(--red)":"var(--teal)";}
function showAuth(){ $("authView").classList.remove("hidden");$("playerView").classList.add("hidden"); }
function showPlayer(){ $("authView").classList.add("hidden");$("playerView").classList.remove("hidden"); }
document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",()=>{
 document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===btn));
 $("loginForm").classList.toggle("hidden",btn.dataset.tab!=="login");$("registerForm").classList.toggle("hidden",btn.dataset.tab!=="register");message("");
}));
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{message("جارٍ تسجيل الدخول...");const d=await api("/auth/login",{action:"login",identity:f.get("identity"),password:f.get("password")});token=d.token;sessionStorage.setItem("iris_token",token);player=d.player;showPlayer();await loadSection("overview");}catch(err){message(err.message,true);}});
$("registerForm").addEventListener("submit",async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{message("جارٍ إرسال طلبك...");const d=await api("/auth/register",{action:"register",...f});e.currentTarget.reset();message(d.message||"تم إرسال طلبك بنجاح. انتظر مراجعة الإدارة.");}catch(err){message(err.message,true);}});
async function loadSection(section){
 activeSection=section;$("playerContent").innerHTML='<p class="form-intro">جارٍ تحميل بياناتك...</p>';
 try{
  const d=await api("/api/player/"+section);
  if(section==="overview"){
   const p=d.player||player||{};player=p;$("playerName").textContent=p.full_name||"ملف اللاعب";$("playerTeam").textContent=(p.team_name||"لم يتم تحديد الفريق")+" · "+(p.player_code||"بانتظار اعتماد الحساب");
   const s=d.stats||{};$("playerContent").innerHTML='<div class="stat-grid">'+stat("المباريات",s.matches||0)+stat("الأهداف",s.goals||0)+stat("الألقاب",s.titles||0)+stat("البطولات",s.tournaments||0)+'</div><h3>آخر المستجدات</h3><p class="form-intro">سيظهر هنا آخر أخبار ومباريات IRIS.</p>';
  }else{$("playerContent").innerHTML=renderList(d.items||[]);}
 }catch(err){$("playerContent").textContent=err.message;}
}
function stat(label,value){return '<div class="stat"><b>'+Number(value||0)+'</b><span>'+label+'</span></div>';}
function renderList(items){if(!items.length)return '<p class="form-intro">لا توجد بيانات لعرضها حالياً.</p>';return items.map(x=>'<article class="list-item"><b>'+escapeHtml(x.title||x.subject||x.match_name||"طلب")+'</b><p>'+escapeHtml(x.status||x.reply||x.date||"")+'</p></article>').join("");}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
document.querySelectorAll(".player-nav [data-section]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".player-nav button").forEach(x=>x.classList.toggle("active",x===b));loadSection(b.dataset.section);}));
$("logoutBtn").addEventListener("click",()=>{token="";player=null;sessionStorage.removeItem("iris_token");showAuth();});
if(token){api("/api/player/overview").then(d=>{player=d.player;showPlayer();loadSection("overview");}).catch(()=>{token="";sessionStorage.removeItem("iris_token");showAuth();});}
})();