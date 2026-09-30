"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { supabase } from "./supabase";
import type { PickleBatchRecord } from "./labAreas";

type Person = { id: number; display_name: string };
type Pair = { name: string; rating: string; notes: string };
type Draft = { version: 1; requestId: string; fields: Record<string, string>; foods: Pair[]; spirits: Pair[] };
type Tasting = {
  id: string; taster_person_id: number; overall_rating: number | null; raw_rating_text: string | null;
  crunch: number | null; salt_balance: number | null; sourness: number | null; heat: number | null;
  flavor_intensity: number | null; interestingness: number | null; would_eat_again: boolean | null;
  would_explore_branch: boolean | null; verbatim_comments: unknown; rating_context: string;
  state: { observed_at: string | null; fermentation_day: number | null; storage_stage: string | null;
    ph: number | null; temperature_c: number | null; aroma: string | null; texture: string | null; brine_appearance: string | null };
  foodPairings: { id: string; food_raw: string; rating: number | null; notes: string | null }[];
  picklebacks: { id: string; liquor_raw: string; rating: number | null; notes: string | null }[];
};
const axes = [
  ["crunch", "crunch", "Crunch", "0 soft · 10 very crisp"],
  ["saltBalance", "salt_balance", "Salt balance", "0 poorly balanced · 10 just right"],
  ["sourness", "sourness", "Sourness", "0 none · 10 very sour"],
  ["heat", "heat", "Heat", "0 none · 10 very hot"],
  ["flavorIntensity", "flavor_intensity", "Flavor intensity", "0 faint · 10 intense"],
  ["interestingness", "interestingness", "Interestingness", "0 familiar · 10 fascinating"],
] as const;
const blankPair = (): Pair => ({ name: "", rating: "", notes: "" });
function localDateTime() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); }
function comments(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(comments).filter(Boolean).join("\n");
  return value == null ? "" : JSON.stringify(value);
}

export function PickleBatchDetail({ batch, people, draftOwnerId, currentPersonId, onBack, onSaved }: {
  batch: PickleBatchRecord; people: Person[]; draftOwnerId: string; currentPersonId: number | null;
  onBack: () => void; onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [tastings, setTastings] = useState<Tasting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const result = await supabase.schema("lab").rpc("get_pickle_tastings", { p_batch_id: batch.id });
        if (!active) return;
        if (result.error) throw result.error;
        setTastings((result.data ?? []) as Tasting[]);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : String((e as {message?: string})?.message ?? e)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [batch.id, revision]);
  if (editing) return <PickleTastingForm batch={batch} people={people} draftOwnerId={draftOwnerId} currentPersonId={currentPersonId}
    onBack={() => setEditing(false)} onSaved={async () => {
      setEditing(false); setSaved(true); setRevision(v => v + 1);
      try { await onSaved(); } catch { /* History reload above remains independently available. */ }
    }} />;
  return <div className="page inner-page pickle-lab-page">
    <button type="button" className="ghost-button" onClick={onBack}><ArrowLeft /> All batches</button>
    <div className="page-heading area-heading"><div><p className="eyebrow pickle-eyebrow">{batch.batchCode}</p>
      <h1>{batch.experiment?.title ?? "Pickle batch"}</h1><p>{batch.experiment?.researchQuestion}</p></div>
      <button className="primary-button pickle-button" onClick={() => {setSaved(false); setEditing(true);}}><Plus /> Add tasting</button>
    </div>
    {saved && <p className="draft-status" role="status">Tasting recorded. Your notes are saved to the household.</p>}
    <section className="pickle-batch-card"><h2>The jar</h2>
      {batch.experiment?.hypothesis && <p>{batch.experiment.hypothesis}</p>}
      <div className="batch-ingredient-cloud">{batch.ingredients.map(i => <span key={i.id}>{i.quantityValue ?? ""} {i.quantityUnit} {i.name}</span>)}</div>
      <p>{batch.fermentationType.replaceAll("_", " ")} · Prepared {batch.preparedAt ? new Date(batch.preparedAt).toLocaleDateString() : "date not recorded"}</p>
    </section>
    <h2 className="pickle-history-heading">Tasting history</h2>
    {loading ? <p role="status">Loading tastings…</p> : error ? <div role="alert"><p className="form-message error">{error}</p><button className="ghost-button" onClick={() => setRevision(v=>v+1)}>Retry history</button></div> : tastings.length === 0 ? <p>No results yet. Add your first tasting above.</p> :
      <div className="pickle-tasting-history">{tastings.map(t => <article className="pickle-batch-card" key={t.id}>
        <div className="batch-card-topline"><strong>{people.find(p => p.id===t.taster_person_id)?.display_name ?? "Taster"}</strong>
          <span>{t.overall_rating !== null ? `${t.overall_rating} / 20` : "Unscored"}</span></div>
        <p>{t.state.observed_at ? new Date(t.state.observed_at).toLocaleString() : "Date not recorded"}
          {t.state.fermentation_day !== null ? ` · Day ${t.state.fermentation_day}` : ""}{t.state.storage_stage ? ` · ${t.state.storage_stage}` : ""}</p>
        {t.rating_context === "retrospective_review" && <small>Rated from memory afterward</small>}
        {t.raw_rating_text && <p>Original rating: {t.raw_rating_text}</p>}
        <dl className="pickle-scores">{axes.map(([, key, label]) => t[key] !== null && <div key={key}><dt>{label}</dt><dd>{t[key]} / 10</dd></div>)}</dl>
        {comments(t.verbatim_comments) && <p className="pickle-verbatim">{comments(t.verbatim_comments)}</p>}
        <dl className="pickle-scores">{([['Aroma',t.state.aroma],['Texture',t.state.texture],['Brine appearance',t.state.brine_appearance],['pH',t.state.ph],['Temperature °C',t.state.temperature_c],['Eat again', t.would_eat_again===null?null:t.would_eat_again?'Yes':'No'],['Explore this branch',t.would_explore_branch===null?null:t.would_explore_branch?'Yes':'No']] as const).map(([label,value])=>value!==null && <div key={label}><dt>{label}</dt><dd className="pickle-verbatim">{value}</dd></div>)}</dl>
        {t.foodPairings.map(p => <div className="pickle-pairing-result" key={p.id}><strong>With {p.food_raw}{p.rating!==null?` · ${p.rating} / 20`:""}</strong><p className="pickle-verbatim">{p.notes}</p></div>)}
        {t.picklebacks.map(p => <div className="pickle-pairing-result" key={p.id}><strong>Pickleback · {p.liquor_raw}{p.rating!==null?` · ${p.rating} / 20`:""}</strong><p className="pickle-verbatim">{p.notes}</p></div>)}
      </article>)}</div>}
  </div>;
}

function PickleTastingForm({ batch, people, draftOwnerId, currentPersonId, onBack, onSaved }: {
  batch: PickleBatchRecord; people: Person[]; draftOwnerId: string; currentPersonId: number | null;
  onBack: () => void; onSaved: () => Promise<void>;
}) {
  const storageKey = `apartmentLab:pickleTasting:v1:${draftOwnerId}:${batch.id}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const finished = useRef(false);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draftStatus, setDraftStatus] = useState("Preparing draft…");
  function persist(value: Draft) {
    draftRef.current = value; setDraft(value);
    try { localStorage.setItem(storageKey, JSON.stringify(value)); setDraftStatus("Draft saved on this device."); }
    catch { setDraftStatus("Device storage unavailable. Keep this form open until you record the tasting."); }
  }
  useEffect(() => {
    const fresh: Draft = { version: 1, requestId: crypto.randomUUID(), fields: { observedAt: localDateTime(), tasterPersonId: String(currentPersonId ?? people[0]?.id ?? ""), ratingContext: "contemporaneous" }, foods: [], spirits: [] };
    let value = fresh;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const old = JSON.parse(raw);
        if (old.version !== 1 || typeof old.requestId!=="string" || !old.fields || typeof old.fields!=="object" || !Array.isArray(old.foods) || !Array.isArray(old.spirits)) throw new Error("Invalid draft");
        value = old; setDraftStatus("Your unfinished tasting was restored.");
      } else setDraftStatus("Drafts save on this device as you type.");
    } catch { setDraftStatus("Could not restore a device draft. Keep this form open until saved."); }
    draftRef.current = value; setDraft(value);
    const flush = () => { if (!finished.current && draftRef.current) { try { localStorage.setItem(storageKey, JSON.stringify(draftRef.current)); } catch { /* Status is surfaced by persist. */ } } };
    window.addEventListener("pagehide",flush); document.addEventListener("visibilitychange",flush);
    return () => { flush(); window.removeEventListener("pagehide",flush); document.removeEventListener("visibilitychange",flush); };
  // The form is keyed to one authenticated user and batch for its entire lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  if (!draft) return <p role="status">Preparing tasting form…</p>;
  const field = (name: string, value: string) => persist({...draft, fields: {...draft.fields,[name]:value}});
  async function submit(event: FormEvent) {
    event.preventDefault(); if (savingRef.current || !draftRef.current) return;
    const d = draftRef.current;
    savingRef.current = true; setSaving(true); setMessage("");
    try {
      const {error} = await supabase.schema("lab").rpc("create_pickle_tasting", {p_batch_id:batch.id,p_tasting:{
        ...d.fields, requestId:d.requestId, observedAt:new Date(d.fields.observedAt).toISOString(),
        foodPairings:d.foods.map(p=>({food:p.name,rating:p.rating,notes:p.notes})),
        picklebacks:d.spirits.map(p=>({spirit:p.name,rating:p.rating,notes:p.notes})),
      }});
      if (error) throw error;
      finished.current = true;
      try { localStorage.removeItem(storageKey); } catch { /* A retry uses the same ID and cannot duplicate this save. */ }
      await onSaved();
    } catch(e) { setMessage(e instanceof Error?e.message:String((e as {message?:string})?.message ?? e)); }
    finally { savingRef.current=false; setSaving(false); }
  }
  const input = (name:string,label:string,type="text",max?:number) => <label className="field" key={name}><span>{label}</span><input name={name} type={type} value={draft.fields[name]??""} onChange={e=>field(name,e.target.value)} {...(type==="number"?{step:"any",min:name==="temperatureC"?undefined:0,max,inputMode:"decimal" as const}:{})} /></label>;
  const text = (name:string,label:string,rows=3) => <label className="field wide"><span>{label}</span><textarea name={name} rows={rows} value={draft.fields[name]??""} onChange={e=>field(name,e.target.value)} /></label>;
  const pairEditor = (key:"foods"|"spirits",title:string) => <section className="form-section"><div className="section-content"><div className="section-title-row"><h2>{title}</h2><button type="button" className="small-add-button" onClick={()=>persist({...draft,[key]:[...draft[key],blankPair()]})}><Plus /> Add</button></div>
    {draft[key].map((pair,i)=><div className="pickle-pair-editor" key={i}>{([['name',key==='foods'?'Food':'Spirit / brand'],['rating','Rating · 0–20'],['notes','Pairing notes']] as const).map(([name,label])=><label className="field" key={name}><span>{label}</span>{name==='notes'?<textarea value={pair[name]} onChange={e=>persist({...draft,[key]:draft[key].map((p,j)=>j===i?{...p,[name]:e.target.value}:p)})}/>:<input required={name==='name'} type={name==='rating'?'number':'text'} min={0} max={20} step="any" value={pair[name]} onChange={e=>persist({...draft,[key]:draft[key].map((p,j)=>j===i?{...p,[name]:e.target.value}:p)})}/>}</label>)}<button type="button" className="ghost-button" aria-label={`Remove ${title} ${i+1}`} onClick={()=>persist({...draft,[key]:draft[key].filter((_,j)=>j!==i)})}><Trash2 /> Remove</button></div>)}
    </div></section>;
  return <div className="page inner-page pickle-lab-page"><button className="ghost-button" onClick={onBack} disabled={saving}><ArrowLeft /> Keep draft &amp; return to batch</button>
    <div className="page-heading"><div><p className="eyebrow pickle-eyebrow">{batch.batchCode} · {batch.experiment?.title}</p><h1>Add a pickle tasting</h1><p>One person’s observations at one moment. Leave anything you did not assess blank.</p></div></div>
    <form className="tasting-form" onSubmit={submit}><fieldset className="pickle-form-fields" disabled={saving}>
      <div className="draft-status" role="status"><span>{draftStatus}</span><button type="button" onClick={()=>{if(window.confirm("Discard this unfinished tasting?")){finished.current=true;try{localStorage.removeItem(storageKey);}catch{}onBack();}}}>Discard draft</button></div>
      <section className="form-section"><div className="section-content"><h2>The moment</h2><div className="form-grid">
        <label className="field"><span>Taster *</span><select required value={draft.fields.tasterPersonId??""} onChange={e=>field('tasterPersonId',e.target.value)}><option value="">Choose person</option>{people.map(p=><option value={p.id} key={p.id}>{p.display_name}</option>)}</select></label>
        <label className="field"><span>Tasted at *</span><input required type="datetime-local" value={draft.fields.observedAt??""} onChange={e=>field('observedAt',e.target.value)}/><small>Use when you tasted it, including for paper notes.</small></label>
        {input('fermentationDay','Fermentation day (if known)','number')}
        <label className="field"><span>Storage stage</span><select value={draft.fields.storageStage??""} onChange={e=>field('storageStage',e.target.value)}><option value="">Not recorded</option><option value="counter">Counter</option><option value="refrigerator">Refrigerator</option><option value="other">Other</option></select></label>
        <label className="field wide"><span>Source of rating</span><select value={draft.fields.ratingContext} onChange={e=>field('ratingContext',e.target.value)}><option value="contemporaneous">Observed while tasting (including written notes)</option><option value="retrospective_review">Remembered / rated afterward</option></select></label>
      </div></div></section>
      <section className="form-section"><div className="section-content"><h2>The results</h2><div className="form-grid">
        {text('notes','Original tasting notes / flavor observations',6)}
        {input('overallRating','Overall rating · 0–20','number',20)}{input('rawRatingText','Original rating text (optional)')}
        {axes.map(([key,,label,hint])=><label className="field" key={key}><span>{label} · 0–10</span><input type="number" min={0} max={10} step="any" inputMode="decimal" value={draft.fields[key]??""} onChange={e=>field(key,e.target.value)}/><small>{hint}</small></label>)}
        {(['wouldEatAgain','wouldExploreBranch'] as const).map((key,i)=><label className="field" key={key}><span>{i===0?'Would eat again?':'Explore this branch further?'}</span><select value={draft.fields[key]??""} onChange={e=>field(key,e.target.value)}><option value="">Not decided</option><option value="true">Yes</option><option value="false">No</option></select></label>)}
      </div></div></section>
      <details className="pickle-observations"><summary>Jar observations · optional</summary><div className="form-grid">{text('aroma','Aroma')}{text('texture','Texture')}{text('brineAppearance','Brine appearance')}{input('ph','Measured pH','number',14)}{input('temperatureC','Temperature · °C','number')}</div></details>
      {pairEditor('foods','Food pairings')}{pairEditor('spirits','Picklebacks')}
      {message && <p className="form-message error" role="alert">{message} Your draft is retained.</p>}
      <div className="form-actions"><button type="button" className="ghost-button" onClick={onBack}>Keep draft &amp; exit</button><button className="primary-button pickle-button" type="submit">{saving?'Recording…':'Record pickle tasting'}</button></div>
    </fieldset></form>
  </div>;
}
