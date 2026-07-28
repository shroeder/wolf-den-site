import fs from "node:fs";
const BASE="https://www.wolfdengamingmn.com";
const env=fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env","utf8");
const pick=k=>(env.match(new RegExp(`^${k}=(.+)$`,"m"))||[])[1]?.trim().replace(/^["']|["']$/g,"");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
const token=(await (await fetch(BASE+"/api/admin-app/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:pick("ADMIN_APP_OWNER_EMAIL"),password:pick("ADMIN_APP_OWNER_PASSWORD")})})).json()).token;
log("waiting ~135s for deploy…"); await sleep(135000);
for(let a=1;a<=3;a++){
  const r=await fetch(BASE+"/api/admin/town-art",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({key:"tavern_interior"})});
  const d=await r.json().catch(()=>null);
  if(r.ok&&d?.url){ log("✓ tavern_interior -> "+d.url.slice(0,64)); break; }
  log(`… HTTP ${r.status}`); if(r.status<500&&r.status!==404) break; await sleep(20000);
}
log("done");
