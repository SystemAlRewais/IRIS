/**
 * IRIS OFFICIAL — Google Apps Script API
 * Bind this project to the IRIS Google Sheet, or set Script Property:
 * IRIS_SPREADSHEET_ID = your spreadsheet ID
 *
 * Deploy as Web App: Execute as Me; access Anyone.
 * Keep the spreadsheet private. Admin access is controlled by this API.
 */

const IRIS = {
  VERSION: "1.0.0",
  SESSION_DAYS: 14,
  HASH_ROUNDS: 12000,
  SHEETS: {
    Settings: ["key","value","description","updated_at"],
    Admins: ["admin_id","username","full_name","password_hash","password_salt","role","status","created_at","last_login","initial_password"],
    RegistrationRequests: ["request_id","full_name","phone","position","password_hash","password_salt","photo_url","status","review_note","assigned_team_id","generated_player_code","submitted_at","reviewed_at","reviewed_by"],
    Players: ["player_id","player_code","full_name","phone","position","team_id","team_name","photo_url","status","joined_at","updated_at"],
    Teams: ["team_id","team_name","short_name","logo_url","color","captain_player_id","status","created_at"],
    Matches: ["match_id","season_id","match_number","home_team_id","away_team_id","home_score","away_score","venue","match_date","kickoff_time","status","round_name","notes","published","created_at","updated_at"],
    MatchEvents: ["event_id","match_id","player_id","team_id","event_type","minute","description","approved","created_at","created_by"],
    PlayerStats: ["stat_id","player_id","season_id","matches_played","goals","assists","clean_sheets","yellow_cards","red_cards","updated_at"],
    PlayerTitles: ["title_id","player_id","season_id","title_name","category","description","awarded_at","created_by"],
    Transfers: ["transfer_id","player_id","from_team_id","to_team_id","reason","status","requested_at","decided_at","decided_by"],
    PlayerRequests: ["request_id","player_id","request_type","match_id","subject","message","admin_reply","status","submitted_at","replied_at","handled_by"],
    Announcements: ["announcement_id","title","body","target_type","target_id","status","publish_at","created_at","created_by"],
    AuditLog: ["log_id","actor_id","actor_role","action","entity_type","entity_id","details","created_at"],
    Sessions: ["session_id","user_id","user_type","token_hash","role","expires_at","created_at","revoked_at"]
  }
};

/* Run once from the Apps Script editor after binding to the correct spreadsheet. */
function setupIRIS() {
  const ss = getDb_();
  Object.keys(IRIS.SHEETS).forEach(name => ensureSheet_(ss, name));
  provisionAdmins_();
  return "IRIS database ready: " + ss.getUrl();
}

function doGet(e) {
  try {
    const path = (e && e.parameter && e.parameter.path) || "/";
    const token = (e && e.parameter && e.parameter.token) || "";
    const result = route_(path, {}, token, "GET");
    return json_(result);
  } catch (err) {
    return json_({ success:false, message:safeMessage_(err) });
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const path = (e && e.parameter && e.parameter.path) || body.path || "/";
    const token = body.token || (e && e.parameter && e.parameter.token) || "";
    return json_(route_(path, body, token, "POST"));
  } catch (err) {
    return json_({ success:false, message:safeMessage_(err) });
  }
}

function route_(path, body, token, method) {
  provisionAdmins_();
  if (path === "/health") return {success:true, app:"IRIS", version:IRIS.VERSION, time:new Date().toISOString()};
  if (path === "/auth/register" && method === "POST") return registerPlayer_(body);
  if (path === "/auth/login" && method === "POST") return loginPlayer_(body);
  if (path === "/admin/login" && method === "POST") return loginAdmin_(body);

  const session = requireSession_(token);
  if (path === "/auth/logout" && method === "POST") { revokeSession_(session.token_hash); return {success:true}; }
  if (path.indexOf("/api/player/") === 0) {
    if (session.user_type !== "player") throw new Error("هذه الخدمة مخصصة لحسابات اللاعبين.");
    return playerApi_(path.substring("/api/player/".length), session, body, method);
  }
  if (path.indexOf("/admin/") === 0) {
    if (session.user_type !== "admin") throw new Error("غير مصرح لك بالدخول إلى الإدارة.");
    return adminApi_(path.substring("/admin/".length), body, session, method);
  }
  throw new Error("الخدمة المطلوبة غير موجودة.");
}

/* ----------------------------- AUTH ----------------------------- */

function registerPlayer_(b) {
  const name = clean_(b.full_name, 100);
  const phone = clean_(b.phone, 30);
  const position = clean_(b.position, 50);
  const password = String(b.password || "");
  if (name.split(/\s+/).filter(Boolean).length < 3) throw new Error("اكتب الاسم الثلاثي كاملاً.");
  if (phone.replace(/\D/g,"").length < 8) throw new Error("رقم الهاتف غير صحيح.");
  if (password.length < 8) throw new Error("كلمة المرور يجب ألا تقل عن 8 أحرف.");
  if (!position) throw new Error("اختر مركزك في الملعب.");
  const sh = sheet_("RegistrationRequests");
  const duplicate = rows_("RegistrationRequests").some(r => String(r.phone) === phone && ["pending","approved"].indexOf(String(r.status)) >= 0);
  const existing = rows_("Players").some(r => String(r.phone) === phone);
  if (duplicate || existing) throw new Error("رقم الهاتف مسجل بالفعل أو لديه طلب قيد المراجعة.");
  const salt = Utilities.getUuid() + Utilities.getUuid();
  const hash = hashPassword_(password, salt);
  const id = uid_("REG");
  append_("RegistrationRequests", {
    request_id:id, full_name:name, phone:phone, position:position,
    password_hash:hash, password_salt:salt, photo_url:"",
    status:"pending", review_note:"", assigned_team_id:"",
    generated_player_code:"", submitted_at:new Date(), reviewed_at:"", reviewed_by:""
  });
  audit_("public","visitor","registration_submitted","RegistrationRequests",id,{phone:phone});
  return {success:true,message:"تم استلام طلبك بنجاح. سيظهر حسابك بعد مراجعة الإدارة وتحديد فريقك."};
}

function loginPlayer_(b) {
  const identity = clean_(b.identity, 100);
  const password = String(b.password || "");
  const players = rows_("Players");
  let player = players.find(p => String(p.player_code) === identity || String(p.phone) === identity);
  if (!player) {
    const pending = rows_("RegistrationRequests").some(r => String(r.phone) === identity && r.status === "pending");
    if (pending) throw new Error("طلبك قيد المراجعة. ستتمكن من الدخول بعد اعتماد الإدارة.");
    throw new Error("بيانات الدخول غير صحيحة.");
  }
  if (player.status !== "active") throw new Error("الحساب غير مفعل حالياً. تواصل مع الإدارة.");
  const req = rows_("RegistrationRequests").find(r => r.generated_player_code === player.player_code);
  const hash = req ? req.password_hash : "";
  const salt = req ? req.password_salt : "";
  if (!hash || !safeEqual_(hashPassword_(password,salt),hash)) throw new Error("بيانات الدخول غير صحيحة.");
  const token = createSession_(player.player_id,"player","");
  return {success:true,token:token,player:publicPlayer_(player)};
}

function loginAdmin_(b) {
  const username = clean_(b.username || b.identity, 80).toLowerCase();
  const password = String(b.password || "");
  const admin = rows_("Admins").find(a => String(a.username).toLowerCase() === username && a.status === "active");
  if (!admin || !admin.password_hash || !safeEqual_(hashPassword_(password,admin.password_salt),admin.password_hash)) {
    throw new Error("بيانات دخول الإدارة غير صحيحة.");
  }
  updateById_("Admins","admin_id",admin.admin_id,{last_login:new Date()});
  const token = createSession_(admin.admin_id,"admin",admin.role);
  audit_(admin.admin_id,"admin","admin_login","Admins",admin.admin_id,{});
  return {success:true,token:token,admin:{admin_id:admin.admin_id,username:admin.username,full_name:admin.full_name,role:admin.role}};
}

function createSession_(userId,userType,role) {
  const token = Utilities.getUuid().replace(/-/g,"") + Utilities.getUuid().replace(/-/g,"");
  const now = new Date();
  append_("Sessions",{
    session_id:uid_("SES"),user_id:userId,user_type:userType,token_hash:sha256_(token),
    role:role,expires_at:new Date(now.getTime()+IRIS.SESSION_DAYS*86400000),created_at:now,revoked_at:""
  });
  return token;
}

function requireSession_(token) {
  if (!token) throw new Error("انتهت الجلسة. سجل الدخول مرة أخرى.");
  const hash = sha256_(token);
  const s = rows_("Sessions").find(x => x.token_hash === hash && !x.revoked_at);
  if (!s || new Date(s.expires_at).getTime() < Date.now()) throw new Error("الجلسة غير صالحة أو انتهت. سجل الدخول مرة أخرى.");
  if (s.user_type === "player") {
    const p = rows_("Players").find(x => x.player_id === s.user_id);
    if (!p || p.status !== "active") throw new Error("الحساب غير مفعل.");
  } else if (s.user_type === "admin") {
    const a = rows_("Admins").find(x => x.admin_id === s.user_id && x.status === "active");
    if (!a) throw new Error("تم إيقاف حساب الإدارة.");
    s.role = a.role;
  }
  return s;
}

/* -------------------------- PLAYER API -------------------------- */

function playerApi_(section, session, body, method) {
  const p = rows_("Players").find(x => x.player_id === session.user_id);
  if (!p) throw new Error("لم يتم العثور على ملف اللاعب.");
  if (section === "overview") {
    const stats = rows_("PlayerStats").filter(x => x.player_id === p.player_id);
    const titles = rows_("PlayerTitles").filter(x => x.player_id === p.player_id);
    const events = rows_("MatchEvents").filter(x => x.player_id === p.player_id && truth_(x.approved));
    const matches = rows_("Matches").filter(m => [m.home_team_id,m.away_team_id].indexOf(p.team_id)>=0 && m.status === "completed");
    const announcements=rows_("Announcements").filter(a=>a.status==="published" && (a.target_type==="all" || (a.target_type==="team" && a.target_id===p.team_id))).slice(-5).reverse();
    return {success:true,player:publicPlayer_(p),stats:{
      matches:stats.reduce((n,x)=>n+num_(x.matches_played),0) || matches.length,
      goals:stats.reduce((n,x)=>n+num_(x.goals),0) || events.filter(x=>x.event_type==="goal").length,
      assists:stats.reduce((n,x)=>n+num_(x.assists),0),
      clean_sheets:stats.reduce((n,x)=>n+num_(x.clean_sheets),0),
      yellow_cards:stats.reduce((n,x)=>n+num_(x.yellow_cards),0),
      red_cards:stats.reduce((n,x)=>n+num_(x.red_cards),0),
      titles:titles.length,
      tournaments:[...new Set(titles.map(x=>x.season_id).filter(Boolean))].length
    },recent_titles:titles.slice(-5).reverse(),announcements:announcements};
  }
  if (section === "matches") {
    const teamIds = [p.team_id];
    const all = rows_("Matches").filter(m => teamIds.indexOf(m.home_team_id)>=0 || teamIds.indexOf(m.away_team_id)>=0);
    return {success:true,items:all.sort((a,b)=>dateValue_(b.match_date)-dateValue_(a.match_date)).map(m=>({
      match_id:m.match_id,match_name:teamName_(m.home_team_id)+" × "+teamName_(m.away_team_id),
      date:m.match_date,score:m.status==="completed" ? m.home_score+" - "+m.away_score : "لم تلعب بعد",
      status:m.status,venue:m.venue
    }))};
  }
  if (section === "requests" && method === "POST") {
    const type=clean_(body.request_type,40),subject=clean_(body.subject,120),message=clean_(body.message,2000);
    if(["apology","complaint","match_report","transfer","other"].indexOf(type)<0) throw new Error("نوع الطلب غير صحيح.");
    if(!subject||!message) throw new Error("اكتب عنوان الطلب والتفاصيل.");
    const id=uid_("REQ");
    append_("PlayerRequests",{request_id:id,player_id:p.player_id,request_type:type,match_id:clean_(body.match_id,80),subject:subject,message:message,admin_reply:"",status:"pending",submitted_at:new Date(),replied_at:"",handled_by:""});
    audit_(p.player_id,"player","request_submitted","PlayerRequests",id,{request_type:type});
    return {success:true,message:"تم إرسال طلبك إلى الإدارة بنجاح.",request_id:id};
  }
  if (section === "requests" && method === "GET") {
    return {success:true,items:rows_("PlayerRequests").filter(x=>x.player_id===p.player_id).reverse().map(x=>({
      request_id:x.request_id,subject:x.subject,request_type:x.request_type,status:x.status,reply:x.admin_reply,submitted_at:x.submitted_at
    }))};
  }
  if (section === "profile") {
    const transfers = rows_("Transfers").filter(x=>x.player_id===p.player_id && x.status==="approved");
    const titles = rows_("PlayerTitles").filter(x=>x.player_id===p.player_id);
    return {success:true,player:publicPlayer_(p),transfers:transfers,titles:titles};
  }
  throw new Error("قسم اللاعب غير موجود.");
}

/* -------------------------- ADMIN API --------------------------- */

function adminApi_(section,b,session,method) {
  const admin = rows_("Admins").find(x=>x.admin_id===session.user_id);
  const role = admin.role || "admin";
  if (role === "reviewer" && ["dashboard","profile","registrations","requests"].indexOf(section)<0) throw new Error("صلاحياتك لا تسمح بهذا الإجراء.");
  if (section === "profile") return {success:true,admin:{admin_id:admin.admin_id,username:admin.username,full_name:admin.full_name,role:role}};
  if (section === "dashboard") return {success:true,counts:{
    players:rows_("Players").filter(x=>x.status==="active").length,
    pending_registrations:rows_("RegistrationRequests").filter(x=>x.status==="pending").length,
    teams:rows_("Teams").filter(x=>x.status==="active").length,
    upcoming_matches:rows_("Matches").filter(x=>x.status==="scheduled").length,
    open_requests:rows_("PlayerRequests").filter(x=>["pending","in_review"].indexOf(x.status)>=0).length
  }};
  if (section === "registrations") return {success:true,items:rows_("RegistrationRequests").filter(x=>x.status==="pending").map(publicRegistration_)};
  if (section === "players") return {success:true,items:rows_("Players").map(publicPlayer_)};
  if (section === "teams") return {success:true,items:rows_("Teams")};
  if (section === "matches") return {success:true,items:rows_("Matches").reverse()};
  if (section === "requests") return {success:true,items:rows_("PlayerRequests").reverse()};
  if (section === "announcements") return {success:true,items:rows_("Announcements").reverse()};
  if (section === "audit-log") return {success:true,items:rows_("AuditLog").slice(-150).reverse()};
  if (section === "admin-users") {
    if(role!=="super_admin") throw new Error("إدارة حسابات المشرفين متاحة للمدير الأعلى فقط.");
    return {success:true,items:rows_("Admins").map(a=>({admin_id:a.admin_id,username:a.username,full_name:a.full_name,role:a.role,status:a.status,last_login:a.last_login}))};
  }
  if (section === "create-admin") {
    requireMethodPost_(b,method);
    if(role!=="super_admin") throw new Error("إضافة المشرفين متاحة للمدير الأعلى فقط.");
    const username=clean_(b.username,80).toLowerCase(),fullName=clean_(b.full_name,100),password=String(b.password||""),newRole=clean_(b.role,30);
    if(!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error("اسم المستخدم يجب أن يكون 3 أحرف على الأقل وبالإنجليزية.");
    if(fullName.length<3||password.length<10||["admin","reviewer"].indexOf(newRole)<0) throw new Error("راجع الاسم وكلمة المرور (10 أحرف على الأقل) والصلاحية.");
    if(rows_("Admins").some(a=>String(a.username).toLowerCase()===username)) throw new Error("اسم المستخدم مستخدم بالفعل.");
    const salt=Utilities.getUuid()+Utilities.getUuid(),id=uid_("ADM");
    append_("Admins",{admin_id:id,username:username,full_name:fullName,password_hash:hashPassword_(password,salt),password_salt:salt,role:newRole,status:"active",created_at:new Date(),last_login:"",initial_password:""});
    audit_(admin.admin_id,"admin","admin_created","Admins",id,{username:username,role:newRole});
    return {success:true,admin_id:id};
  }
  if (section === "set-admin-status") {
    requireMethodPost_(b,method);
    if(role!=="super_admin") throw new Error("إدارة المشرفين متاحة للمدير الأعلى فقط.");
    const target=rows_("Admins").find(a=>a.admin_id===b.admin_id);
    if(!target||target.admin_id===admin.admin_id) throw new Error("لا يمكن تعديل هذا الحساب.");
    const status=b.status==="active"?"active":"suspended";
    updateById_("Admins","admin_id",target.admin_id,{status:status});
    audit_(admin.admin_id,"admin","admin_status_changed","Admins",target.admin_id,{status:status});
    return {success:true};
  }
  if (section === "set-player-status") {
    requireMethodPost_(b,method);
    const p=rows_("Players").find(x=>x.player_id===b.player_id);if(!p)throw new Error("اللاعب غير موجود.");
    const status=b.status==="active"?"active":"suspended";
    updateById_("Players","player_id",p.player_id,{status:status,updated_at:new Date()});
    audit_(admin.admin_id,"admin","player_status_changed","Players",p.player_id,{status:status});
    return {success:true};
  }
  if (section === "set-team-status") {
    requireMethodPost_(b,method);
    const t=rows_("Teams").find(x=>x.team_id===b.team_id);if(!t)throw new Error("الفريق غير موجود.");
    const status=b.status==="active"?"active":"inactive";
    updateById_("Teams","team_id",t.team_id,{status:status});
    audit_(admin.admin_id,"admin","team_status_changed","Teams",t.team_id,{status:status});
    return {success:true};
  }

  if (section === "approve-registration") {
    requireMethodPost_(b,method);
    const lock=LockService.getScriptLock();lock.waitLock(20000);
    try {
      const req=rows_("RegistrationRequests").find(x=>x.request_id===b.request_id && x.status==="pending");
      if(!req) throw new Error("طلب التسجيل غير موجود أو تمت مراجعته.");
      const team=rows_("Teams").find(x=>x.team_id===b.team_id && x.status==="active");
      if(!team) throw new Error("اختر فريقاً صحيحاً ومفعلاً.");
      const code=nextPlayerCode_();
      const playerId=uid_("PLY");
      append_("Players",{player_id:playerId,player_code:code,full_name:req.full_name,phone:req.phone,position:req.position,team_id:team.team_id,team_name:team.team_name,photo_url:req.photo_url||"",status:"active",joined_at:new Date(),updated_at:new Date()});
      updateById_("RegistrationRequests","request_id",req.request_id,{status:"approved",assigned_team_id:team.team_id,generated_player_code:code,reviewed_at:new Date(),reviewed_by:admin.admin_id});
      audit_(admin.admin_id,"admin","registration_approved","RegistrationRequests",req.request_id,{player_id:playerId,team_id:team.team_id,player_code:code});
      return {success:true,message:"تم قبول اللاعب وتوليد كود اللاعب.",player_code:code,player_id:playerId};
    } finally {lock.releaseLock();}
  }
  if (section === "reject-registration") {
    requireMethodPost_(b,method);
    const req=rows_("RegistrationRequests").find(x=>x.request_id===b.request_id && x.status==="pending");
    if(!req) throw new Error("الطلب غير موجود.");
    updateById_("RegistrationRequests","request_id",req.request_id,{status:"rejected",review_note:clean_(b.reason,500),reviewed_at:new Date(),reviewed_by:admin.admin_id});
    audit_(admin.admin_id,"admin","registration_rejected","RegistrationRequests",req.request_id,{reason:b.reason||""});
    return {success:true,message:"تم رفض طلب التسجيل."};
  }
  if (section === "create-team") {
    requireMethodPost_(b,method);const name=clean_(b.team_name,80);if(!name)throw new Error("اكتب اسم الفريق.");
    const id=uid_("TEM");append_("Teams",{team_id:id,team_name:name,short_name:clean_(b.short_name,15),logo_url:"",color:clean_(b.color,20),captain_player_id:"",status:"active",created_at:new Date()});
    audit_(admin.admin_id,"admin","team_created","Teams",id,{team_name:name});return {success:true,team_id:id};
  }
  if (section === "create-match") {
    requireMethodPost_(b,method);
    if(!teamExists_(b.home_team_id)||!teamExists_(b.away_team_id)||b.home_team_id===b.away_team_id)throw new Error("حدد فريقين مختلفين وصحيحين.");
    const id=uid_("MAT");append_("Matches",{match_id:id,season_id:clean_(b.season_id,50),match_number:clean_(b.match_number,20),home_team_id:b.home_team_id,away_team_id:b.away_team_id,home_score:"",away_score:"",venue:clean_(b.venue,100),match_date:clean_(b.match_date,30),kickoff_time:clean_(b.kickoff_time,20),status:"scheduled",round_name:clean_(b.round_name,60),notes:clean_(b.notes,500),published:b.published===false?"FALSE":"TRUE",created_at:new Date(),updated_at:new Date()});
    audit_(admin.admin_id,"admin","match_created","Matches",id,{});return {success:true,match_id:id};
  }
  if (section === "add-match-event") {
    requireMethodPost_(b,method);
    const match=rows_("Matches").find(x=>x.match_id===b.match_id),player=rows_("Players").find(x=>x.player_id===b.player_id);
    const allowed=["goal","assist","yellow_card","red_card"];
    if(!match||!player) throw new Error("المباراة أو اللاعب غير موجود.");
    if([match.home_team_id,match.away_team_id].indexOf(player.team_id)<0) throw new Error("اللاعب ليس ضمن أحد فريقي المباراة.");
    const type=clean_(b.event_type,30);if(allowed.indexOf(type)<0) throw new Error("نوع الحدث غير صحيح.");
    const minute=num_(b.minute);if(minute<0||minute>150) throw new Error("الدقيقة غير صحيحة.");
    const id=uid_("EVT");
    append_("MatchEvents",{event_id:id,match_id:match.match_id,player_id:player.player_id,team_id:player.team_id,event_type:type,minute:minute,description:clean_(b.description,200),approved:true,created_at:new Date(),created_by:admin.admin_id});
    recalcStats_(match.season_id);
    audit_(admin.admin_id,"admin","match_event_added","MatchEvents",id,{match_id:match.match_id,player_id:player.player_id,event_type:type});
    return {success:true,event_id:id};
  }
  if (section === "set-result") {
    requireMethodPost_(b,method);
    const match=rows_("Matches").find(x=>x.match_id===b.match_id);if(!match)throw new Error("المباراة غير موجودة.");
    const hs=Number(b.home_score),as=Number(b.away_score);if(!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0)throw new Error("النتيجة غير صحيحة.");
    updateById_("Matches","match_id",match.match_id,{home_score:hs,away_score:as,status:"completed",updated_at:new Date()});
    if(Array.isArray(b.events)) b.events.forEach(ev=>append_("MatchEvents",{event_id:uid_("EVT"),match_id:match.match_id,player_id:clean_(ev.player_id,80),team_id:clean_(ev.team_id,80),event_type:clean_(ev.event_type,30),minute:num_(ev.minute),description:clean_(ev.description,200),approved:true,created_at:new Date(),created_by:admin.admin_id}));
    recalcStats_(match.season_id);
    audit_(admin.admin_id,"admin","match_result_saved","Matches",match.match_id,{home_score:hs,away_score:as});
    return {success:true,message:"تم حفظ النتيجة والإحصائيات."};
  }
  if (section === "reply-request") {
    requireMethodPost_(b,method);const req=rows_("PlayerRequests").find(x=>x.request_id===b.request_id);if(!req)throw new Error("الطلب غير موجود.");
    updateById_("PlayerRequests","request_id",req.request_id,{admin_reply:clean_(b.reply,1500),status:clean_(b.status,30)||"answered",replied_at:new Date(),handled_by:admin.admin_id});
    audit_(admin.admin_id,"admin","request_replied","PlayerRequests",req.request_id,{status:b.status||"answered"});return {success:true};
  }
  if (section === "transfer-player") {
    requireMethodPost_(b,method);const p=rows_("Players").find(x=>x.player_id===b.player_id);const team=rows_("Teams").find(x=>x.team_id===b.to_team_id&&x.status==="active");
    if(!p||!team)throw new Error("اللاعب أو الفريق غير موجود.");
    append_("Transfers",{transfer_id:uid_("TRN"),player_id:p.player_id,from_team_id:p.team_id,to_team_id:team.team_id,reason:clean_(b.reason,500),status:"approved",requested_at:new Date(),decided_at:new Date(),decided_by:admin.admin_id});
    updateById_("Players","player_id",p.player_id,{team_id:team.team_id,team_name:team.team_name,updated_at:new Date()});
    audit_(admin.admin_id,"admin","player_transferred","Players",p.player_id,{from:p.team_id,to:team.team_id});return {success:true};
  }
  if (section === "add-title") {
    requireMethodPost_(b,method);const p=rows_("Players").find(x=>x.player_id===b.player_id);if(!p)throw new Error("اللاعب غير موجود.");
    const id=uid_("TTL");append_("PlayerTitles",{title_id:id,player_id:p.player_id,season_id:clean_(b.season_id,50),title_name:clean_(b.title_name,100),category:clean_(b.category,50),description:clean_(b.description,500),awarded_at:new Date(),created_by:admin.admin_id});
    audit_(admin.admin_id,"admin","player_title_added","PlayerTitles",id,{player_id:p.player_id});return {success:true,title_id:id};
  }
  if (section === "create-announcement") {
    requireMethodPost_(b,method);const id=uid_("ANN");append_("Announcements",{announcement_id:id,title:clean_(b.title,120),body:clean_(b.body,3000),target_type:clean_(b.target_type,30)||"all",target_id:clean_(b.target_id,80),status:"published",publish_at:new Date(),created_at:new Date(),created_by:admin.admin_id});
    audit_(admin.admin_id,"admin","announcement_created","Announcements",id,{});return {success:true,announcement_id:id};
  }
  if (section === "logout") { revokeSession_(session.token_hash); return {success:true}; }
  throw new Error("أمر الإدارة غير معروف.");
}

/* --------------------------- SHEETS ----------------------------- */

function getDb_() {
  const id=PropertiesService.getScriptProperties().getProperty("IRIS_SPREADSHEET_ID");
  if(id) return SpreadsheetApp.openById(id);
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss) throw new Error("اربط Apps Script بملف Google Sheets أو اضبط IRIS_SPREADSHEET_ID في Script Properties.");
  return ss;
}
function ensureSheet_(ss,name) {
  let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);
  const headers=IRIS.SHEETS[name];
  if(sh.getLastRow()===0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  else {
    const current=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),1)).getValues()[0].map(String);
    headers.forEach(h=>{if(current.indexOf(h)<0){sh.getRange(1,sh.getLastColumn()+1).setValue(h);current.push(h);}});
  }
  sh.setFrozenRows(1);return sh;
}
function sheet_(name){return ensureSheet_(getDb_(),name);}
function rows_(name) {
  const sh=sheet_(name),values=sh.getDataRange().getValues();if(values.length<2)return [];
  const headers=values[0].map(String);
  return values.slice(1).filter(row=>row.some(v=>v!=="")).map(row=>{const o={};headers.forEach((h,i)=>o[h]=row[i]);return o;});
}
function append_(name,obj) {
  const sh=sheet_(name),headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  sh.appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(obj,h)?obj[h]:""));return obj;
}
function updateById_(name,key,id,patch) {
  const sh=sheet_(name),values=sh.getDataRange().getValues(),headers=values[0].map(String),ki=headers.indexOf(key);
  for(let r=1;r<values.length;r++)if(String(values[r][ki])===String(id)){
    Object.keys(patch).forEach(k=>{const c=headers.indexOf(k);if(c>=0)sh.getRange(r+1,c+1).setValue(patch[k]);});return true;
  }
  throw new Error("تعذر العثور على السجل المطلوب.");
}

/* ---------------------- ADMIN PROVISIONING ---------------------- */
/*
 * To add an admin from the sheet:
 * Add a row in Admins and fill username, full_name, initial_password,
 * role (super_admin/admin/reviewer), and status=active.
 * The next API call hashes initial_password and clears that cell.
 */
function provisionAdmins_() {
  const sh=sheet_("Admins"),headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const ix={};headers.forEach((h,i)=>ix[h]=i);
  if(ix.initial_password===undefined)return;
  const values=sh.getDataRange().getValues();
  for(let r=1;r<values.length;r++){
    const row=values[r],temp=String(row[ix.initial_password]||"");
    if(!temp)continue;
    const username=String(row[ix.username]||"").trim();
    if(!username)continue;
    if(temp.length<8)throw new Error("كلمة مرور الأدمن المؤقتة يجب أن تكون 8 أحرف على الأقل.");
    const salt=Utilities.getUuid()+Utilities.getUuid();
    const hash=hashPassword_(temp,salt);
    if(!row[ix.admin_id])sh.getRange(r+1,ix.admin_id+1).setValue(uid_("ADM"));
    if(!row[ix.password_salt])sh.getRange(r+1,ix.password_salt+1).setValue(salt);
    sh.getRange(r+1,ix.password_hash+1).setValue(hash);
    if(!row[ix.role])sh.getRange(r+1,ix.role+1).setValue("admin");
    if(!row[ix.status])sh.getRange(r+1,ix.status+1).setValue("active");
    if(!row[ix.created_at])sh.getRange(r+1,ix.created_at+1).setValue(new Date());
    sh.getRange(r+1,ix.initial_password+1).clearContent();
  }
}

/* -------------------------- UTILITIES --------------------------- */

function hashPassword_(password,salt) {
  let value=String(password)+"|"+String(salt);
  for(let i=0;i<IRIS.HASH_ROUNDS;i++) value=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8));
  return value;
}
function sha256_(value){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8));}
function safeEqual_(a,b){a=String(a);b=String(b);if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function uid_(prefix){return prefix+"-"+Utilities.getUuid().replace(/-/g,"").substring(0,12).toUpperCase();}
function nextPlayerCode_(){const n=rows_("Players").length+1;return "IRIS-"+String(n).padStart(4,"0");}
function clean_(v,max){return String(v==null?"":v).trim().replace(/[<>]/g,"").substring(0,max||500);}
function num_(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function truth_(v){return v===true||String(v).toLowerCase()==="true"||String(v)==="1";}
function dateValue_(v){const d=new Date(v);return isNaN(d.getTime())?0:d.getTime();}
function teamExists_(id){return rows_("Teams").some(t=>t.team_id===id&&t.status==="active");}
function teamName_(id){const t=rows_("Teams").find(x=>x.team_id===id);return t?t.team_name:"فريق";}
function publicPlayer_(p){return {player_id:p.player_id,player_code:p.player_code,full_name:p.full_name,phone:p.phone,position:p.position,team_id:p.team_id,team_name:p.team_name,photo_url:p.photo_url,status:p.status,joined_at:p.joined_at};}
function publicRegistration_(r){return {request_id:r.request_id,full_name:r.full_name,phone:r.phone,position:r.position,status:r.status,submitted_at:r.submitted_at};}
function audit_(actorId,role,action,type,id,details){append_("AuditLog",{log_id:uid_("LOG"),actor_id:actorId,actor_role:role,action:action,entity_type:type,entity_id:id,details:JSON.stringify(details||{}),created_at:new Date()});}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
function safeMessage_(err){return err&&err.message?err.message:"حدث خطأ غير متوقع.";}
function requireMethodPost_(b,method){if(method!=="POST")throw new Error("هذا الإجراء يتطلب POST.");if(!b||typeof b!=="object")throw new Error("طلب غير صالح.");}
function recalcStats_(seasonId) {
  const players=rows_("Players"),matches=rows_("Matches").filter(m=>m.status==="completed" && (!seasonId || String(m.season_id)===String(seasonId)));
  const matchIds=matches.map(m=>m.match_id);
  const events=rows_("MatchEvents").filter(e=>truth_(e.approved) && matchIds.indexOf(e.match_id)>=0);
  players.forEach(p=>{
    const pe=events.filter(e=>e.player_id===p.player_id);
    const played=matches.filter(m=>m.home_team_id===p.team_id || m.away_team_id===p.team_id).length;
    const cleanSheets=p.position==="حارس مرمى" ? matches.filter(m=>{
      const home=m.home_team_id===p.team_id,away=m.away_team_id===p.team_id;
      return (home && num_(m.away_score)===0) || (away && num_(m.home_score)===0);
    }).length : 0;
    const existing=rows_("PlayerStats").find(s=>s.player_id===p.player_id&&String(s.season_id)===String(seasonId||""));
    const obj={player_id:p.player_id,season_id:seasonId||"",matches_played:played,goals:pe.filter(e=>e.event_type==="goal").length,assists:pe.filter(e=>e.event_type==="assist").length,clean_sheets:cleanSheets,yellow_cards:pe.filter(e=>e.event_type==="yellow_card").length,red_cards:pe.filter(e=>e.event_type==="red_card").length,updated_at:new Date()};
    if(existing)updateById_("PlayerStats","stat_id",existing.stat_id,obj);
    else {obj.stat_id=uid_("STA");append_("PlayerStats",obj);}
  });
}
function revokeSession_(hash){const sh=sheet_("Sessions"),v=sh.getDataRange().getValues(),h=v[0].map(String);const ix=h.indexOf("token_hash");for(let r=1;r<v.length;r++)if(v[r][ix]===hash){sh.getRange(r+1,h.indexOf("revoked_at")+1).setValue(new Date());return;}}
