"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Compass,
  FlaskConical,
  Grape,
  History,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageCircle,
  Plus,
  Sparkles,
  Wine,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

type View = "overview" | "history" | "tasting" | "detail";

type Person = {
  id: number;
  display_name: string;
};

type Membership = {
  person_id: number;
};

type Review = {
  id: string;
  tasting_session_id: string;
  person_id: number;
  overall_enjoyment: number | null;
  overall_rating_raw: string | null;
  personal_notes: string | null;
  review_status: string;
};

type TastingRecord = {
  id: string;
  bottle_id: string;
  started_at: string | null;
  created_at: string;
  date_precision: string;
  location_name: string | null;
  location_context: string | null;
  occasion_notes: string | null;
  wineName: string;
  producerName: string;
  vintage: string;
  geography: string | null;
  colorStyle: string | null;
  reviews: Review[];
};

type DatabaseRows = {
  tastingSessions: Array<Record<string, unknown>>;
  bottles: Array<Record<string, unknown>>;
  releases: Array<Record<string, unknown>>;
  wines: Array<Record<string, unknown>>;
  producers: Array<Record<string, unknown>>;
  reviews: Review[];
  people: Person[];
  membership: Membership | null;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function buildRecords(rows: DatabaseRows): TastingRecord[] {
  const bottles = new Map(rows.bottles.map((row) => [row.id, row]));
  const releases = new Map(rows.releases.map((row) => [row.id, row]));
  const wines = new Map(rows.wines.map((row) => [row.id, row]));
  const producers = new Map(rows.producers.map((row) => [row.id, row]));
  const reviewsBySession = new Map<string, Review[]>();

  rows.reviews.forEach((review) => {
    const existing = reviewsBySession.get(review.tasting_session_id) ?? [];
    existing.push(review);
    reviewsBySession.set(review.tasting_session_id, existing);
  });

  return rows.tastingSessions
    .map((session) => {
      const bottle = bottles.get(session.bottle_id);
      const release = bottle ? releases.get(bottle.release_id) : undefined;
      const wine = release ? wines.get(release.wine_id) : undefined;
      const producer = wine ? producers.get(wine.producer_id) : undefined;
      const vintageYear = release ? numberValue(release.vintage_year) : null;

      return {
        id: String(session.id),
        bottle_id: String(session.bottle_id),
        started_at: stringValue(session.started_at),
        created_at: String(session.created_at),
        date_precision: String(session.date_precision),
        location_name: stringValue(session.location_name),
        location_context: stringValue(session.location_context),
        occasion_notes: stringValue(session.occasion_notes),
        wineName:
          stringValue(wine?.cuvee_name) ??
          stringValue(wine?.wine_name_raw) ??
          "Unnamed wine",
        producerName: stringValue(producer?.name) ?? "Unknown producer",
        vintage:
          vintageYear?.toString() ??
          stringValue(release?.vintage_raw) ??
          "Vintage unknown",
        geography:
          stringValue(release?.region) ??
          stringValue(release?.geography_raw),
        colorStyle: stringValue(wine?.color_style),
        reviews: (reviewsBySession.get(String(session.id)) ?? []).sort(
          (a, b) => a.person_id - b.person_id,
        ),
      };
    })
    .sort((a, b) => {
      const aDate = new Date(a.started_at ?? a.created_at).getTime();
      const bDate = new Date(b.started_at ?? b.created_at).getTime();
      return bDate - aDate;
    });
}

function formatDate(value: string | null, precision: string): string {
  if (!value || precision === "unknown") return "Historical session";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function personName(people: Person[], personId: number): string {
  return people.find((person) => person.id === personId)?.display_name ?? "Taster";
}

function averageRating(reviews: Review[]): string {
  const ratings = reviews
    .map((review) => review.overall_enjoyment)
    .filter((rating): rating is number => rating !== null);
  if (!ratings.length) return "—";
  const average = ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
  return Number.isInteger(average) ? average.toFixed(0) : average.toFixed(1);
}

export default function Home() {
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [records, setRecords] = useState<TastingRecord[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [currentPersonId, setCurrentPersonId] = useState<number | null>(null);
  const [view, setView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLab = useCallback(async () => {
    setLoading(true);
    setError(null);

    const wine = supabase.schema("wine");
    const lab = supabase.schema("lab");
    const [
      tastingSessionsResult,
      bottlesResult,
      releasesResult,
      winesResult,
      producersResult,
      reviewsResult,
      peopleResult,
      membershipResult,
    ] = await Promise.all([
      wine.from("tasting_sessions").select("*").eq("household_id", 1),
      wine.from("bottles").select("*").eq("household_id", 1),
      wine.from("releases").select("*").eq("household_id", 1),
      wine.from("wines").select("*").eq("household_id", 1),
      wine.from("producers").select("*").eq("household_id", 1),
      wine.from("reviews").select("*").eq("household_id", 1),
      lab
        .from("people")
        .select("id, display_name")
        .eq("household_id", 1)
        .order("id"),
      lab
        .from("memberships")
        .select("person_id")
        .limit(1)
        .maybeSingle(),
    ]);

    const results = [
      tastingSessionsResult,
      bottlesResult,
      releasesResult,
      winesResult,
      producersResult,
      reviewsResult,
      peopleResult,
      membershipResult,
    ];
    const failed = results.find((result) => result.error);

    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    const rows: DatabaseRows = {
      tastingSessions: tastingSessionsResult.data ?? [],
      bottles: bottlesResult.data ?? [],
      releases: releasesResult.data ?? [],
      wines: winesResult.data ?? [],
      producers: producersResult.data ?? [],
      reviews: (reviewsResult.data ?? []) as Review[],
      people: (peopleResult.data ?? []) as Person[],
      membership: membershipResult.data as Membership | null,
    };

    setPeople(rows.people);
    setCurrentPersonId(rows.membership?.person_id ?? null);
    setRecords(buildRecords(rows));
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
      if (data.session) {
        void loadLab();
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      if (session) {
        void loadLab();
      } else {
        setRecords([]);
        setPeople([]);
        setCurrentPersonId(null);
        setView("overview");
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadLab]);

  if (!authSession) {
    return <LoginScreen loading={loading} />;
  }

  const signedInPerson =
    people.find((person) => person.id === currentPersonId) ?? null;
  const profile = {
    name: signedInPerson?.display_name ?? "Scientist",
    initial: signedInPerson?.display_name.slice(0, 1) ?? "S",
  };
  const selectedRecord = records.find((record) => record.id === selectedId) ?? null;

  function openRecord(id: string) {
    setSelectedId(id);
    setView("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="app-shell">
      <Header
        view={view}
        profile={profile}
        onNavigate={setView}
        onSignOut={() => void supabase.auth.signOut()}
      />

      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadLab()}>
            Try again
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="loading-state">
          <LoaderCircle aria-hidden="true" className="spin" />
          <p>Calibrating the instruments…</p>
        </div>
      ) : null}

      {!loading && view === "overview" ? (
        <Overview
          name={profile.name}
          records={records}
          onNavigate={setView}
          onOpenRecord={openRecord}
        />
      ) : null}

      {!loading && view === "history" ? (
        <HistoryView records={records} onOpenRecord={openRecord} />
      ) : null}

      {!loading && view === "detail" && selectedRecord ? (
        <DetailView
          record={selectedRecord}
          people={people}
          onBack={() => setView("history")}
        />
      ) : null}

      {!loading && view === "tasting" ? (
        <NewTasting
          onCancel={() => setView("overview")}
          onSaved={async (sessionId) => {
            await loadLab();
            setSelectedId(sessionId);
            setView("detail");
          }}
        />
      ) : null}

      <MobileNav view={view} onNavigate={setView} />
    </main>
  );
}

function LoginScreen({ loading }: { loading: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("That password didn’t open the cellar. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-atmosphere" aria-hidden="true">
        <span className="orbit orbit-one" />
        <span className="orbit orbit-two" />
        <span className="orbit orbit-three" />
      </div>
      <section className="login-card">
        <div className="brand-mark">
          <FlaskConical aria-hidden="true" />
        </div>
        <p className="eyebrow">The Apartment Lab</p>
        <h1>Wine Lab</h1>
        <p className="login-intro">
          A private instrument for mapping the mysterious underlying Kyle.
        </p>

        <form onSubmit={handleLogin}>
          <label className="field">
            <span>Scientist email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              placeholder="Enter your lab email"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              placeholder="Enter your lab password"
            />
          </label>
          {message ? <p className="form-message error">{message}</p> : null}
          <button className="primary-button full" disabled={submitting || loading}>
            {submitting ? <LoaderCircle className="spin" /> : <Wine />}
            Enter the laboratory
          </button>
        </form>
        <p className="privacy-note">Private by design · protected by household access</p>
      </section>
    </main>
  );
}

function Header({
  view,
  profile,
  onNavigate,
  onSignOut,
}: {
  view: View;
  profile: { name: string; initial: string };
  onNavigate: (view: View) => void;
  onSignOut: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <header className="topbar">
      <button className="wordmark" type="button" onClick={() => onNavigate("overview")}>
        The Apartment Lab
      </button>
      <div className="section-mark">
        <span className="mini-flask">
          <FlaskConical aria-hidden="true" />
        </span>
        <span>Wine Lab</span>
      </div>
      <nav aria-label="Primary navigation">
        <button
          className={view === "overview" ? "active" : ""}
          onClick={() => onNavigate("overview")}
        >
          Overview
        </button>
        <button
          className={view === "tasting" ? "active" : ""}
          onClick={() => onNavigate("tasting")}
        >
          Tastings
        </button>
        <button
          className={view === "history" || view === "detail" ? "active" : ""}
          onClick={() => onNavigate("history")}
        >
          History
        </button>
      </nav>
      <div className="account-wrap">
        <button
          className="avatar"
          aria-label={`${profile.name} account`}
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((current) => !current)}
        >
          {profile.initial}
        </button>
        {accountOpen ? (
          <div className="account-menu">
            <p>{profile.name}</p>
            <button type="button" onClick={onSignOut}>
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function Overview({
  name,
  records,
  onNavigate,
  onOpenRecord,
}: {
  name: string;
  records: TastingRecord[];
  onNavigate: (view: View) => void;
  onOpenRecord: (id: string) => void;
}) {
  const latest = records[0];
  const reviewCount = records.reduce(
    (total, record) => total + record.reviews.length,
    0,
  );

  return (
    <div className="page overview-page">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Household research program · 001</p>
          <h1>Welcome back, {name}</h1>
          <div className="ornament-line" aria-hidden="true">
            <Sparkles />
            <span />
          </div>
          <div className="hero-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => onNavigate("tasting")}
            >
              <FlaskConical aria-hidden="true" />
              Start a tasting
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => onNavigate("history")}
            >
              <Compass aria-hidden="true" />
              Explore the history
            </button>
          </div>
        </div>
        <PalateInstrument records={records} />
      </section>

      <section className="summary-grid" aria-label="Wine Lab summary">
        <StatCard icon={<Grape />} value={records.length} label="wines explored" />
        <StatCard icon={<BookOpen />} value={reviewCount} label="reviews recorded" />
        {latest ? (
          <button className="recent-card" onClick={() => onOpenRecord(latest.id)}>
            <div className="instrument-dial" aria-hidden="true">
              <span />
            </div>
            <div className="recent-copy">
              <p className="eyebrow">Latest session</p>
              <h2>
                {latest.producerName} {latest.wineName}
              </h2>
              <div className="recent-meta">
                <span>
                  <CalendarDays />
                  {formatDate(latest.started_at, latest.date_precision)}
                </span>
                <span>
                  <MapPin />
                  {latest.vintage}
                </span>
                <span>
                  <MessageCircle />
                  {latest.reviews.length} reviews
                </span>
              </div>
              <div className="rating-row">
                <span>Joint signal</span>
                <strong>{averageRating(latest.reviews)} / 10</strong>
              </div>
            </div>
            <span className="round-arrow">
              <ArrowRight />
            </span>
          </button>
        ) : null}
      </section>

      <div className="kyle-line">
        <span className="compass-icon">
          <Sparkles />
        </span>
        <p>2 increasingly well-mapped Kyles.</p>
        <span className="line" />
        <span className="crosshair">+</span>
      </div>
    </div>
  );
}

function PalateInstrument({ records }: { records: TastingRecord[] }) {
  const ratings = records.flatMap((record) =>
    record.reviews
      .map((review) => review.overall_enjoyment)
      .filter((rating): rating is number => rating !== null),
  );
  const mean = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : 0;

  return (
    <div className="palate-map" aria-label={`Average enjoyment ${mean.toFixed(1)} out of 10`}>
      <span className="contour c1" />
      <span className="contour c2" />
      <span className="contour c3" />
      <span className="contour c4" />
      <span className="signal signal-one">+</span>
      <span className="signal signal-two">+</span>
      <span className="signal signal-three">+</span>
      <span className="map-label fruit">FRUIT</span>
      <span className="map-label acid">ACIDITY</span>
      <span className="map-label tannin">TANNIN</span>
      <span className="map-label finish">FINISH</span>
      <div className="map-core">
        <span>{mean.toFixed(1)}</span>
        <small>mean signal</small>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <strong>{value}</strong>
      </div>
      <div className="dotted-rule" />
      <p>{label}</p>
    </article>
  );
}

function HistoryView({
  records,
  onOpenRecord,
}: {
  records: TastingRecord[];
  onOpenRecord: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      [
        record.wineName,
        record.producerName,
        record.vintage,
        record.geography,
        record.location_context,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, records]);

  return (
    <div className="page inner-page">
      <div className="page-heading">
        <p className="eyebrow">Accumulated evidence</p>
        <h1>Tasting history</h1>
        <p>
          Every bottle remains a session, every scientist keeps her own voice.
        </p>
      </div>

      <label className="search-field">
        <Compass aria-hidden="true" />
        <span className="sr-only">Search tasting history</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search producer, wine, place, or vintage"
        />
      </label>

      <div className="history-list">
        {filtered.map((record, index) => (
          <button
            className="history-row"
            type="button"
            key={record.id}
            onClick={() => onOpenRecord(record.id)}
          >
            <span className="history-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="history-main">
              <small>{record.producerName}</small>
              <strong>{record.wineName}</strong>
              <span>
                {record.vintage} · {record.geography ?? "Origin not recorded"}
              </span>
            </span>
            <span className="history-rating">
              <strong>{averageRating(record.reviews)}</strong>
              <small>joint signal</small>
            </span>
            <span className="history-meta">
              {record.reviews.length} review{record.reviews.length === 1 ? "" : "s"}
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailView({
  record,
  people,
  onBack,
}: {
  record: TastingRecord;
  people: Person[];
  onBack: () => void;
}) {
  return (
    <div className="page inner-page detail-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft />
        Back to history
      </button>
      <section className="detail-hero">
        <div>
          <p className="eyebrow">{record.producerName}</p>
          <h1>{record.wineName}</h1>
          <div className="detail-meta">
            <span>
              <CalendarDays />
              {formatDate(record.started_at, record.date_precision)}
            </span>
            <span>
              <Wine />
              {record.vintage}
            </span>
            <span>
              <MapPin />
              {record.geography ?? record.location_context ?? "Home"}
            </span>
          </div>
        </div>
        <div className="score-seal">
          <strong>{averageRating(record.reviews)}</strong>
          <span>joint signal</span>
        </div>
      </section>

      {record.occasion_notes ? (
        <blockquote className="occasion-note">{record.occasion_notes}</blockquote>
      ) : null}

      <section className="review-grid">
        {record.reviews.map((review) => (
          <article className="review-card" key={review.id}>
            <div className="review-head">
              <span className="review-person">
                {personName(people, review.person_id).slice(0, 1)}
              </span>
              <div>
                <p>{personName(people, review.person_id)}</p>
                <small>{review.review_status.replace("_", " ")}</small>
              </div>
              <strong>
                {review.overall_enjoyment ?? review.overall_rating_raw ?? "—"}
                <span>/ 10</span>
              </strong>
            </div>
            <div className="dotted-rule" />
            <p className="review-notes">
              {review.personal_notes || "No prose observation was recorded."}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

function NewTasting({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (sessionId: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const optionalNumber = (key: string) => {
      const value = form.get(key)?.toString().trim();
      return value ? Number(value) : null;
    };
    const vintage = optionalNumber("vintage");
    const startedAt = form.get("startedAt")?.toString();

    const { data, error } = await supabase.schema("wine").rpc("create_tasting", {
      p_producer_name: form.get("producer")?.toString() ?? "",
      p_wine_name: form.get("wineName")?.toString() ?? "",
      p_vintage_year: vintage,
      p_geography: form.get("geography")?.toString() || null,
      p_color_style: form.get("colorStyle")?.toString() || null,
      p_started_at: startedAt ? new Date(startedAt).toISOString() : null,
      p_location_name: form.get("locationName")?.toString() || "Home",
      p_location_context: form.get("locationContext")?.toString() || "Home",
      p_occasion_notes: form.get("occasionNotes")?.toString() || null,
      p_gracie_enjoyment: optionalNumber("gracieEnjoyment"),
      p_gracie_notes: form.get("gracieNotes")?.toString() || null,
      p_kyle_enjoyment: optionalNumber("kyleEnjoyment"),
      p_kyle_notes: form.get("kyleNotes")?.toString() || null,
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    await onSaved(String(data));
  }

  return (
    <div className="page inner-page tasting-page">
      <div className="page-heading tasting-heading">
        <div>
          <p className="eyebrow">New observation</p>
          <h1>Start a tasting</h1>
          <p>Capture the bottle once. Preserve two distinct points of view.</p>
        </div>
        <button className="close-button" type="button" onClick={onCancel}>
          <X />
          <span className="sr-only">Cancel tasting</span>
        </button>
      </div>

      <form className="tasting-form" onSubmit={handleSubmit}>
        <section className="form-section">
          <div className="section-number">01</div>
          <div className="section-content">
            <h2>The bottle</h2>
            <div className="form-grid">
              <label className="field">
                <span>Producer *</span>
                <input name="producer" required placeholder="e.g. Stonewood" />
              </label>
              <label className="field">
                <span>Wine / cuvée *</span>
                <input name="wineName" required placeholder="e.g. Pinot Noir" />
              </label>
              <label className="field">
                <span>Vintage</span>
                <input
                  name="vintage"
                  type="number"
                  min="1000"
                  max="2200"
                  inputMode="numeric"
                  placeholder="Unknown is okay"
                />
              </label>
              <label className="field">
                <span>Color</span>
                <select name="colorStyle" defaultValue="">
                  <option value="">Not recorded</option>
                  <option value="red">Red</option>
                  <option value="white">White</option>
                  <option value="rose">Rosé</option>
                  <option value="orange">Orange</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="field wide">
                <span>Origin</span>
                <input name="geography" placeholder="Region, appellation, or raw label wording" />
              </label>
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="section-number">02</div>
          <div className="section-content">
            <h2>The occasion</h2>
            <div className="form-grid">
              <label className="field">
                <span>Started at</span>
                <input name="startedAt" type="datetime-local" />
              </label>
              <label className="field">
                <span>Place</span>
                <input name="locationName" defaultValue="Home" />
              </label>
              <label className="field wide">
                <span>Context / food</span>
                <input
                  name="locationContext"
                  defaultValue="Home"
                  placeholder="Pizza, dinner party, sitting on the kitchen floor…"
                />
              </label>
              <label className="field wide">
                <span>Shared occasion note</span>
                <textarea
                  name="occasionNotes"
                  rows={3}
                  placeholder="Anything true of the session rather than one person’s palate"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="section-number">03</div>
          <div className="section-content">
            <h2>Two scientists</h2>
            <div className="scientist-reviews">
              <ReviewFields person="Gracie" />
              <ReviewFields person="Kyle" />
            </div>
          </div>
        </section>

        {message ? <p className="form-message error">{message}</p> : null}
        <div className="form-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            Save no eggs
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? <LoaderCircle className="spin" /> : <Plus />}
            {saving ? "Recording…" : "Record tasting"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReviewFields({ person }: { person: "Gracie" | "Kyle" }) {
  const prefix = person.toLowerCase();

  return (
    <fieldset className="review-fields">
      <legend>
        <span>{person.slice(0, 1)}</span>
        {person}
      </legend>
      <label className="field">
        <span>Enjoyment · 0–10</span>
        <input
          name={`${prefix}Enjoyment`}
          type="number"
          min="0"
          max="10"
          step="0.5"
          inputMode="decimal"
          placeholder="Blank is honest"
        />
      </label>
      <label className="field">
        <span>What are you noticing?</span>
        <textarea
          name={`${prefix}Notes`}
          rows={6}
          placeholder="Sensory notes, feelings, memories, complaints, metaphors, flirtation—keep the useful human part."
        />
      </label>
    </fieldset>
  );
}

function MobileNav({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <button
        className={view === "overview" ? "active" : ""}
        onClick={() => onNavigate("overview")}
      >
        <FlaskConical />
        Lab
      </button>
      <button
        className={view === "tasting" ? "active create" : "create"}
        onClick={() => onNavigate("tasting")}
      >
        <Plus />
        Taste
      </button>
      <button
        className={view === "history" || view === "detail" ? "active" : ""}
        onClick={() => onNavigate("history")}
      >
        <History />
        History
      </button>
    </nav>
  );
}
