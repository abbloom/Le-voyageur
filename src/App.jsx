/**
 * VOYAGEUR ✦ — Planificateur de voyage
 * v3 : PWA-ready + synchronisation multi-utilisateurs
 *
 * INSTALLATION :
 *   1. npm create vite@latest voyageur -- --template react
 *   2. Remplacer src/App.jsx par ce fichier
 *   3. Copier vite.config.js et public/manifest.json
 *   4. npm install && npm run dev
 */

import { useState, useEffect, useCallback, useRef } from "react";

/* ─── FONTS & CSS ────────────────────────────────────────────────────────── */
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap');`;
const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-thumb { background: #30363D; border-radius: 3px; }
input[type=date]::-webkit-calendar-picker-indicator,
input[type=time]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
.hov-card:hover  { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(0,0,0,0.22) !important; }
.item-row:hover .ia { opacity: 1 !important; }
.bh:hover { opacity: 0.82; }
.pulse { animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
@keyframes spin  { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; display:inline-block; }
@keyframes slideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
.slide-in { animation: slideIn 0.25s ease both; }
@media(max-width:600px){
  .hide-sm{display:none!important}
  .g2{grid-template-columns:1fr!important}
  .sg{grid-template-columns:1fr 1fr!important}
}
`;

/* ─── CONSTANTS ──────────────────────────────────────────────────────────── */
const EMOJIS    = ["✈","🏖","🗺","🏔","🏙","🌴","🎭","🏕","🚢","🌏","🗼","🏯","🌋","🏝","🎪","🌅","🏄","🎿","🏛","🌺"];
const CURRENCIES= ["EUR","USD","GBP","CHF","JPY","CAD","AUD","MAD","TND","XOF","BRL","MXN"];
const PACK_CATS = ["Vêtements","Documents","Hygiène","Électronique","Santé","Divers"];
const ITEM_CATS = {
  hotel:     { label:"Hébergement", color:"#C9A96E", emoji:"🏨" },
  food:      { label:"Restauration", color:"#E07B6A", emoji:"🍽" },
  activity:  { label:"Activité",    color:"#6BAF92", emoji:"🗺" },
  transport: { label:"Transport",   color:"#7A9ECC", emoji:"🚆" },
  note:      { label:"Note",        color:"#B39DDB", emoji:"📝" },
};
const SYNC_INTERVAL_MS = 45_000; // 45 secondes

/* ─── HELPERS ────────────────────────────────────────────────────────────── */
const uid      = () => Math.random().toString(36).slice(2, 9);
const now      = () => Date.now();
const fmtDate  = (s) => s ? new Date(s+"T00:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"long"}) : "";
const dateDiff = (a,b) => (!a||!b) ? 0 : Math.max(0,Math.round((new Date(b)-new Date(a))/86400000)+1);
const daysLeft = (s) => !s ? null : Math.round((new Date(s+"T00:00:00")-new Date())/86400000);
const shortId  = (id) => id?.slice(0,7).toUpperCase();
const mkTrip   = () => ({ id:uid(), name:"Nouveau voyage", destination:"", country:"", startDate:"", endDate:"", budget:"", currency:"EUR", coverEmoji:"✈", participants:[], notes:"", packingList:[], days:[], synced:false, createdAt:now(), updatedAt:now() });
const mkDay    = () => ({ id:uid(), date:"", title:"", notes:"", items:[] });
const mkItem   = (cat) => ({ id:uid(), category:cat||"activity", title:"", time:"", location:"", cost:"", notes:"", done:false, rating:0, link:"" });
const mkPack   = (cat) => ({ id:uid(), label:"", category:cat||"Vêtements", packed:false, qty:1 });

/* ─── STORAGE ABSTRACTION ────────────────────────────────────────────────── */
// Compatible window.storage (Claude) ET localStorage (production)
const Store = {
  async get(key, shared=false) {
    try {
      if (window.storage) {
        const r = await window.storage.get(key, shared);
        return r?.value ? JSON.parse(r.value) : null;
      }
      const raw = (shared ? sessionStorage : localStorage).getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  async set(key, value, shared=false) {
    try {
      const s = JSON.stringify(value);
      if (window.storage) { await window.storage.set(key, s, shared); return; }
      (shared ? sessionStorage : localStorage).setItem(key, s);
    } catch {}
  },
  async del(key, shared=false) {
    try {
      if (window.storage) { await window.storage.delete(key, shared); return; }
      (shared ? sessionStorage : localStorage).removeItem(key);
    } catch {}
  },
  async list(prefix, shared=false) {
    try {
      if (window.storage) {
        const r = await window.storage.list(prefix, shared);
        return r?.keys || [];
      }
      const keys = [];
      const store = shared ? sessionStorage : localStorage;
      for (let i=0; i<store.length; i++) { const k=store.key(i); if(k?.startsWith(prefix)) keys.push(k); }
      return keys;
    } catch { return []; }
  },
};

/* ─── THEME ──────────────────────────────────────────────────────────────── */
const getT = (dark) => dark ? {
  bg:"#090D13", sf:"#111620", sf2:"#181E2A", sf3:"#1E2638",
  br:"#252D3E", brL:"#1C2433",
  tx:"#E4EAF6", txS:"#647190", txM:"#3A4560",
  gold:"#C9A96E", gD:"#C9A96E30",
  ac:"#5CA87E",  aD:"#5CA87E20",
  bl:"#5B8FCC",  bD:"#5B8FCC20",
  rd:"#D96B5A",  rD:"#D96B5A20",
  pu:"#9B7ED0",  pD:"#9B7ED020",
  cy:"#4FC1C0",  cD:"#4FC1C020",
  or:"#E8924A",  oD:"#E8924A20",
} : {
  bg:"#F0EAE0", sf:"#FFFFFF", sf2:"#F7F1E8", sf3:"#ECE6D8",
  br:"#D4CCB4", brL:"#E2DAC8",
  tx:"#1A1610", txS:"#7A6D52", txM:"#B0A880",
  gold:"#A0762E", gD:"#A0762E22",
  ac:"#3D8A60",  aD:"#3D8A6020",
  bl:"#3A6FAF",  bD:"#3A6FAF20",
  rd:"#B84A36",  rD:"#B84A3620",
  pu:"#7A5CB0",  pD:"#7A5CB020",
  cy:"#2E9B9A",  cD:"#2E9B9A20",
  or:"#C4662A",  oD:"#C4662A20",
};

/* ─── SYNC ENGINE ────────────────────────────────────────────────────────── */
async function pushTripToCloud(trip) {
  await Store.set(`trip:${trip.id}`, trip, true);
}
async function pullTripFromCloud(id) {
  return await Store.get(`trip:${id}`, true);
}
async function removeTripFromCloud(id) {
  await Store.del(`trip:${id}`, true);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN APP
   ═════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [trips,   setTrips]   = useState([]);
  const [tripId,  setTripId]  = useState(null);
  const [dayId,   setDayId]   = useState(null);
  const [view,    setView]    = useState("home");
  const [tab,     setTab]     = useState("itinerary");
  const [dark,    setDark]    = useState(true);
  const [loaded,  setLoaded]  = useState(false);
  const [q,       setQ]       = useState("");
  const [modal,   setModal]   = useState(null);
  const [mdata,   setMdata]   = useState({});
  const [syncSt,  setSyncSt]  = useState({}); // { [tripId]: "idle"|"syncing"|"ok"|"err" }
  const [toast,   setToast]   = useState(null);
  const syncRef = useRef({});
  const T = getT(dark);

  /* ── PWA install prompt ── */
  const [installPrompt, setInstallPrompt] = useState(null);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  /* ── toast helper ── */
  const showToast = useCallback((msg, type="ok") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  }, []);

  /* ── load local data ── */
  useEffect(() => {
    (async () => {
      const d = await Store.get("vgr3");
      if (d) { setTrips(d.trips||[]); setDark(d.dark??true); }
      setLoaded(true);
    })();
  }, []);

  /* ── save local data ── */
  useEffect(() => {
    if (!loaded) return;
    Store.set("vgr3", { trips, dark });
  }, [trips, dark, loaded]);

  /* ── auto-sync shared trips ── */
  useEffect(() => {
    if (!loaded) return;
    const syncAll = async () => {
      const sharedTrips = trips.filter(t => t.synced);
      for (const t of sharedTrips) {
        try {
          const remote = await pullTripFromCloud(t.id);
          if (remote && remote.updatedAt > t.updatedAt) {
            setTrips(prev => prev.map(x => x.id===t.id ? {...remote, synced:true} : x));
          }
        } catch {}
      }
    };
    syncAll();
    const iv = setInterval(syncAll, SYNC_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [loaded, trips.filter(t=>t.synced).map(t=>t.id).join(",")]);

  /* ── derived ── */
  const trip = trips.find(t => t.id===tripId);
  const day  = trip?.days?.find(d => d.id===dayId);

  /* ── mutations ── */
  const updTrip = useCallback((id, patch) => {
    setTrips(p => p.map(t => t.id===id ? {...t,...patch,updatedAt:now()} : t));
  }, []);

  const updDay = useCallback((tid, did, patch) => {
    setTrips(p => p.map(t => {
      if (t.id!==tid) return t;
      return {...t, updatedAt:now(), days:t.days.map(d => d.id===did ? {...d,...patch} : d)};
    }));
  }, []);

  const updItem = useCallback((tid, did, iid, patch) => {
    setTrips(p => p.map(t => {
      if (t.id!==tid) return t;
      return {...t, updatedAt:now(), days:t.days.map(d => {
        if (d.id!==did) return d;
        return {...d, items:d.items.map(i => i.id===iid ? {...i,...patch} : i)};
      })};
    }));
  }, []);

  const delItem = useCallback((tid, did, iid) => {
    setTrips(p => p.map(t => {
      if (t.id!==tid) return t;
      return {...t, updatedAt:now(), days:t.days.map(d => {
        if (d.id!==did) return d;
        return {...d, items:d.items.filter(i => i.id!==iid)};
      })};
    }));
  }, []);

  const delDay = useCallback((tid, did) => {
    setTrips(p => p.map(t => t.id!==tid ? t : {...t, updatedAt:now(), days:t.days.filter(d=>d.id!==did)}));
    setView("trip"); setDayId(null);
  }, []);

  const delTrip = useCallback(async (tid) => {
    const t = trips.find(x=>x.id===tid);
    if (t?.synced) await removeTripFromCloud(tid);
    setTrips(p => p.filter(t=>t.id!==tid));
    setView("home"); setTripId(null);
  }, [trips]);

  /* ── SYNC ACTIONS ── */
  const shareTrip = useCallback(async (tid) => {
    setSyncSt(p => ({...p,[tid]:"syncing"}));
    try {
      const t = trips.find(x=>x.id===tid);
      const updated = {...t, synced:true, updatedAt:now()};
      await pushTripToCloud(updated);
      setTrips(p => p.map(x=>x.id===tid?updated:x));
      setSyncSt(p => ({...p,[tid]:"ok"}));
      showToast(`✅ Code de partage : ${shortId(tid)}`,"ok");
    } catch {
      setSyncSt(p => ({...p,[tid]:"err"}));
      showToast("⚠ Erreur de synchronisation","err");
    }
  }, [trips, showToast]);

  const pushTrip = useCallback(async (tid) => {
    setSyncSt(p => ({...p,[tid]:"syncing"}));
    try {
      const t = trips.find(x=>x.id===tid);
      await pushTripToCloud({...t, updatedAt:now()});
      setSyncSt(p => ({...p,[tid]:"ok"}));
      showToast("☁ Synchronisé","ok");
    } catch {
      setSyncSt(p => ({...p,[tid]:"err"}));
      showToast("⚠ Erreur","err");
    }
  }, [trips, showToast]);

  const joinTrip = useCallback(async (code) => {
    const id = code.toLowerCase().slice(0,7);
    if (trips.find(t=>t.id.startsWith(id))) {
      showToast("⚠ Ce voyage est déjà dans votre liste","err"); return false;
    }
    try {
      const keys = await Store.list("trip:", true);
      const matchKey = keys.find(k=>k.replace("trip:","").startsWith(id));
      if (!matchKey) { showToast("⚠ Code introuvable","err"); return false; }
      const remote = await Store.get(matchKey, true);
      if (!remote) { showToast("⚠ Voyage introuvable","err"); return false; }
      setTrips(p => [...p, {...remote, synced:true}]);
      showToast(`✅ "${remote.name}" ajouté !`,"ok");
      return true;
    } catch {
      showToast("⚠ Erreur de connexion","err"); return false;
    }
  }, [trips, showToast]);

  const unsyncTrip = useCallback(async (tid) => {
    await removeTripFromCloud(tid);
    updTrip(tid, {synced:false});
    showToast("🔒 Partage désactivé","ok");
  }, [updTrip, showToast]);

  /* ── auto-push when synced trip changes ── */
  useEffect(() => {
    if (!loaded) return;
    trips.filter(t=>t.synced).forEach(t => {
      clearTimeout(syncRef.current[t.id]);
      syncRef.current[t.id] = setTimeout(() => {
        pushTripToCloud(t).catch(()=>{});
      }, 2000);
    });
  }, [trips, loaded]);

  /* ── stats helper ── */
  function stats(t) {
    const all = (t.days||[]).flatMap(d=>d.items||[]);
    const total = all.reduce((s,i)=>s+(parseFloat(i.cost)||0),0);
    const byCat = {};
    all.forEach(i=>{ byCat[i.category]=(byCat[i.category]||0)+(parseFloat(i.cost)||0); });
    return { total, count:all.length, done:all.filter(i=>i.done).length, byCat,
      packed:(t.packingList||[]).filter(p=>p.packed).length,
      packTotal:(t.packingList||[]).length };
  }

  /* ── shared styles factory ── */
  const btn = (v="ghost",sz="md") => ({
    display:"inline-flex",alignItems:"center",gap:6,
    padding:sz==="sm"?"5px 10px":sz==="lg"?"11px 24px":"8px 14px",
    borderRadius:8,border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif",
    fontSize:sz==="sm"?12:sz==="lg"?15:13,fontWeight:500,transition:"all 0.15s",lineHeight:1.4,
    ...(v==="primary"?{background:T.gold,color:"#09090D"}:
        v==="accent" ?{background:T.ac,  color:"#fff"}:
        v==="sync"   ?{background:T.cD,  color:T.cy,border:`1px solid ${T.cy}44`}:
        v==="danger" ?{background:T.rD,  color:T.rd,border:`1px solid ${T.rd}44`}:
        v==="outline"?{background:"transparent",color:T.tx,border:`1px solid ${T.br}`}:
                      {background:"transparent",color:T.txS,border:`1px solid ${T.br}`}),
  });
  const inp = {
    background:T.sf2,border:`1px solid ${T.br}`,borderRadius:8,
    padding:"9px 12px",color:T.tx,fontSize:14,fontFamily:"'Outfit',sans-serif",
    outline:"none",width:"100%",transition:"border-color 0.2s",
  };
  const lbl = { fontSize:11,color:T.txS,fontWeight:600,marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.6px" };
  const card = { background:T.sf,border:`1px solid ${T.br}`,borderRadius:12,padding:20,marginBottom:14,transition:"all 0.2s" };
  const S = { btn, inp, lbl, card };

  /* ── render guard ── */
  if (!loaded) return (
    <div style={{background:T.bg,height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <span style={{color:T.gold,fontSize:28,fontFamily:"'Cormorant Garamond',serif",fontWeight:700}}>Voyageur ✦</span>
      <div style={{width:24,height:24,border:`2px solid ${T.br}`,borderTopColor:T.gold,borderRadius:"50%"}} className="spin" />
    </div>
  );

  return (
    <>
      <style>{FONTS}{CSS}</style>
      <div style={{fontFamily:"'Outfit',sans-serif",background:T.bg,color:T.tx,minHeight:"100vh"}}>

        {/* ═══ HEADER ═══ */}
        <header style={{background:T.sf,borderBottom:`1px solid ${T.br}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",height:56,position:"sticky",top:0,zIndex:50,backdropFilter:"blur(10px)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:T.gold,cursor:"pointer",fontWeight:700,userSelect:"none"}}
              onClick={()=>{setView("home");setTripId(null);setDayId(null);}}>Voyageur ✦</span>
            {trip&&<><span style={{color:T.br}}>›</span>
              <span className="hide-sm" style={{fontSize:13,color:view==="trip"?T.tx:T.txS,cursor:"pointer"}} onClick={()=>{setView("trip");setDayId(null);}}>
                {trip.synced&&<span style={{fontSize:10,marginRight:4,color:T.cy}}>☁</span>}{trip.coverEmoji} {trip.name}
              </span></>}
            {day&&<><span className="hide-sm" style={{color:T.br}}>›</span>
              <span className="hide-sm" style={{fontSize:13,color:T.tx}}>{day.title||"Jour"}</span></>}
          </div>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            {view==="home"&&<div style={{position:"relative"}}>
              <input style={{...inp,width:160,paddingLeft:30,height:34,fontSize:13}} placeholder="Rechercher..." value={q} onChange={e=>setQ(e.target.value)}/>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.txS,fontSize:13}}>🔍</span>
            </div>}
            {/* PWA install */}
            {installPrompt&&<button className="bh" title="Installer l'application" style={{...btn("sync","sm"),gap:4}} onClick={()=>{installPrompt.prompt();setInstallPrompt(null);}}>
              📲 <span className="hide-sm">Installer</span>
            </button>}
            {/* Join trip */}
            {view==="home"&&<button className="bh" style={btn("sync","sm")} onClick={()=>setModal("join")}>🔗 <span className="hide-sm">Rejoindre</span></button>}
            <button style={{background:"transparent",border:`1px solid ${T.br}`,borderRadius:8,padding:"5px 10px",cursor:"pointer",color:T.txS,fontSize:14}} onClick={()=>setDark(p=>!p)}>
              {dark?"☀":"☾"}
            </button>
            {view==="home"&&<button className="bh" style={btn("primary")} onClick={()=>{setModal("trip");setMdata(mkTrip());}}>＋ Voyage</button>}
            {view==="trip"&&<button className="bh" style={btn("primary")} onClick={()=>{setModal("day");setMdata(mkDay());}}>＋ Jour</button>}
            {view==="day" &&<button className="bh" style={btn("primary")} onClick={()=>{setModal("addItem");setMdata(mkItem());}}>＋ Étape</button>}
          </div>
        </header>

        {/* ═══ TOAST ═══ */}
        {toast&&<div className="slide-in" style={{position:"fixed",bottom:24,right:24,zIndex:999,background:toast.type==="err"?T.rD:T.aD,border:`1px solid ${toast.type==="err"?T.rd:T.ac}`,color:toast.type==="err"?T.rd:T.ac,padding:"10px 18px",borderRadius:10,fontSize:14,fontWeight:500,backdropFilter:"blur(8px)"}}>
          {toast.msg}
        </div>}

        {/* ═══ HOME ═══ */}
        {view==="home"&&(
          <div style={{maxWidth:1000,margin:"0 auto",padding:"32px 20px"}}>
            <div style={{marginBottom:26}}>
              <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:36,fontWeight:700,color:T.gold,marginBottom:4}}>Mes voyages</h1>
              <p style={{color:T.txS,fontSize:14}}>{trips.length} voyage{trips.length!==1?"s":""} · <span style={{color:T.cy}}>{trips.filter(t=>t.synced).length} partagé{trips.filter(t=>t.synced).length>1?"s":""}</span></p>
            </div>

            {/* Global stats */}
            {trips.length>0&&<div className="sg" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:26}}>
              {[[trips.length,"Voyages","✈",T.gold],[new Set(trips.map(t=>t.destination).filter(Boolean)).size,"Destinations","📍",T.ac],[trips.reduce((s,t)=>s+(t.days?.length||0),0),"Jours planifiés","📅",T.bl],[trips.reduce((s,t)=>s+stats(t).total,0).toFixed(0)+" €","Budget total","💰",T.pu]].map(([v,l,e,c])=>(
                <div key={l} style={{...card,padding:16,textAlign:"center",marginBottom:0}}>
                  <div style={{fontSize:20,marginBottom:3}}>{e}</div>
                  <div style={{fontSize:20,fontWeight:700,color:c,fontFamily:"'Cormorant Garamond',serif"}}>{v}</div>
                  <div style={{fontSize:10,color:T.txS,textTransform:"uppercase",letterSpacing:"0.5px"}}>{l}</div>
                </div>
              ))}
            </div>}

            {trips.length===0&&<div style={{textAlign:"center",padding:"80px 20px",background:T.sf,borderRadius:16,border:`1px dashed ${T.br}`}}>
              <div style={{fontSize:52,marginBottom:16}}>✈</div>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",color:T.txS,fontWeight:400,fontSize:22,marginBottom:8}}>Aucun voyage planifié</h2>
              <p style={{color:T.txS,fontSize:14,marginBottom:20}}>Créez votre premier voyage ou rejoignez un voyage partagé.</p>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                <button className="bh" style={btn("primary","lg")} onClick={()=>{setModal("trip");setMdata(mkTrip());}}>＋ Créer un voyage</button>
                <button className="bh" style={btn("sync","lg")} onClick={()=>setModal("join")}>🔗 Rejoindre un voyage</button>
              </div>
            </div>}

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
              {trips.filter(t=>!q||(t.name+t.destination+t.country).toLowerCase().includes(q.toLowerCase()))
                .sort((a,b)=>b.createdAt-a.createdAt)
                .map(t=>{
                  const st=stats(t); const dl=daysLeft(t.startDate); const nights=dateDiff(t.startDate,t.endDate);
                  const ss=syncSt[t.id];
                  return (
                    <div key={t.id} className="hov-card" style={{...card,cursor:"pointer",position:"relative",overflow:"hidden",marginBottom:0}}
                      onClick={()=>{setTripId(t.id);setView("trip");setTab("itinerary");}}>
                      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${T.gold},${T.ac})`}}/>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                        <span style={{fontSize:30}}>{t.coverEmoji||"✈"}</span>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          {/* Sync badge */}
                          {t.synced&&<span style={{fontSize:10,background:T.cD,color:T.cy,padding:"2px 6px",borderRadius:10,fontWeight:600}}>
                            {ss==="syncing"?<span className="spin">🔄</span>:ss==="err"?"⚠ sync":"☁ sync"}
                          </span>}
                          {dl!==null&&<span style={{background:dl===0?T.gD:dl<0?T.sf3:dl<=7?T.rD:T.aD,color:dl===0?T.gold:dl<0?T.txM:dl<=7?T.rd:T.ac,fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600}}>
                            {dl===0?"Aujourd'hui !":dl<0?"Terminé":`J-${dl}`}
                          </span>}
                        </div>
                      </div>
                      <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,marginBottom:3}}>{t.name}</h3>
                      {t.destination&&<div style={{fontSize:12,color:T.gold,marginBottom:6}}>📍 {t.destination}{t.country?`, ${t.country}`:""}</div>}
                      {(t.startDate||t.endDate)&&<div style={{fontSize:12,color:T.txS,marginBottom:10}}>
                        {t.startDate&&fmtDate(t.startDate)}{t.startDate&&t.endDate&&" → "}{t.endDate&&fmtDate(t.endDate)}{nights>0&&` · ${nights}j`}
                      </div>}
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:t.participants?.length?8:0}}>
                        <Chip bg={T.sf2} c={T.txS}>{t.days?.length||0} jours</Chip>
                        <Chip bg={T.sf2} c={T.txS}>{st.count} étapes</Chip>
                        {st.total>0&&<Chip bg={T.gD} c={T.gold}>{st.total.toFixed(0)} {t.currency||"€"}</Chip>}
                        {st.packTotal>0&&<Chip bg={T.aD} c={T.ac}>{st.packed}/{st.packTotal} 🧳</Chip>}
                      </div>
                      {t.participants?.length>0&&<div style={{display:"flex",gap:3,alignItems:"center"}}>
                        {t.participants.slice(0,5).map((p,i)=>(
                          <div key={i} style={{width:22,height:22,borderRadius:"50%",background:`hsl(${i*65+20},45%,40%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,border:`2px solid ${T.sf}`,marginLeft:i>0?-7:0}}>{p.charAt(0).toUpperCase()}</div>
                        ))}
                        {t.participants.length>5&&<span style={{fontSize:10,color:T.txS,marginLeft:5}}>+{t.participants.length-5}</span>}
                      </div>}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ═══ TRIP VIEW ═══ */}
        {view==="trip"&&trip&&(
          <TripView T={T} S={S} trip={trip} tab={tab} setTab={setTab}
            stats={stats} fmtDate={fmtDate} dateDiff={dateDiff} daysLeft={daysLeft}
            updTrip={updTrip} updDay={updDay} delTrip={delTrip} delDay={delDay}
            syncSt={syncSt[trip.id]||"idle"}
            onShare={()=>shareTrip(trip.id)} onPush={()=>pushTrip(trip.id)} onUnsync={()=>unsyncTrip(trip.id)}
            openDay={d=>{setDayId(d.id);setView("day");}}
            openModal={(m,d)=>{setModal(m);setMdata(d);}}
          />
        )}

        {/* ═══ DAY VIEW ═══ */}
        {view==="day"&&trip&&day&&(
          <DayView T={T} S={S} trip={trip} day={day} fmtDate={fmtDate}
            updDay={p=>updDay(trip.id,day.id,p)}
            updItem={(iid,p)=>updItem(trip.id,day.id,iid,p)}
            delItem={iid=>delItem(trip.id,day.id,iid)}
            delDay={()=>delDay(trip.id,day.id)}
            openModal={(m,d)=>{setModal(m);setMdata(d);}}
          />
        )}

        {/* ═══ MODALS ═══ */}
        {modal==="trip"&&<TripModal T={T} S={S} data={mdata} onChange={setMdata} onClose={()=>setModal(null)} isEdit={!!trips.find(t=>t.id===mdata.id)}
          onSave={()=>{if(trips.find(t=>t.id===mdata.id))updTrip(mdata.id,mdata);else{setTrips(p=>[mdata,...p]);setTripId(mdata.id);setView("trip");setTab("itinerary");}setModal(null);}}/>}
        {modal==="day"&&trip&&<DayModal T={T} S={S} data={mdata} onChange={setMdata} onClose={()=>setModal(null)}
          onSave={()=>{updTrip(trip.id,{days:[...(trip.days||[]),mdata]});setModal(null);}}/>}
        {(modal==="addItem"||modal==="editItem")&&trip&&day&&<ItemModal T={T} S={S} data={mdata} isEdit={modal==="editItem"} currency={trip.currency||"€"}
          onChange={setMdata} onClose={()=>setModal(null)}
          onSave={()=>{if(modal==="addItem")updDay(trip.id,day.id,{items:[...(day.items||[]),mdata]});else updItem(trip.id,day.id,mdata.id,mdata);setModal(null);}}/>}
        {modal==="join"&&<JoinModal T={T} S={S} onClose={()=>setModal(null)} onJoin={joinTrip}/>}
        {modal==="share"&&trip&&<ShareModal T={T} S={S} trip={trip} syncSt={syncSt[trip.id]||"idle"}
          onClose={()=>setModal(null)} onShare={()=>shareTrip(trip.id)} onUnsync={()=>unsyncTrip(trip.id)}/>}
      </div>
    </>
  );
}

/* ─── CHIP ─────────────────────────────────────────────────────────────── */
function Chip({bg,c,children}) {
  return <span style={{background:bg,color:c,fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:500,display:"inline-flex",alignItems:"center"}}>{children}</span>;
}

/* ─── SYNC BADGE ─────────────────────────────────────────────────────────── */
function SyncBadge({T,st}) {
  const map = { idle:{c:T.txS,label:"Non partagé"}, syncing:{c:T.cy,label:"Sync...",spin:true}, ok:{c:T.ac,label:"Synchronisé"}, err:{c:T.rd,label:"Erreur sync"} };
  const x = map[st]||map.idle;
  return <span style={{fontSize:12,color:x.c,display:"flex",alignItems:"center",gap:4}}>
    <span className={x.spin?"spin":""}>☁</span> {x.label}
  </span>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRIP VIEW
   ═════════════════════════════════════════════════════════════════════════ */
function TripView({T,S,trip,tab,setTab,stats,fmtDate,dateDiff,daysLeft,updTrip,updDay,delTrip,delDay,syncSt,onShare,onPush,onUnsync,openDay,openModal}) {
  const st=stats(trip); const nights=dateDiff(trip.startDate,trip.endDate); const dl=daysLeft(trip.startDate);
  const [delOk,setDelOk]=useState(false);
  const [newPart,setNewPart]=useState("");
  const [note,setNote]=useState(trip.notes||"");
  const [newPack,setNewPack]=useState(""); const [packCat,setPackCat]=useState("Vêtements"); const [fPack,setFPack]=useState("Tous");
  const {btn:B,inp,lbl,card}=S;
  const Tab=(id,label)=>(
    <button className="bh" style={{...B(tab===id?"primary":"ghost","sm"),flex:1,justifyContent:"center",background:tab===id?T.gold:"transparent",color:tab===id?"#09090D":T.txS,border:"none",borderRadius:7}} onClick={()=>setTab(id)}>{label}</button>
  );
  return (
    <div style={{maxWidth:960,margin:"0 auto",padding:"24px 20px"}}>

      {/* HERO */}
      <div style={{...card,position:"relative",overflow:"hidden",marginBottom:20}}>
        <div style={{position:"absolute",top:-20,right:-20,fontSize:130,opacity:0.04}}>{trip.coverEmoji||"✈"}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16,marginBottom:12}}>
          <div>
            <div style={{fontSize:36,marginBottom:6}}>{trip.coverEmoji||"✈"}</div>
            <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:700,marginBottom:4}}>{trip.name}</h1>
            {trip.destination&&<div style={{color:T.gold,fontSize:14}}>📍 {trip.destination}{trip.country?`, ${trip.country}`:""}</div>}
            {dl!==null&&<div style={{marginTop:6,fontSize:13,fontWeight:600,color:dl<0?T.txS:dl===0?T.gold:dl<=7?T.rd:T.ac}}>
              {dl<0?"Voyage terminé":dl===0?"✈ C'est aujourd'hui !":dl<=7?`⚠ Dans ${dl} jour${dl>1?"s":""}`:dl<30?`✈ Dans ${dl} jours`:null}
            </div>}
          </div>
          <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
            {[[nights>0?nights:"—","Durée",T.ac],[trip.days?.length||0,"Planifiés",T.gold],[st.count,"Étapes",T.bl],[st.total.toFixed(0)+" "+(trip.currency||"€"),"Dépenses",T.pu]].map(([v,l,c])=>(
              <div key={l} style={{textAlign:"center"}}>
                <div style={{fontSize:24,fontWeight:700,color:c,fontFamily:"'Cormorant Garamond',serif"}}>{v}</div>
                <div style={{fontSize:10,color:T.txS,textTransform:"uppercase",letterSpacing:"0.5px"}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        {(trip.startDate||trip.endDate)&&<div style={{fontSize:13,color:T.txS,marginBottom:10}}>
          📅 {trip.startDate&&fmtDate(trip.startDate)}{trip.startDate&&trip.endDate&&" → "}{trip.endDate&&fmtDate(trip.endDate)}
        </div>}
        {trip.participants?.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
          {trip.participants.map((p,i)=>(
            <span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,background:T.sf3,borderRadius:20,padding:"3px 10px 3px 3px",fontSize:12,border:`1px solid ${T.br}`}}>
              <span style={{width:20,height:20,borderRadius:"50%",background:`hsl(${i*65+20},45%,40%)`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700}}>{p.charAt(0).toUpperCase()}</span>{p}
            </span>
          ))}
        </div>}
        {trip.budget&&st.total>0&&<div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:11,color:T.txS}}>Budget</span>
            <span style={{fontSize:11,fontWeight:600,color:st.total>parseFloat(trip.budget)?T.rd:T.ac}}>{st.total.toFixed(0)} / {trip.budget} {trip.currency||"€"}{st.total>parseFloat(trip.budget)&&" ⚠"}</span>
          </div>
          <div style={{background:T.sf3,borderRadius:4,height:5,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:4,width:`${Math.min(100,(st.total/parseFloat(trip.budget))*100)}%`,background:st.total>parseFloat(trip.budget)?T.rd:`linear-gradient(90deg,${T.gold},${T.ac})`,transition:"width 0.5s"}}/>
          </div>
        </div>}

        {/* Action buttons */}
        <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
          <button className="bh" style={B("outline","sm")} onClick={()=>openModal("trip",{...trip})}>✎ Modifier</button>

          {/* SYNC CONTROLS */}
          {!trip.synced
            ?<button className="bh" style={B("sync","sm")} onClick={()=>openModal("share",trip)}>
              ☁ Partager
            </button>
            :<>
              <button className="bh" style={{...B("sync","sm"),gap:4}} onClick={()=>openModal("share",trip)}>
                {syncSt==="syncing"?<span className="spin">🔄</span>:"☁"} Code : <strong>{shortId(trip.id)}</strong>
              </button>
              <button className="bh" style={B("sync","sm")} title="Forcer la synchro" onClick={onPush}>↑ Sync</button>
            </>}

          {!delOk
            ?<button className="bh" style={B("danger","sm")} onClick={()=>setDelOk(true)}>🗑 Supprimer</button>
            :<><span style={{fontSize:12,color:T.rd,display:"flex",alignItems:"center"}}>Confirmer ?</span>
              <button className="bh" style={B("danger","sm")} onClick={()=>delTrip(trip.id)}>Oui</button>
              <button className="bh" style={B("ghost","sm")} onClick={()=>setDelOk(false)}>Non</button></>}
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",gap:3,marginBottom:22,background:T.sf,padding:4,borderRadius:10,border:`1px solid ${T.br}`}}>
        {Tab("itinerary","🗺 Itinéraire")}
        {Tab("packing",  "🧳 Bagages")}
        {Tab("notes",    "📝 Notes")}
        {Tab("stats",    "📊 Stats")}
      </div>

      {/* ─ ITINERARY ─ */}
      {tab==="itinerary"&&<div>
        {(!trip.days||trip.days.length===0)&&<Empty T={T} emoji="📅" text="Ajoutez votre premier jour de voyage."/>}
        {trip.days?.map((d,idx)=>{
          const items=d.items||[]; const dc=items.reduce((s,i)=>s+(parseFloat(i.cost)||0),0); const dn=items.filter(i=>i.done).length;
          return (
            <div key={d.id} style={{...card,overflow:"hidden",cursor:"pointer"}} onClick={()=>openDay(d)}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:items.length>0?12:0}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:38,height:38,borderRadius:9,background:`linear-gradient(135deg,${T.gD},${T.aD})`,border:`1px solid ${T.br}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:T.gold,fontSize:16}}>J{idx+1}</div>
                  <div>
                    <div style={{fontWeight:600,fontSize:14}}>{d.title||`Jour ${idx+1}`}</div>
                    {d.date&&<div style={{fontSize:11,color:T.txS}}>{fmtDate(d.date)}</div>}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {items.length>0&&<div style={{textAlign:"right"}}>
                    {dc>0&&<div style={{fontSize:12,color:T.gold,fontWeight:600}}>{dc.toFixed(0)} {trip.currency||"€"}</div>}
                    <div style={{fontSize:11,color:T.txS}}>{dn}/{items.length} ✓</div>
                  </div>}
                  <span style={{color:T.txS,fontSize:18}}>›</span>
                </div>
              </div>
              {items.length>0&&<>
                <div style={{height:3,background:T.sf3,borderRadius:2,overflow:"hidden",marginBottom:8}}>
                  <div style={{height:"100%",width:`${(dn/items.length)*100}%`,background:`linear-gradient(90deg,${T.gold},${T.ac})`,borderRadius:2,transition:"width 0.4s"}}/>
                </div>
                {items.slice(0,4).map(it=>(
                  <div key={it.id} style={{display:"flex",alignItems:"center",gap:10,padding:"4px 0",opacity:it.done?0.5:1}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:ITEM_CATS[it.category]?.color||T.txS,flexShrink:0}}/>
                    <span style={{fontSize:12,color:T.txS,minWidth:36}}>{it.time}</span>
                    <span style={{fontSize:13,flex:1,textDecoration:it.done?"line-through":"none"}}>{it.title||"—"}</span>
                    {it.cost&&<span style={{fontSize:11,color:T.txS}}>{it.cost} {trip.currency||"€"}</span>}
                  </div>
                ))}
                {items.length>4&&<div style={{fontSize:11,color:T.txS,paddingTop:4}}>+{items.length-4} autre{items.length-4>1?"s":""}</div>}
              </>}
            </div>
          );
        })}
      </div>}

      {/* ─ PACKING ─ */}
      {tab==="packing"&&<div>
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {["Tous",...PACK_CATS].map(c=>(
            <button key={c} className="bh" style={{...B(fPack===c?"primary":"ghost","sm"),background:fPack===c?T.gold:"transparent",color:fPack===c?"#09090D":T.txS}} onClick={()=>setFPack(c)}>{c}</button>
          ))}
        </div>
        <div style={{...card,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input style={{...inp,flex:"1 1 160px",height:36}} placeholder="Ajouter un article..." value={newPack}
            onChange={e=>setNewPack(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&newPack.trim()){updTrip(trip.id,{packingList:[...(trip.packingList||[]),{...mkPack(packCat),label:newPack.trim()}]});setNewPack("");}}}/>
          <select style={{...inp,width:"auto",height:36,fontSize:13}} value={packCat} onChange={e=>setPackCat(e.target.value)}>
            {PACK_CATS.map(c=><option key={c}>{c}</option>)}
          </select>
          <button className="bh" style={{...B("primary","sm"),height:36,padding:"0 14px"}}
            onClick={()=>{if(!newPack.trim())return;updTrip(trip.id,{packingList:[...(trip.packingList||[]),{...mkPack(packCat),label:newPack.trim()}]});setNewPack("");}}>＋</button>
        </div>
        {st.packTotal>0&&<div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:12,color:T.txS}}>Progression</span>
            <span style={{fontSize:12,color:T.ac,fontWeight:600}}>{st.packed}/{st.packTotal} emballé{st.packed>1?"s":""}</span>
          </div>
          <div style={{background:T.sf3,borderRadius:4,height:5,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:4,width:`${st.packTotal?(st.packed/st.packTotal)*100:0}%`,background:`linear-gradient(90deg,${T.gold},${T.ac})`,transition:"width 0.4s"}}/>
          </div>
        </div>}
        {(trip.packingList||[]).length===0&&<Empty T={T} emoji="🧳" text="Liste vide. Ajoutez vos articles."/>}
        {PACK_CATS.filter(c=>fPack==="Tous"||c===fPack).map(cat=>{
          const ci=(trip.packingList||[]).filter(p=>p.category===cat); if(!ci.length) return null;
          return (
            <div key={cat} style={{marginBottom:14}}>
              <div style={{fontSize:11,color:T.txS,textTransform:"uppercase",letterSpacing:"0.7px",fontWeight:600,marginBottom:8}}>{cat} · {ci.filter(p=>p.packed).length}/{ci.length}</div>
              {ci.map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",background:T.sf,border:`1px solid ${T.br}`,borderRadius:8,marginBottom:5,opacity:p.packed?0.55:1}}>
                  <input type="checkbox" checked={p.packed} style={{accentColor:T.gold,width:15,height:15,cursor:"pointer"}}
                    onChange={()=>updTrip(trip.id,{packingList:(trip.packingList||[]).map(x=>x.id===p.id?{...x,packed:!x.packed}:x)})}/>
                  <span style={{flex:1,fontSize:13,textDecoration:p.packed?"line-through":"none"}}>{p.label}</span>
                  {p.qty>1&&<span style={{fontSize:11,color:T.txS}}>×{p.qty}</span>}
                  <div style={{display:"flex",gap:3}}>
                    {[["+",(x)=>({...x,qty:Math.max(1,(x.qty||1)+1)})],["−",(x)=>({...x,qty:Math.max(1,(x.qty||1)-1)})]].map(([lbl,fn])=>(
                      <button key={lbl} style={{background:"none",border:"none",cursor:"pointer",color:T.txS,fontSize:14,padding:"1px 5px"}} onClick={()=>updTrip(trip.id,{packingList:(trip.packingList||[]).map(x=>x.id===p.id?fn(x):x)})}>{lbl}</button>
                    ))}
                    <button style={{background:"none",border:"none",cursor:"pointer",color:T.rd,fontSize:15,padding:"1px 6px"}} onClick={()=>updTrip(trip.id,{packingList:(trip.packingList||[]).filter(x=>x.id!==p.id)})}>×</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>}

      {/* ─ NOTES ─ */}
      {tab==="notes"&&<div>
        <div style={card}>
          <div style={{...lbl,marginBottom:8}}>Notes générales</div>
          <textarea style={{...inp,minHeight:180,resize:"vertical",fontSize:14,lineHeight:1.7}}
            placeholder="Réservations, contacts locaux, codes, idées, liens utiles..."
            value={note} onChange={e=>{setNote(e.target.value);updTrip(trip.id,{notes:e.target.value});}}/>
        </div>
        <div style={card}>
          <div style={{...lbl,marginBottom:8}}>Participants</div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input style={{...inp,flex:1,height:34}} placeholder="Ajouter un participant..." value={newPart}
              onChange={e=>setNewPart(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&newPart.trim()){updTrip(trip.id,{participants:[...(trip.participants||[]),newPart.trim()]});setNewPart("");}}}/>
            <button className="bh" style={{...B("primary","sm"),height:34,padding:"0 14px"}}
              onClick={()=>{if(!newPart.trim())return;updTrip(trip.id,{participants:[...(trip.participants||[]),newPart.trim()]});setNewPart("");}}>＋</button>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {(trip.participants||[]).map((p,i)=>(
              <span key={i} style={{display:"inline-flex",alignItems:"center",gap:5,background:T.sf3,borderRadius:20,padding:"3px 10px",fontSize:12,border:`1px solid ${T.br}`}}>
                {p}<button style={{background:"none",border:"none",cursor:"pointer",color:T.rd,fontSize:13,lineHeight:1}} onClick={()=>updTrip(trip.id,{participants:trip.participants.filter((_,j)=>j!==i)})}>×</button>
              </span>
            ))}
            {!(trip.participants?.length)&&<span style={{fontSize:12,color:T.txM}}>Aucun participant ajouté</span>}
          </div>
        </div>
        {trip.days?.filter(d=>d.notes).map((d,i)=>(
          <div key={d.id} style={{...card,borderLeft:`3px solid ${T.gold}`}}>
            <div style={{fontSize:12,color:T.gold,marginBottom:5}}>{d.title||`Jour ${i+1}`}{d.date&&` · ${fmtDate(d.date)}`}</div>
            <div style={{fontSize:13,color:T.txS,lineHeight:1.6}}>{d.notes}</div>
          </div>
        ))}
      </div>}

      {/* ─ STATS ─ */}
      {tab==="stats"&&<div>
        <div className="sg" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:18}}>
          {[[`${st.total.toFixed(2)} ${trip.currency||"€"}`,"Dépensé","💰",T.gold],[`${st.done}/${st.count}`,"Complétées","✅",T.ac],[`${st.packed}/${st.packTotal}`,"Bagages","🧳",T.bl]].map(([v,l,e,c])=>(
            <div key={l} style={{...card,textAlign:"center",marginBottom:0}}>
              <div style={{fontSize:22,marginBottom:4}}>{e}</div>
              <div style={{fontSize:18,fontWeight:700,color:c,fontFamily:"'Cormorant Garamond',serif"}}>{v}</div>
              <div style={{fontSize:11,color:T.txS}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{...card,marginBottom:16}}>
          <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:17,marginBottom:14}}>Dépenses par catégorie</h3>
          {Object.entries(ITEM_CATS).map(([key,cat])=>{
            const val=st.byCat[key]||0; if(!val) return null;
            const pct=st.total>0?(val/st.total)*100:0;
            return (<div key={key} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12}}>{cat.emoji} {cat.label}</span>
                <span style={{fontSize:12,color:cat.color,fontWeight:600}}>{val.toFixed(2)} {trip.currency||"€"} ({pct.toFixed(0)}%)</span>
              </div>
              <div style={{background:T.sf3,borderRadius:4,height:6,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:4,width:`${pct}%`,background:cat.color,transition:"width 0.5s"}}/>
              </div>
            </div>);
          })}
          {st.total===0&&<p style={{color:T.txS,fontSize:13}}>Aucune dépense enregistrée.</p>}
        </div>
        {trip.days?.length>0&&<div style={card}>
          <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:17,marginBottom:14}}>Dépenses par jour</h3>
          {trip.days.map((d,i)=>{
            const dc=(d.items||[]).reduce((s,it)=>s+(parseFloat(it.cost)||0),0);
            const mx=Math.max(...trip.days.map(x=>(x.items||[]).reduce((s,it)=>s+(parseFloat(it.cost)||0),0)),1);
            return (<div key={d.id} style={{marginBottom:9}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:12}}>{d.title||`Jour ${i+1}`}</span>
                <span style={{fontSize:12,color:T.txS}}>{dc.toFixed(2)} {trip.currency||"€"}</span>
              </div>
              <div style={{background:T.sf3,borderRadius:4,height:5,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:4,width:`${(dc/mx)*100}%`,background:`linear-gradient(90deg,${T.bl},${T.pu})`,transition:"width 0.5s"}}/>
              </div>
            </div>);
          })}
        </div>}
      </div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DAY VIEW
   ═════════════════════════════════════════════════════════════════════════ */
function DayView({T,S,trip,day,fmtDate,updDay,updItem,delItem,delDay,openModal}) {
  const items=day.items||[];
  const sorted=[...items].sort((a,b)=>{if(!a.time&&!b.time)return 0;if(!a.time)return 1;if(!b.time)return -1;return a.time.localeCompare(b.time);});
  const total=items.reduce((s,i)=>s+(parseFloat(i.cost)||0),0);
  const done=items.filter(i=>i.done).length;
  const [showDel,setShowDel]=useState(false);
  const {btn:B,inp,card}=S;
  return (
    <div style={{maxWidth:800,margin:"0 auto",padding:"24px 20px"}}>
      <div style={{...card,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:12}}>
          <div style={{flex:1,minWidth:200}}>
            <input style={{...inp,fontSize:18,fontFamily:"'Cormorant Garamond',serif",fontWeight:700,border:"none",padding:"4px 0",background:"transparent",borderBottom:`1px solid ${T.br}`,marginBottom:10,borderRadius:0}}
              value={day.title} onChange={e=>updDay({title:e.target.value})} placeholder="Titre de la journée..."/>
            <input style={{...inp,height:34,fontSize:13}} type="date" value={day.date} onChange={e=>updDay({date:e.target.value})}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {items.length>0&&<Chip bg={T.aD} c={T.ac}>{done}/{items.length} ✓</Chip>}
              {total>0&&<Chip bg={T.gD} c={T.gold}>{total.toFixed(2)} {trip.currency||"€"}</Chip>}
            </div>
            <div style={{display:"flex",gap:5}}>
              {!showDel
                ?<button className="bh" style={B("danger","sm")} onClick={()=>setShowDel(true)}>🗑</button>
                :<><button className="bh" style={B("danger","sm")} onClick={delDay}>Oui</button>
                  <button className="bh" style={B("ghost","sm")} onClick={()=>setShowDel(false)}>Non</button></>}
            </div>
          </div>
        </div>
        {items.length>0&&<div style={{background:T.sf3,borderRadius:4,height:4,overflow:"hidden",marginBottom:12}}>
          <div style={{height:"100%",borderRadius:4,width:`${(done/items.length)*100}%`,background:`linear-gradient(90deg,${T.gold},${T.ac})`,transition:"width 0.4s"}}/>
        </div>}
        <textarea style={{...inp,minHeight:52,resize:"vertical",fontSize:13,lineHeight:1.6}}
          placeholder="Notes pour cette journée..." value={day.notes||""} onChange={e=>updDay({notes:e.target.value})}/>
      </div>
      {items.length>0&&<div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
        {Object.entries(ITEM_CATS).map(([key,cat])=>{
          const cnt=items.filter(i=>i.category===key).length; if(!cnt) return null;
          return <Chip key={key} bg={`${cat.color}20`} c={cat.color}>{cat.emoji} {cat.label} · {cnt}</Chip>;
        })}
      </div>}
      {items.length===0&&<Empty T={T} emoji="🗺" text="Ajoutez des activités, repas, transports pour cette journée."/>}
      <div>
        {sorted.map(item=>{
          const cat=ITEM_CATS[item.category]||ITEM_CATS.activity;
          return (
            <div key={item.id} className="item-row" style={{background:T.sf,border:`1px solid ${T.br}`,borderLeft:`3px solid ${cat.color}`,borderRadius:"0 10px 10px 0",marginBottom:8,padding:"12px 14px",opacity:item.done?0.55:1,transition:"all 0.2s"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <input type="checkbox" checked={item.done} style={{accentColor:T.gold,width:16,height:16,cursor:"pointer",marginTop:2,flexShrink:0}}
                  onChange={()=>updItem(item.id,{done:!item.done})}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:3}}>
                    {item.time&&<span style={{fontSize:12,color:T.txS,fontWeight:600}}>{item.time}</span>}
                    <Chip bg={`${cat.color}18`} c={cat.color}>{cat.emoji} {cat.label}</Chip>
                    {item.rating>0&&<span style={{fontSize:11,color:T.gold}}>{"★".repeat(item.rating)}</span>}
                  </div>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:2,textDecoration:item.done?"line-through":"none",color:item.done?T.txS:T.tx}}>{item.title||"Sans titre"}</div>
                  {item.location&&<div style={{fontSize:12,color:T.txS}}>📍 {item.location}</div>}
                  {item.notes&&<div style={{fontSize:12,color:T.txS,marginTop:4,fontStyle:"italic",lineHeight:1.5}}>{item.notes}</div>}
                  {item.link&&<a href={item.link} target="_blank" rel="noreferrer" style={{fontSize:11,color:T.bl,textDecoration:"none",marginTop:4,display:"inline-block"}}>🔗 Voir le lien</a>}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                  {item.cost&&<span style={{fontSize:14,color:T.gold,fontWeight:700}}>{item.cost} {trip.currency||"€"}</span>}
                  <div className="ia" style={{display:"flex",gap:4,opacity:0,transition:"opacity 0.15s"}}>
                    <button className="bh" style={{background:T.sf3,border:`1px solid ${T.br}`,borderRadius:6,padding:"3px 8px",cursor:"pointer",color:T.txS,fontSize:13}} onClick={()=>openModal("editItem",{...item})}>✎</button>
                    <button className="bh" style={{background:T.rD,border:`1px solid ${T.rd}44`,borderRadius:6,padding:"3px 8px",cursor:"pointer",color:T.rd,fontSize:13}} onClick={()=>delItem(item.id)}>×</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── EMPTY ──────────────────────────────────────────────────────────────── */
function Empty({T,emoji,text}) {
  return (
    <div style={{textAlign:"center",padding:"48px 20px",background:T.sf,borderRadius:12,border:`1px dashed ${T.br}`}}>
      <div style={{fontSize:36,marginBottom:10}}>{emoji}</div>
      <p style={{color:T.txS,fontSize:14}}>{text}</p>
    </div>
  );
}

/* ─── MODAL WRAPPER ──────────────────────────────────────────────────────── */
function Modal({T,S,title,onClose,onSave,saveLabel,children,wide}) {
  return (
    <div style={{position:"fixed",inset:0,background:"#00000092",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(6px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="slide-in" style={{background:T.sf,border:`1px solid ${T.br}`,borderRadius:16,padding:26,width:`min(${wide?620:520}px,93vw)`,maxHeight:"90vh",overflowY:"auto"}}>
        <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:T.gold,marginBottom:20}}>{title}</h2>
        {children}
        {onSave&&<div style={{display:"flex",gap:8,marginTop:18}}>
          <button className="bh" style={{...S.btn("primary"),flex:1,justifyContent:"center"}} onClick={onSave}>{saveLabel||"✓ Sauvegarder"}</button>
          <button className="bh" style={S.btn("ghost")} onClick={onClose}>Annuler</button>
        </div>}
      </div>
    </div>
  );
}

/* ─── SHARE MODAL ────────────────────────────────────────────────────────── */
function ShareModal({T,S,trip,syncSt,onClose,onShare,onUnsync}) {
  const code=shortId(trip.id);
  const [copied,setCopied]=useState(false);
  const copy=(text)=>{ navigator.clipboard?.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  const lnk=`${window.location.origin}${window.location.pathname}`;
  return (
    <Modal T={T} S={S} title="☁ Partager ce voyage" onClose={onClose} onSave={null}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:40,marginBottom:8}}>{trip.coverEmoji||"✈"}</div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:700,marginBottom:4}}>{trip.name}</div>
        {trip.synced
          ?<span style={{background:T.aD,color:T.ac,fontSize:12,padding:"3px 10px",borderRadius:20,fontWeight:600}}>☁ Actuellement partagé</span>
          :<span style={{background:T.sf3,color:T.txS,fontSize:12,padding:"3px 10px",borderRadius:20}}>Non partagé</span>}
      </div>

      {/* Code de partage */}
      <div style={{background:T.sf2,border:`1px solid ${T.br}`,borderRadius:12,padding:20,marginBottom:16,textAlign:"center"}}>
        <div style={{fontSize:11,color:T.txS,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:12}}>Code de partage</div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:42,fontWeight:700,color:T.gold,letterSpacing:"8px",marginBottom:12}}>{code}</div>
        <p style={{fontSize:12,color:T.txS,marginBottom:14,lineHeight:1.5}}>Partagez ce code avec vos compagnons de voyage.<br/>Ils pourront rejoindre en cliquant sur <strong style={{color:T.cy}}>🔗 Rejoindre</strong> dans l'en-tête.</p>
        <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          {!trip.synced
            ?<button className="bh" style={{...S.btn("sync"),fontSize:14}} onClick={onShare}>
              {syncSt==="syncing"?<span className="spin">🔄</span>:"☁"} Activer le partage
            </button>
            :<>
              <button className="bh" style={{...S.btn("sync","sm")}} onClick={()=>copy(code)}>
                {copied?"✓ Copié !":"📋 Copier le code"}
              </button>
              <button className="bh" style={{...S.btn("danger","sm")}} onClick={()=>{onUnsync();onClose();}}>
                🔒 Désactiver le partage
              </button>
            </>}
        </div>
      </div>

      {/* Info */}
      <div style={{background:T.bD,border:`1px solid ${T.bl}33`,borderRadius:10,padding:14}}>
        <div style={{fontSize:12,color:T.bl,lineHeight:1.7}}>
          <strong>Comment ça marche :</strong><br/>
          🔄 Les modifications sont synchronisées automatiquement toutes les 45 secondes.<br/>
          👥 Plusieurs voyageurs peuvent consulter et éditer en même temps.<br/>
          🔒 Désactivez le partage pour revenir en mode privé.
        </div>
      </div>
      <button className="bh" style={{...S.btn("ghost"),width:"100%",justifyContent:"center",marginTop:12}} onClick={onClose}>Fermer</button>
    </Modal>
  );
}

/* ─── JOIN MODAL ─────────────────────────────────────────────────────────── */
function JoinModal({T,S,onClose,onJoin}) {
  const [code,setCode]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const handle=async()=>{
    if(code.trim().length<7){setErr("Le code doit faire au moins 7 caractères.");return;}
    setLoading(true);setErr("");
    const ok=await onJoin(code.trim().toUpperCase());
    setLoading(false);
    if(ok) onClose();
    else setErr("Code introuvable. Vérifiez le code partagé.");
  };
  const {inp}=S;
  return (
    <Modal T={T} S={S} title="🔗 Rejoindre un voyage partagé" onClose={onClose} onSave={null}>
      <p style={{fontSize:13,color:T.txS,marginBottom:20,lineHeight:1.6}}>Demandez le <strong style={{color:T.cy}}>code de partage</strong> à l'organisateur du voyage, puis entrez-le ci-dessous.</p>
      <div style={{marginBottom:16}}>
        <input style={{...inp,fontSize:20,textAlign:"center",letterSpacing:"6px",fontFamily:"'Cormorant Garamond',serif",fontWeight:700,textTransform:"uppercase",height:54}}
          placeholder="ABC1234" maxLength={7} value={code}
          onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}
          onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {err&&<div style={{fontSize:12,color:T.rd,marginTop:8}}>{err}</div>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="bh" style={{...S.btn("sync"),flex:1,justifyContent:"center",fontSize:14}} onClick={handle} disabled={loading}>
          {loading?<span className="spin">🔄</span>:"🔗"} {loading?"Recherche...":"Rejoindre le voyage"}
        </button>
        <button className="bh" style={S.btn("ghost")} onClick={onClose}>Annuler</button>
      </div>
      <div style={{marginTop:16,background:T.cD,border:`1px solid ${T.cy}33`,borderRadius:10,padding:12}}>
        <p style={{fontSize:12,color:T.cy,lineHeight:1.6}}>
          ☁ Le voyage sera ajouté à votre liste et synchronisé automatiquement avec les modifications de l'organisateur.
        </p>
      </div>
    </Modal>
  );
}

/* ─── TRIP MODAL ─────────────────────────────────────────────────────────── */
function TripModal({T,S,data,isEdit,onChange,onClose,onSave}) {
  const set=(k,v)=>onChange(p=>({...p,[k]:v}));
  const [part,setPart]=useState("");
  const {inp,lbl}=S;
  const F=({label,children,half})=>(<div style={{marginBottom:11,gridColumn:half?"auto":"span 2"}}><label style={lbl}>{label}</label>{children}</div>);
  return (
    <Modal T={T} S={S} title={isEdit?"✎ Modifier le voyage":"＋ Nouveau voyage"} onClose={onClose} onSave={onSave} saveLabel={isEdit?"Sauvegarder":"Créer le voyage"}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <F label="Nom du voyage"><input style={inp} value={data.name} onChange={e=>set("name",e.target.value)} placeholder="Mon voyage à..."/></F>
        <F label="Destination" half><input style={inp} value={data.destination||""} onChange={e=>set("destination",e.target.value)} placeholder="Tokyo"/></F>
        <F label="Pays" half><input style={inp} value={data.country||""} onChange={e=>set("country",e.target.value)} placeholder="Japon"/></F>
        <F label="Départ" half><input style={inp} type="date" value={data.startDate||""} onChange={e=>set("startDate",e.target.value)}/></F>
        <F label="Retour" half><input style={inp} type="date" value={data.endDate||""} onChange={e=>set("endDate",e.target.value)}/></F>
        <F label="Budget" half><input style={inp} type="number" value={data.budget||""} onChange={e=>set("budget",e.target.value)} placeholder="3000"/></F>
        <F label="Devise" half><select style={inp} value={data.currency||"EUR"} onChange={e=>set("currency",e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select></F>
        <F label="Icône">
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {EMOJIS.map(e=>(
              <button key={e} onClick={()=>set("coverEmoji",e)} style={{width:34,height:34,borderRadius:8,border:`1px solid ${data.coverEmoji===e?T.gold:T.br}`,background:data.coverEmoji===e?T.gD:T.sf2,fontSize:16,cursor:"pointer"}}>{e}</button>
            ))}
          </div>
        </F>
        <F label="Participants">
          <div style={{display:"flex",gap:7,marginBottom:8}}>
            <input style={{...inp,flex:1,height:34}} placeholder="Prénom..." value={part} onChange={e=>setPart(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&part.trim()){onChange(p=>({...p,participants:[...(p.participants||[]),part.trim()]}));setPart("");}}}/>
            <button className="bh" style={{...S.btn("primary","sm"),height:34,padding:"0 14px"}}
              onClick={()=>{if(part.trim()){onChange(p=>({...p,participants:[...(p.participants||[]),part.trim()]}));setPart("");}}}>＋</button>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {(data.participants||[]).map((p,i)=>(
              <span key={i} style={{display:"inline-flex",alignItems:"center",gap:5,background:T.sf3,borderRadius:20,padding:"3px 10px",fontSize:12,border:`1px solid ${T.br}`}}>
                {p}<button style={{background:"none",border:"none",cursor:"pointer",color:T.rd,fontSize:13,lineHeight:1}} onClick={()=>onChange(d=>({...d,participants:d.participants.filter((_,j)=>j!==i)}))}>×</button>
              </span>
            ))}
          </div>
        </F>
      </div>
    </Modal>
  );
}

/* ─── DAY MODAL ──────────────────────────────────────────────────────────── */
function DayModal({T,S,data,onChange,onClose,onSave}) {
  const set=(k,v)=>onChange(p=>({...p,[k]:v}));
  const {inp,lbl}=S;
  return (
    <Modal T={T} S={S} title="＋ Ajouter un jour" onClose={onClose} onSave={onSave} saveLabel="Créer le jour">
      <div style={{marginBottom:11}}><label style={lbl}>Titre</label><input style={inp} value={data.title||""} onChange={e=>set("title",e.target.value)} placeholder="Arrivée, Plage, Visite..."/></div>
      <div style={{marginBottom:11}}><label style={lbl}>Date</label><input style={inp} type="date" value={data.date||""} onChange={e=>set("date",e.target.value)}/></div>
      <div><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:70,resize:"vertical"}} value={data.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Informations pour cette journée..."/></div>
    </Modal>
  );
}

/* ─── ITEM MODAL ─────────────────────────────────────────────────────────── */
function ItemModal({T,S,data,isEdit,currency,onChange,onClose,onSave}) {
  const set=(k,v)=>onChange(p=>({...p,[k]:v}));
  const {btn:B,inp,lbl}=S;
  return (
    <Modal T={T} S={S} title={isEdit?"✎ Modifier l'étape":"＋ Ajouter une étape"} onClose={onClose} onSave={()=>data.title?.trim()&&onSave()} saveLabel={isEdit?"Sauvegarder":"Ajouter"}>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
        {Object.entries(ITEM_CATS).map(([key,cat])=>(
          <button key={key} className="bh" onClick={()=>set("category",key)} style={{...B("ghost","sm"),background:data.category===key?`${cat.color}22`:"transparent",border:`1px solid ${data.category===key?cat.color:T.br}`,color:data.category===key?cat.color:T.txS}}>{cat.emoji} {cat.label}</button>
        ))}
      </div>
      <div style={{marginBottom:11}}><label style={lbl}>Titre *</label><input style={inp} autoFocus value={data.title||""} onChange={e=>set("title",e.target.value)} placeholder="Nom de l'activité..."/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:11}}>
        <div><label style={lbl}>Heure</label><input style={inp} type="time" value={data.time||""} onChange={e=>set("time",e.target.value)}/></div>
        <div><label style={lbl}>Coût ({currency})</label><input style={inp} type="number" step="0.01" value={data.cost||""} onChange={e=>set("cost",e.target.value)} placeholder="0"/></div>
      </div>
      <div style={{marginBottom:11}}><label style={lbl}>Lieu / Adresse</label><input style={inp} value={data.location||""} onChange={e=>set("location",e.target.value)} placeholder="Adresse, nom du lieu..."/></div>
      <div style={{marginBottom:11}}><label style={lbl}>Lien</label><input style={inp} value={data.link||""} onChange={e=>set("link",e.target.value)} placeholder="https://..."/></div>
      <div style={{marginBottom:11}}><label style={lbl}>Notes / Conseils</label><textarea style={{...inp,minHeight:64,resize:"vertical"}} value={data.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Réservation requise, code wifi, tenue correcte..."/></div>
      <div><label style={lbl}>Note (1–5 ★)</label>
        <div style={{display:"flex",gap:5}}>
          {[1,2,3,4,5].map(n=>(
            <button key={n} onClick={()=>set("rating",n===data.rating?0:n)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:n<=(data.rating||0)?T.gold:T.br,transition:"color 0.15s"}}>★</button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
