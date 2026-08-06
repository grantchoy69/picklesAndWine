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

type AppearanceObservation = {
  review_id: string;
  color_intensity_numeric: number | null;
  color_intensity_raw: string | null;
  hue_raw: string | null;
  clarity_raw: string | null;
  viscosity_numeric: number | null;
  viscosity_raw: string | null;
  notes: string | null;
};

type CheckpointMeasurement = {
  checkpoint_id: string;
  metric_code: string;
  value_numeric: number | null;
  value_raw: string | null;
};

type DescriptorObservation = {
  checkpoint_id: string;
  source_section: "fruit" | "non_fruit" | "extra_notes" | "palate" | "other";
  raw_text: string;
  sequence_number: number;
};

type ReviewCheckpoint = {
  id: string;
  review_id: string;
  sequence_number: number;
  stage: string;
  elapsed_open_minutes: number | null;
  notes: string | null;
  measurements: CheckpointMeasurement[];
  descriptors: DescriptorObservation[];
};

type PromptDefinition = {
  id: string;
  prompt_code: string;
  prompt_text: string;
  form_version: string;
  sequence_number: number;
};

type PromptResponse = {
  review_id: string;
  prompt_definition_id: string;
  response_text: string | null;
  sequence_number: number;
};

type Review = {
  id: string;
  tasting_session_id: string;
  person_id: number;
  overall_enjoyment: number | null;
  overall_rating_raw: string | null;
  personal_notes: string | null;
  review_status: string;
  form_version: string;
  appearance: AppearanceObservation | null;
  checkpoints: ReviewCheckpoint[];
  vibeResponses: Array<{
    code: string;
    prompt: string;
    response: string;
    sequence: number;
  }>;
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
  grapes: string[];
  priceAmount: number | null;
  priceRaw: string | null;
  reviews: Review[];
};

type DatabaseRows = {
  tastingSessions: Array<Record<string, unknown>>;
  bottles: Array<Record<string, unknown>>;
  releases: Array<Record<string, unknown>>;
  wines: Array<Record<string, unknown>>;
  producers: Array<Record<string, unknown>>;
  reviews: Array<Omit<Review, "appearance" | "checkpoints" | "vibeResponses">>;
  releaseGrapes: Array<Record<string, unknown>>;
  grapes: Array<Record<string, unknown>>;
  reviewCheckpoints: Array<Omit<ReviewCheckpoint, "measurements" | "descriptors">>;
  appearanceObservations: AppearanceObservation[];
  checkpointMeasurements: CheckpointMeasurement[];
  descriptorObservations: DescriptorObservation[];
  promptDefinitions: PromptDefinition[];
  promptResponses: PromptResponse[];
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
  const grapes = new Map(rows.grapes.map((row) => [row.id, row]));
  const grapeNamesByRelease = new Map<string, string[]>();
  const appearanceByReview = new Map(
    rows.appearanceObservations.map((observation) => [
      observation.review_id,
      observation,
    ]),
  );
  const measurementsByCheckpoint = new Map<string, CheckpointMeasurement[]>();
  const descriptorsByCheckpoint = new Map<string, DescriptorObservation[]>();
  const checkpointsByReview = new Map<string, ReviewCheckpoint[]>();
  const promptDefinitions = new Map(
    rows.promptDefinitions.map((definition) => [definition.id, definition]),
  );
  const vibesByReview = new Map<string, Review["vibeResponses"]>();
  const reviewsBySession = new Map<string, Review[]>();

  rows.releaseGrapes.forEach((releaseGrape) => {
    const releaseId = String(releaseGrape.release_id);
    const grape = grapes.get(releaseGrape.grape_id);
    const grapeName =
      stringValue(releaseGrape.source_text) ??
      stringValue(grape?.canonical_name);
    if (!grapeName) return;
    const existing = grapeNamesByRelease.get(releaseId) ?? [];
    existing.push(grapeName);
    grapeNamesByRelease.set(releaseId, existing);
  });

  rows.checkpointMeasurements.forEach((measurement) => {
    const existing = measurementsByCheckpoint.get(measurement.checkpoint_id) ?? [];
    existing.push(measurement);
    measurementsByCheckpoint.set(measurement.checkpoint_id, existing);
  });

  rows.descriptorObservations.forEach((descriptor) => {
    const existing = descriptorsByCheckpoint.get(descriptor.checkpoint_id) ?? [];
    existing.push(descriptor);
    descriptorsByCheckpoint.set(descriptor.checkpoint_id, existing);
  });

  rows.reviewCheckpoints.forEach((checkpoint) => {
    const hydrated: ReviewCheckpoint = {
      ...checkpoint,
      measurements: (measurementsByCheckpoint.get(checkpoint.id) ?? []).sort((a, b) =>
        a.metric_code.localeCompare(b.metric_code),
      ),
      descriptors: (descriptorsByCheckpoint.get(checkpoint.id) ?? []).sort(
        (a, b) => a.sequence_number - b.sequence_number,
      ),
    };
    const existing = checkpointsByReview.get(checkpoint.review_id) ?? [];
    existing.push(hydrated);
    checkpointsByReview.set(checkpoint.review_id, existing);
  });

  rows.promptResponses.forEach((response) => {
    if (!response.response_text) return;
    const definition = promptDefinitions.get(response.prompt_definition_id);
    if (!definition) return;
    const existing = vibesByReview.get(response.review_id) ?? [];
    existing.push({
      code: definition.prompt_code,
      prompt: definition.prompt_text,
      response: response.response_text,
      sequence: response.sequence_number,
    });
    vibesByReview.set(response.review_id, existing);
  });

  rows.reviews.forEach((reviewRow) => {
    const review: Review = {
      ...reviewRow,
      appearance: appearanceByReview.get(reviewRow.id) ?? null,
      checkpoints: (checkpointsByReview.get(reviewRow.id) ?? []).sort(
        (a, b) => a.sequence_number - b.sequence_number,
      ),
      vibeResponses: (vibesByReview.get(reviewRow.id) ?? []).sort(
        (a, b) => a.sequence - b.sequence,
      ),
    };
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
        grapes: release ? grapeNamesByRelease.get(String(release.id)) ?? [] : [],
        priceAmount: bottle ? numberValue(bottle.price_amount) : null,
        priceRaw: bottle ? stringValue(bottle.price_raw) : null,
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
      releaseGrapesResult,
      grapesResult,
      reviewCheckpointsResult,
      appearanceObservationsResult,
      checkpointMeasurementsResult,
      descriptorObservationsResult,
      promptDefinitionsResult,
      promptResponsesResult,
      peopleResult,
      membershipResult,
    ] = await Promise.all([
      wine.from("tasting_sessions").select("*").eq("household_id", 1),
      wine.from("bottles").select("*").eq("household_id", 1),
      wine.from("releases").select("*").eq("household_id", 1),
      wine.from("wines").select("*").eq("household_id", 1),
      wine.from("producers").select("*").eq("household_id", 1),
      wine.from("reviews").select("*").eq("household_id", 1),
      wine.from("release_grapes").select("*").eq("household_id", 1),
      wine.from("grapes").select("*").eq("household_id", 1),
      wine.from("review_checkpoints").select("*").eq("household_id", 1),
      wine.from("appearance_observations").select("*").eq("household_id", 1),
      wine.from("checkpoint_measurements").select("*").eq("household_id", 1),
      wine.from("descriptor_observations").select("*").eq("household_id", 1),
      wine.from("prompt_definitions").select("*").eq("household_id", 1),
      wine.from("prompt_responses").select("*").eq("household_id", 1),
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
      releaseGrapesResult,
      grapesResult,
      reviewCheckpointsResult,
      appearanceObservationsResult,
      checkpointMeasurementsResult,
      descriptorObservationsResult,
      promptDefinitionsResult,
      promptResponsesResult,
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
      reviews: (reviewsResult.data ?? []) as DatabaseRows["reviews"],
      releaseGrapes: releaseGrapesResult.data ?? [],
      grapes: grapesResult.data ?? [],
      reviewCheckpoints: (reviewCheckpointsResult.data ?? []) as DatabaseRows["reviewCheckpoints"],
      appearanceObservations: (appearanceObservationsResult.data ?? []) as AppearanceObservation[],
      checkpointMeasurements: (checkpointMeasurementsResult.data ?? []) as CheckpointMeasurement[],
      descriptorObservations: (descriptorObservationsResult.data ?? []) as DescriptorObservation[],
      promptDefinitions: (promptDefinitionsResult.data ?? []) as PromptDefinition[],
      promptResponses: (promptResponsesResult.data ?? []) as PromptResponse[],
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

const metricDisplay: Array<{ code: string; label: string; low: string; high: string }> = [
  { code: "sweetness", label: "Sweetness", low: "Dry", high: "Sweet" },
  { code: "acidity", label: "Acidity", low: "Low", high: "High" },
  { code: "tannin_firmness", label: "Tannins", low: "Soft", high: "Firm" },
  { code: "body", label: "Body", low: "Light", high: "Full" },
  { code: "alcohol_warmth", label: "Alcohol warmth", low: "Low", high: "High" },
  { code: "aroma_intensity", label: "Aroma intensity", low: "Low", high: "High" },
  { code: "flavor_intensity", label: "Flavor intensity", low: "Low", high: "High" },
  { code: "finish_length", label: "Finish length", low: "Short", high: "Long" },
  { code: "finish_pleasure", label: "Finish pleasure", low: "Low", high: "High" },
  { code: "complexity", label: "Complexity", low: "Simple", high: "Complex" },
];

function formatBottlePrice(record: TastingRecord): string | null {
  if (record.priceRaw) return record.priceRaw;
  if (record.priceAmount === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(record.priceAmount);
}

function appearanceHasData(appearance: AppearanceObservation | null): boolean {
  if (!appearance) return false;
  return Boolean(
    appearance.color_intensity_raw ||
      appearance.hue_raw ||
      appearance.clarity_raw ||
      appearance.viscosity_raw ||
      appearance.notes,
  );
}

function ReviewAnalysis({ review }: { review: Review }) {
  const initialCheckpoint = review.checkpoints[0] ?? null;
  const appearance = review.appearance;
  const descriptors = initialCheckpoint?.descriptors ?? [];
  const measurements = new Map(
    (initialCheckpoint?.measurements ?? []).map((measurement) => [
      measurement.metric_code,
      measurement,
    ]),
  );
  const descriptorGroup = (section: DescriptorObservation["source_section"]) =>
    descriptors.filter((descriptor) => descriptor.source_section === section);
  const aromaGroups = [
    { key: "fruit" as const, label: "Fruit", items: descriptorGroup("fruit") },
    {
      key: "non_fruit" as const,
      label: "Non-fruit",
      items: descriptorGroup("non_fruit"),
    },
    {
      key: "extra_notes" as const,
      label: "Extra aroma notes",
      items: descriptorGroup("extra_notes"),
    },
  ].filter((group) => group.items.length > 0);
  const palateMeasurements = metricDisplay
    .map((metric) => ({ ...metric, measurement: measurements.get(metric.code) }))
    .filter((metric) => metric.measurement);

  const hasStructuredNotes =
    appearanceHasData(appearance) ||
    aromaGroups.length > 0 ||
    palateMeasurements.length > 0 ||
    review.vibeResponses.length > 0;

  return (
    <div className="review-analysis">
      {appearanceHasData(appearance) && appearance ? (
        <section className="analysis-block">
          <h3>Appearance</h3>
          <dl className="observation-grid">
            {appearance.color_intensity_raw ? (
              <div>
                <dt>Intensity</dt>
                <dd>{appearance.color_intensity_raw}</dd>
              </div>
            ) : null}
            {appearance.hue_raw ? (
              <div>
                <dt>Hue</dt>
                <dd>{appearance.hue_raw}</dd>
              </div>
            ) : null}
            {appearance.clarity_raw ? (
              <div>
                <dt>Clarity</dt>
                <dd>{appearance.clarity_raw}</dd>
              </div>
            ) : null}
            {appearance.viscosity_raw ? (
              <div>
                <dt>Viscosity</dt>
                <dd>{appearance.viscosity_raw}</dd>
              </div>
            ) : null}
          </dl>
          {appearance.notes ? <p className="analysis-prose">{appearance.notes}</p> : null}
        </section>
      ) : null}

      {aromaGroups.length ? (
        <section className="analysis-block">
          <h3>Aromas</h3>
          <div className="aroma-groups">
            {aromaGroups.map((group) => (
              <div key={group.key}>
                <h4>{group.label}</h4>
                <div className="descriptor-list">
                  {group.items.map((descriptor) => (
                    <span key={`${descriptor.source_section}-${descriptor.sequence_number}`}>
                      {descriptor.raw_text}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {palateMeasurements.length ? (
        <section className="analysis-block">
          <h3>Palate instruments</h3>
          <div className="metric-readout-grid">
            {palateMeasurements.map((metric) => (
              <div className="metric-readout" key={metric.code}>
                <span>{metric.label}</span>
                <strong>
                  {metric.measurement?.value_raw ??
                    metric.measurement?.value_numeric ??
                    "—"}
                </strong>
                {metric.measurement?.value_numeric !== null &&
                metric.measurement?.value_numeric !== undefined ? (
                  <div className="metric-track" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, metric.measurement.value_numeric * 10),
                        )}%`,
                      }}
                    />
                  </div>
                ) : null}
                <small>
                  {metric.low} ↔ {metric.high}
                </small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {review.vibeResponses.length ? (
        <section className="analysis-block vibes-readout">
          <h3>Vibes / personality</h3>
          {review.vibeResponses.map((vibe) => (
            <div key={`${vibe.code}-${vibe.sequence}`}>
              <small>{vibe.prompt}</small>
              <p>{vibe.response}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="analysis-block personal-readout">
        <h3>Personal notes</h3>
        <p className="review-notes">
          {review.personal_notes ||
            (hasStructuredNotes
              ? "No separate personal note was recorded."
              : "No detailed observation was recorded.")}
        </p>
      </section>
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
            {record.grapes.length ? (
              <span>
                <Grape />
                {record.grapes.join(" · ")}
              </span>
            ) : null}
            {formatBottlePrice(record) ? (
              <span className="price-meta">{formatBottlePrice(record)}</span>
            ) : null}
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
            <ReviewAnalysis review={review} />
          </article>
        ))}
      </section>
    </div>
  );
}

type ScaleOption = { value: number; label: string };

type MetricFieldConfig = {
  code: string;
  label: string;
  low: string;
  high: string;
  options: ScaleOption[];
};

function fivePointScale(
  low: string,
  lowerMiddle: string,
  middle: string,
  upperMiddle: string,
  high: string,
): ScaleOption[] {
  return [
    { value: 0, label: low },
    { value: 2.5, label: lowerMiddle },
    { value: 5, label: middle },
    { value: 7.5, label: upperMiddle },
    { value: 10, label: high },
  ];
}

const appearanceIntensityOptions = fivePointScale(
  "Pale",
  "Pale-medium",
  "Medium",
  "Medium-deep",
  "Deep",
);
const viscosityOptions = fivePointScale(
  "Low",
  "Medium-low",
  "Medium",
  "Medium-high",
  "High",
);

const metricFields: MetricFieldConfig[] = [
  {
    code: "aroma_intensity",
    label: "Aroma intensity",
    low: "Low",
    high: "High",
    options: fivePointScale("Low", "Medium-low", "Medium", "Medium-high", "High"),
  },
  {
    code: "sweetness",
    label: "Dry ↔ sweet",
    low: "Dry",
    high: "Sweet",
    options: fivePointScale("Dry", "Mostly dry", "Medium", "Medium-sweet", "Sweet"),
  },
  {
    code: "body",
    label: "Light ↔ full body",
    low: "Light",
    high: "Full",
    options: fivePointScale("Light", "Light-medium", "Medium", "Medium-full", "Full"),
  },
  {
    code: "acidity",
    label: "Low ↔ high acid",
    low: "Low",
    high: "High",
    options: fivePointScale("Low", "Medium-low", "Medium", "Medium-high", "High"),
  },
  {
    code: "tannin_firmness",
    label: "Soft ↔ firm tannins",
    low: "Soft",
    high: "Firm",
    options: fivePointScale("Soft", "Soft-medium", "Medium", "Medium-firm", "Firm"),
  },
  {
    code: "alcohol_warmth",
    label: "Alcohol warmth",
    low: "Low",
    high: "High",
    options: fivePointScale("Low", "Medium-low", "Medium", "Medium-high", "High"),
  },
  {
    code: "flavor_intensity",
    label: "Flavor intensity",
    low: "Low",
    high: "High",
    options: fivePointScale("Low", "Medium-low", "Medium", "Medium-high", "High"),
  },
  {
    code: "complexity",
    label: "Simple ↔ complex",
    low: "Simple",
    high: "Complex",
    options: fivePointScale("Simple", "Mostly simple", "Medium", "Somewhat complex", "Complex"),
  },
  {
    code: "finish_length",
    label: "Short ↔ long finish",
    low: "Short",
    high: "Long",
    options: fivePointScale("Short", "Medium-short", "Medium", "Medium-long", "Long"),
  },
  {
    code: "finish_pleasure",
    label: "Finish pleasure",
    low: "Low",
    high: "High",
    options: fivePointScale("Low", "Medium-low", "Medium", "Medium-high", "High"),
  },
];

function formText(form: FormData, key: string): string | null {
  const value = form.get(key)?.toString();
  return value && value.trim() ? value : null;
}

function formNumber(form: FormData, key: string): number | null {
  const value = formText(form, key);
  return value === null ? null : Number(value);
}

function splitNotes(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectedScaleValue(
  form: FormData,
  key: string,
  options: ScaleOption[],
): { numeric: number; raw: string } | null {
  const numeric = formNumber(form, key);
  if (numeric === null) return null;
  const selected = options.find((option) => option.value === numeric);
  return { numeric, raw: selected?.label ?? numeric.toString() };
}

function cleanValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() ? value : undefined;
  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => cleanValue(item))
      .filter((item) => item !== undefined);
    return cleaned.length ? cleaned : undefined;
  }
  if (typeof value === "object") {
    const cleanedEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, cleanValue(item)] as const)
      .filter(([, item]) => item !== undefined);
    return cleanedEntries.length ? Object.fromEntries(cleanedEntries) : undefined;
  }
  return value;
}

function cleanPayload(value: Record<string, unknown>): Record<string, unknown> {
  return (cleanValue(value) as Record<string, unknown> | undefined) ?? {};
}

function buildReviewPayload(form: FormData, prefix: "gracie" | "kyle") {
  const metrics = Object.fromEntries(
    metricFields
      .map((metric) => [
        metric.code,
        selectedScaleValue(form, `${prefix}_metric_${metric.code}`, metric.options),
      ])
      .filter(([, value]) => value !== null),
  );
  const colorIntensity = selectedScaleValue(
    form,
    `${prefix}_appearance_color_intensity`,
    appearanceIntensityOptions,
  );
  const viscosity = selectedScaleValue(
    form,
    `${prefix}_appearance_viscosity`,
    viscosityOptions,
  );

  return cleanPayload({
    overallEnjoyment: formNumber(form, `${prefix}_enjoyment`),
    appearance: {
      colorIntensity: colorIntensity?.raw,
      colorIntensityNumeric: colorIntensity?.numeric,
      hue: formText(form, `${prefix}_appearance_hue`),
      clarity: formText(form, `${prefix}_appearance_clarity`),
      viscosity: viscosity?.raw,
      viscosityNumeric: viscosity?.numeric,
      notes: formText(form, `${prefix}_appearance_notes`),
    },
    aromas: {
      fruit: splitNotes(formText(form, `${prefix}_aromas_fruit`)),
      non_fruit: splitNotes(formText(form, `${prefix}_aromas_non_fruit`)),
      extra_notes: splitNotes(formText(form, `${prefix}_aromas_extra_notes`)),
    },
    metrics,
    vibes: {
      vibe_field_1: formText(form, `${prefix}_vibe_field_1`),
      vibe_field_2: formText(form, `${prefix}_vibe_field_2`),
      vibe_field_3: formText(form, `${prefix}_vibe_field_3`),
    },
    personalNotes: formText(form, `${prefix}_personal_notes`),
  });
}

function ScaleSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: ScaleOption[];
}) {
  return (
    <label className="field scale-field">
      <span>{label}</span>
      <select name={name} defaultValue="">
        <option value="">Not recorded</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
    const startedAt = formText(form, "startedAt");
    const priceAmount = formNumber(form, "priceAmount");
    const bottle = cleanPayload({
      producerName: formText(form, "producer"),
      wineName: formText(form, "wineName"),
      vintageYear: formNumber(form, "vintage"),
      grapes: splitNotes(formText(form, "grapes")),
      geography: formText(form, "geography"),
      colorStyle: formText(form, "colorStyle"),
      priceAmount,
      priceRaw: priceAmount === null ? null : `$${priceAmount}`,
      currencyCode: priceAmount === null ? null : "USD",
      acquisitionSource: formText(form, "acquisitionSource"),
      startedAt: startedAt ? new Date(startedAt).toISOString() : null,
      locationName: formText(form, "locationName") || "Home",
      locationContext: formText(form, "locationContext") || "Home",
      occasionNotes: formText(form, "occasionNotes"),
    });

    const { data, error } = await supabase.schema("wine").rpc("create_rich_tasting", {
      p_bottle: bottle,
      p_gracie_review: buildReviewPayload(form, "gracie"),
      p_kyle_review: buildReviewPayload(form, "kyle"),
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
              <label className="field wide">
                <span>Grape(s) / varietal</span>
                <input
                  name="grapes"
                  placeholder="Tempranillo, Garnacha, Mazuelo, Graciano"
                />
                <small>Separate grapes with commas. Blend wording is welcome.</small>
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
              <label className="field">
                <span>Price · USD</span>
                <input
                  name="priceAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Blank is okay"
                />
              </label>
              <label className="field">
                <span>Where purchased</span>
                <input name="acquisitionSource" placeholder="Bottlecraft, winery, gift…" />
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
  const vibePrompts =
    person === "Kyle"
      ? [
          "If this wine walked into a room…",
          "Where would you take it, and why?",
          "Final incriminating detail",
        ]
      : [
          "Wine personality / character",
          "Setting, occasion, or relationship",
          "Other vibe or final impression",
        ];

  return (
    <fieldset className="review-fields rich-review-fields">
      <legend>
        <span>{person.slice(0, 1)}</span>
        {person}
      </legend>
      <p className="scientist-instruction">
        Keep this point of view separate. Blank remains an honest measurement.
      </p>

      <details className="observation-group" open>
        <summary>
          <span>01</span>
          Appearance
        </summary>
        <div className="observation-fields two-column-fields">
          <ScaleSelect
            name={`${prefix}_appearance_color_intensity`}
            label="Color intensity"
            options={appearanceIntensityOptions}
          />
          <label className="field">
            <span>Hue</span>
            <input
              name={`${prefix}_appearance_hue`}
              placeholder="Ruby, burgundy, gold, straw…"
            />
          </label>
          <label className="field">
            <span>Clarity</span>
            <select name={`${prefix}_appearance_clarity`} defaultValue="">
              <option value="">Not recorded</option>
              <option value="Clear">Clear</option>
              <option value="Slightly hazy">Slightly hazy</option>
              <option value="Hazy">Hazy</option>
              <option value="Cloudy">Cloudy</option>
            </select>
          </label>
          <ScaleSelect
            name={`${prefix}_appearance_viscosity`}
            label="Viscosity"
            options={viscosityOptions}
          />
          <label className="field wide">
            <span>Appearance notes</span>
            <textarea
              name={`${prefix}_appearance_notes`}
              rows={2}
              placeholder="Anything the four fields do not capture"
            />
          </label>
        </div>
      </details>

      <details className="observation-group" open>
        <summary>
          <span>02</span>
          Aromas
        </summary>
        <div className="observation-fields">
          <ScaleSelect
            name={`${prefix}_metric_aroma_intensity`}
            label="Aroma intensity"
            options={metricFields[0]!.options}
          />
          <label className="field">
            <span>Fruit aromas</span>
            <textarea
              name={`${prefix}_aromas_fruit`}
              rows={3}
              placeholder="Cherry, sour cherry, cranberry, orange…"
            />
            <small>One per line or separated with commas.</small>
          </label>
          <label className="field">
            <span>Non-fruit aromas</span>
            <textarea
              name={`${prefix}_aromas_non_fruit`}
              rows={3}
              placeholder="Orange rind, wood, spice, earth, vegetable…"
            />
          </label>
          <label className="field">
            <span>Extra aroma notes</span>
            <textarea
              name={`${prefix}_aromas_extra_notes`}
              rows={3}
              placeholder="Associations, uncertainty, changes in the glass…"
            />
          </label>
        </div>
      </details>

      <details className="observation-group" open>
        <summary>
          <span>03</span>
          Palate instruments
        </summary>
        <div className="observation-fields metric-form-grid">
          {metricFields.slice(1).map((metric) => (
            <ScaleSelect
              key={metric.code}
              name={`${prefix}_metric_${metric.code}`}
              label={metric.label}
              options={metric.options}
            />
          ))}
        </div>
      </details>

      <details className="observation-group" open>
        <summary>
          <span>04</span>
          Vibes / personality
        </summary>
        <div className="observation-fields">
          {vibePrompts.map((prompt, index) => (
            <label className="field" key={prompt}>
              <span>{prompt}</span>
              <textarea
                name={`${prefix}_vibe_field_${index + 1}`}
                rows={index === 0 ? 4 : 3}
                placeholder={
                  index === 0
                    ? "Human metaphors are legitimate laboratory equipment."
                    : "Blank is welcome if this prompt has nothing useful to add."
                }
              />
            </label>
          ))}
        </div>
      </details>

      <div className="observation-group final-observation">
        <div className="observation-fields">
          <label className="field">
            <span>Enjoyment · 0–10</span>
            <input
              name={`${prefix}_enjoyment`}
              type="number"
              min="0"
              max="10"
              step="0.5"
              inputMode="decimal"
              placeholder="Blank is honest"
            />
          </label>
          <label className="field">
            <span>
              {person === "Kyle" ? "Personal note to Gracie / future Kyle" : "Personal lab notes"}
            </span>
            <textarea
              name={`${prefix}_personal_notes`}
              rows={5}
              placeholder="Feelings, memories, complaints, hypotheses, flirtation—keep the useful human part."
            />
          </label>
        </div>
      </div>
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
