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
              <p style={{co
