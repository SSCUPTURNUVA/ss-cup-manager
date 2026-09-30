import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

function phone(v){const x=String(v||"").replace(/\D/g,"");if(!x)return"";return x.startsWith("90")?x:`90${x.replace(/^0/,"")}`;}
function fmtDate(v){if(!v)return"";try{return new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"long",year:"numeric"}).format(new Date(`${v}T12:00:00`));}catch{return v;}}
function getMatches(k,type){
  if(type==="quarter") return k?.quarterFinals||k?.quarters||k?.quarter||k?.matches||[];
  if(type==="semi") return k?.semiFinals||k?.semifinals||k?.semi||[];
  if(type==="third"){const m=k?.thirdPlace||k?.third||k?.thirdPlaceMatch;return m?[m]:[];}
  if(type==="final"){const m=k?.final||k?.finalMatch;return m?[m]:[];}
  return[];
}
export default function KnockoutMessages({settings={},standings=[]}){
 const [k,setK]=useState({}),[contacts,setContacts]=useState({}),[openCards,setOpenCards]=useState({});
 useEffect(()=>{let live=true;const load=async()=>{const {data}=await supabase.from("app_state").select("id,value").in("id",["knockout","knockout_draw","team_contacts"]);if(!live)return;const m={};(data||[]).forEach(x=>m[x.id]=x.value);setK(m.knockout||m.knockout_draw||{});setContacts(m.team_contacts||{});};load();const ch=supabase.channel(`ko-congrats-${Date.now()}`).on("postgres_changes",{event:"*",schema:"public",table:"app_state"},load).subscribe();return()=>{live=false;supabase.removeChannel(ch)}},[]);
 const cards=useMemo(()=>[
  ...(standings||[]).slice(0,8).map((row,i)=>({type:"quarter",m:{home:row?.team||row?.name||"",away:""},i,team:row?.team||row?.name||""})).filter(x=>x.team),
  ...getMatches(k,"semi").flatMap((m,i)=>m?.home&&m?.away?[{type:"semi",m,i,team:m.home},{type:"semi",m,i,team:m.away}]:[]),
  ...getMatches(k,"third").flatMap((m,i)=>m?.home&&m?.away?[{type:"third",m,i,team:m.home},{type:"third",m,i,team:m.away}]:[]),
  ...getMatches(k,"final").flatMap((m,i)=>m?.home&&m?.away?[{type:"final",m,i,team:m.home},{type:"final",m,i,team:m.away}]:[])
 ],[k,standings]);
 function text(c){
  const team=c.team;
  let stage="",p1="",p2="";
  if(c.type==="quarter"){stage="ÇEYREK FİNAL";p1=`${team} göstermiş olduğu mücadele ve başarılı performans sonucunda *S&S CUP ÇEYREK FİNAL* etabına yükselmeye hak kazanmıştır. ⚽🔥`;p2="Bu güzel başarıdan dolayı takımınızı, oyuncularınızı ve emeği geçen herkesi tebrik ediyor; çeyrek final mücadelenizde başarılar diliyoruz."}
  if(c.type==="semi"){stage="YARI FİNAL";p1=`${team} göstermiş olduğu mücadele ve başarılı performans sonucunda *S&S CUP YARI FİNAL* etabına yükselmeye hak kazanmıştır. ⚽🔥`;p2="Bu güzel başarıdan dolayı takımınızı, oyuncularınızı ve emeği geçen herkesi tebrik ediyor; yarı final mücadelenizde başarılar diliyoruz."}
  if(c.type==="final"){stage="FİNAL";p1=`${team} turnuva boyunca göstermiş olduğu mücadele ve başarılı performans sonucunda *S&S CUP FİNALİNE* yükselmeye hak kazanmıştır. 🏆🔥`;p2="Bu önemli başarıdan dolayı takımınızı, oyuncularınızı ve emeği geçen herkesi tebrik ediyor; büyük final mücadelenizde başarılar diliyoruz."}
  if(c.type==="third"){stage="3.'LÜK";p1=`${team} turnuva boyunca göstermiş olduğu mücadele ve başarılı performansıyla *S&S CUP 3.'LÜK* mücadelesinde yer almaya hak kazanmıştır. ⚽🔥`;p2="Takımınızı, oyuncularınızı ve emeği geçen herkesi tebrik ediyor; 3.'lük karşılaşmasında başarılar diliyoruz."}
  return `🏆 *TEBRİKLER!*\n\n${p1}\n\n${p2}\n\n*S&S CUP Organizasyon*\n*Serkan Toy & Soner Özkan*`;
 }
 function send(c,name,num){const p=phone(num);if(!p){alert("Bu sorumlunun telefon numarası kayıtlı değil.");return;}window.open(`https://wa.me/${p}?text=${encodeURIComponent(text(c))}`,"_blank");}
 const groups=[["quarter","ÇEYREK FİNAL"],["semi","YARI FİNAL"],["third","3.'LÜK"],["final","FİNAL"]];
 return <div className="km-page"><style>{css}</style><div className="km-head"><span>YÖNETİME ÖZEL</span><h1>🏆 Eleme Tebrik Mesajları</h1><p>Tur kesinleştikçe takım sorumlularına hazır WhatsApp tebrik mesajı.</p></div>
 {groups.map(([type,title])=>{const list=cards.filter(x=>x.type===type);return <section className="km-section" key={type}><div className="km-title"><b>{title}</b><small>{list.length?`${list.length} takım hazır`:"Henüz kesinleşmedi"}</small></div>{list.length?<div className="km-grid">{list.map((c,n)=>{const ct=contacts[c.team]||{};return <article className="km-card" key={`${type}-${c.team}-${n}`}><h2>{c.team}</h2><div className="km-vs">{c.type==="quarter" ? "🏅 Lig sıralaması: İlk 8" : <>🆚 {c.team===c.m.home?c.m.away:c.m.home}</>}</div><button type="button" className="km-preview" onClick={()=>setOpenCards(prev=>({...prev,[`${type}-${c.team}-${n}`]:!prev[`${type}-${c.team}-${n}`]}))}>{openCards[`${type}-${c.team}-${n}`]?"🙈 Mesajı Gizle":"👁 Mesajı Gör"}</button>{openCards[`${type}-${c.team}-${n}`]&&<pre>{text(c)}</pre>}<div className="km-actions">{ct.manager1&&<button onClick={()=>send(c,ct.manager1,ct.phone1)}>📲 {ct.manager1}</button>}{ct.manager2&&<button onClick={()=>send(c,ct.manager2,ct.phone2)}>📲 {ct.manager2}</button>}{!ct.manager1&&!ct.manager2&&<em>Sorumlu kaydı yok</em>}</div></article>})}</div>:<div className="km-empty">Bu turdaki takımlar belli olduğunda mesajlar otomatik burada oluşacak.</div>}</section>})}
 </div>
}
const css=`
.km-page{display:grid;gap:16px}.km-head,.km-section{background:linear-gradient(180deg,#111722,#090e16);border:1px solid #273244;border-radius:18px;padding:18px}.km-head span{font-size:9px;letter-spacing:.15em;color:#f4c400;font-weight:900}.km-head h1{margin:5px 0;color:#fff}.km-head p{margin:0;color:#8c99aa;font-size:12px}.km-title{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #293344;padding-bottom:10px;margin-bottom:12px}.km-title b{color:#f4c400}.km-title small{color:#8996a7}.km-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.km-card{background:#0a1019;border:1px solid #283447;border-top:3px solid #f4c400;border-radius:14px;padding:14px}.km-card h2{color:#fff;margin:0 0 4px}.km-vs{color:#8d9aac;font-size:11px}.km-preview{margin:10px 0;border:1px solid #3b4658;border-radius:9px;background:#151d29;color:#f4c400;padding:8px 11px;font-weight:900;cursor:pointer}.km-card pre{white-space:pre-wrap;font:inherit;font-size:11px;line-height:1.55;color:#e0e6ee;background:#060a10;border-radius:10px;padding:12px}.km-actions{display:flex;gap:7px;flex-wrap:wrap}.km-actions button{border:0;border-radius:9px;background:#18a957;color:#fff;padding:9px 11px;font-weight:900;cursor:pointer}.km-actions em,.km-empty{color:#8290a2;font-size:11px}.km-empty{padding:8px 0}@media(max-width:760px){.km-grid{grid-template-columns:1fr}.km-head,.km-section{padding:13px}.km-card pre{font-size:10.5px}}
`;

