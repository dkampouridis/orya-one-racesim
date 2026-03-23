"use client";

import type { ComponentType, ReactNode } from "react";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Flag,
  Loader2,
  Radar,
  ShieldAlert,
  Thermometer,
  Trophy,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDefaults, fetchSuggestions, runSimulation } from "@/lib/api";
import type {
  DefaultsPayload,
  DriverOverride,
  DriverResult,
  SimulationFormState,
  SimulationResponse,
  StrategySuggestion,
} from "@/lib/types";

const defaultWeights = {
  tire_wear_weight: 0.72,
  fuel_effect_weight: 0.55,
  driver_form_weight: 0.68,
  qualifying_importance: 0.74,
  overtaking_sensitivity: 0.57,
  energy_deployment_weight: 0.66,
  pit_stop_delta_sensitivity: 0.61,
  stochastic_variance: 0.52,
  reliability_sensitivity: 0.46,
};

const defaultEnvironment = {
  dry_race: 0.74,
  mixed_conditions: 0.28,
  rain_onset: 0.22,
  track_evolution: 0.58,
  temperature_variation: 0.44,
  energy_deployment_intensity: 0.62,
  crashes: 0.16,
  dnfs: 0.1,
  yellow_flags: 0.21,
  virtual_safety_cars: 0.15,
  full_safety_cars: 0.14,
  red_flags: 0.04,
  late_race_incidents: 0.12,
  randomness_intensity: 0.5,
};

const DEMO_PRESETS = [
  {
    id: "spa-weather-swing",
    label: "Spa weather swing",
    description: "Mixed weather, reactive pit windows, wider outcome spread.",
    grand_prix_id: "belgian-grand-prix",
    weather_preset_id: "rain-crossover-threat",
    simulation_runs: 320,
    complexity_level: "balanced" as const,
    field_strategy_preset: "",
    weights: {
      ...defaultWeights,
      tire_wear_weight: 0.78,
      overtaking_sensitivity: 0.63,
      energy_deployment_weight: 0.71,
      stochastic_variance: 0.58,
    },
    environment: {
      ...defaultEnvironment,
      rain_onset: 0.41,
      yellow_flags: 0.29,
      virtual_safety_cars: 0.22,
      full_safety_cars: 0.21,
      red_flags: 0.07,
      late_race_incidents: 0.2,
      randomness_intensity: 0.62,
      track_evolution: 0.63,
      temperature_variation: 0.56,
      energy_deployment_intensity: 0.68,
      crashes: 0.22,
    },
  },
  {
    id: "monaco-track-position",
    label: "Monaco track position",
    description: "Qualifying-led race with low pass volume and narrow pit windows.",
    grand_prix_id: "monaco-grand-prix",
    weather_preset_id: "dry-baseline",
    simulation_runs: 240,
    complexity_level: "balanced" as const,
    field_strategy_preset: "qualifying-track-position",
    weights: {
      ...defaultWeights,
      qualifying_importance: 0.9,
      pit_stop_delta_sensitivity: 0.68,
      overtaking_sensitivity: 0.38,
      stochastic_variance: 0.44,
    },
    environment: {
      ...defaultEnvironment,
      rain_onset: 0.08,
      yellow_flags: 0.18,
      full_safety_cars: 0.12,
      randomness_intensity: 0.4,
    },
  },
  {
    id: "monza-deployment-attack",
    label: "Monza deployment attack",
    description: "Low-drag setup with stronger overtaking and undercut pressure.",
    grand_prix_id: "italian-grand-prix",
    weather_preset_id: "dry-baseline",
    simulation_runs: 280,
    complexity_level: "balanced" as const,
    field_strategy_preset: "",
    weights: {
      ...defaultWeights,
      fuel_effect_weight: 0.58,
      overtaking_sensitivity: 0.7,
      energy_deployment_weight: 0.88,
      pit_stop_delta_sensitivity: 0.57,
    },
    environment: {
      ...defaultEnvironment,
      track_evolution: 0.54,
      energy_deployment_intensity: 0.82,
      temperature_variation: 0.33,
      randomness_intensity: 0.46,
    },
  },
];

const tooltipStyle = {
  backgroundColor: "rgba(8, 10, 14, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: 12,
  color: "#f4f6f8",
} as const;

const distributionColors = ["#ff415f", "#f7bb43", "#31c48d", "#98a4b3", "#ff875f", "#6d7683"];

function buildInitialOverrides(driverIds: string[]): DriverOverride[] {
  return driverIds.map((driverId) => ({
    driver_id: driverId,
    recent_form_delta: 0,
    qualifying_delta: 0,
    tire_management_delta: 0,
    overtaking_delta: 0,
    consistency_delta: 0,
    aggression_delta: 0,
  }));
}

function buildInitialForm(defaults: DefaultsPayload): SimulationFormState {
  const preset = DEMO_PRESETS[0];
  return {
    grand_prix_id: defaults.grands_prix.find((item) => item.id === preset.grand_prix_id)?.id ?? defaults.grands_prix[0]?.id ?? "",
    weather_preset_id:
      defaults.weather_presets.find((item) => item.id === preset.weather_preset_id)?.id ?? defaults.weather_presets[0]?.id ?? "",
    simulation_runs: preset.simulation_runs,
    complexity_level: preset.complexity_level,
    field_strategy_preset: preset.field_strategy_preset,
    weights: preset.weights,
    environment: preset.environment,
    strategies: {},
    driver_overrides: buildInitialOverrides(defaults.drivers.map((driver) => driver.id)),
  };
}

function applyDemoPreset(
  defaults: DefaultsPayload,
  currentForm: SimulationFormState,
  presetId: string,
): SimulationFormState {
  const preset = DEMO_PRESETS.find((item) => item.id === presetId) ?? DEMO_PRESETS[0];
  return {
    ...currentForm,
    grand_prix_id: defaults.grands_prix.find((item) => item.id === preset.grand_prix_id)?.id ?? currentForm.grand_prix_id,
    weather_preset_id:
      defaults.weather_presets.find((item) => item.id === preset.weather_preset_id)?.id ?? currentForm.weather_preset_id,
    simulation_runs: preset.simulation_runs,
    complexity_level: preset.complexity_level,
    field_strategy_preset: preset.field_strategy_preset,
    weights: preset.weights,
    environment: preset.environment,
    strategies: {},
    driver_overrides: buildInitialOverrides(defaults.drivers.map((driver) => driver.id)),
  };
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSigned(value: number) {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

function hasUnknownDriverIds(
  defaults: DefaultsPayload,
  payload: Array<{ driver_id: string }>,
) {
  const knownIds = new Set(defaults.drivers.map((driver) => driver.id));
  return payload.some((item) => !knownIds.has(item.driver_id));
}

function badgeVariantForConfidence(value: DriverResult["confidence_label"]) {
  if (value === "Stable") {
    return "success";
  }
  if (value === "Measured") {
    return "muted";
  }
  return "warning";
}

function badgeVariantForRisk(value: StrategySuggestion["risk_profile"]) {
  if (value === "Low") {
    return "success";
  }
  if (value === "Balanced") {
    return "muted";
  }
  return "warning";
}

function sliderLabel(value: number) {
  if (value < 0.25) {
    return "Low";
  }
  if (value < 0.5) {
    return "Measured";
  }
  if (value < 0.75) {
    return "Elevated";
  }
  return "High";
}

function volatilityLabel(value: number) {
  if (value < 0.34) {
    return "Stable";
  }
  if (value < 0.58) {
    return "Live";
  }
  return "Volatile";
}

function signalVariant(value: number): "success" | "muted" | "warning" {
  if (value < 0.34) {
    return "success";
  }
  if (value < 0.58) {
    return "muted";
  }
  return "warning";
}

function signalColor(value: number) {
  if (value < 0.34) {
    return "bg-emerald-400";
  }
  if (value < 0.58) {
    return "bg-amber-300";
  }
  return "bg-primary";
}

function compactNumber(value: number) {
  return value.toFixed(2);
}

function SectionFrame({
  title,
  subtitle,
  eyebrow,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-[16px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,18,24,0.98),rgba(7,9,13,1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <CardHeader className="border-b border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] pb-2.5 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow ? (
              <div className="text-[10px] uppercase tracking-[0.24em] text-primary/90">{eyebrow}</div>
            ) : null}
            <CardTitle className="mt-1.5 font-display text-[0.95rem] uppercase tracking-[0.08em] text-white">{title}</CardTitle>
            {subtitle ? <CardDescription className="mt-0.5 text-[11px] leading-5 text-muted-foreground/75">{subtitle}</CardDescription> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="p-3.5">{children}</CardContent>
    </Card>
  );
}

function StatusChip({
  label,
  value,
  variant = "muted",
}: {
  label: string;
  value: string;
  variant?: "default" | "muted" | "success" | "warning";
}) {
  return (
    <div className="flex items-center gap-2 rounded-[999px] border border-white/8 bg-black/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          variant === "success" ? "bg-emerald-400" : variant === "warning" ? "bg-amber-300" : variant === "default" ? "bg-primary" : "bg-white/30"
        }`}
      />
      <span>{label}</span>
      <Badge variant={variant} className="px-2 py-0.5 text-[9px]">
        {value}
      </Badge>
    </div>
  );
}

function HeaderMetric({
  label,
  value,
  detail,
  tone = "muted",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "muted" | "default" | "success" | "warning";
}) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
        <Badge variant={tone} className="px-2 py-0.5 text-[8px]">
          {tone === "default" ? "Attack" : tone === "success" ? "Stable" : tone === "warning" ? "Risk" : "Live"}
        </Badge>
      </div>
      <div className="mt-2 truncate font-display text-[1.15rem] leading-none text-white">{value}</div>
      <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{detail}</div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 rounded-[10px] border border-white/10 bg-[#090c11] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-primary/60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SliderField({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  description: string;
}) {
  return (
    <label className="rounded-[10px] border border-white/8 bg-black/25 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[13px] text-white">{label}</span>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>{sliderLabel(value)}</span>
          <span>{value.toFixed(2)}</span>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#ff415f]"
      />
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{description.split(".")[0]}</p>
    </label>
  );
}

function SignalMeter({
  label,
  value,
  secondary,
}: {
  label: string;
  value: number;
  secondary?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white">{secondary ?? `${Math.round(value * 100)}/100`}</div>
      </div>
      <div className="h-1.5 rounded-full bg-white/8">
        <div
          className={`h-1.5 rounded-full ${signalColor(value)}`}
          style={{ width: `${Math.max(6, Math.min(100, value * 100))}%` }}
        />
      </div>
    </div>
  );
}

function InsightCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,18,23,0.98),rgba(8,10,14,1))]">
      <CardHeader className="pb-2.5 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-primary/15 bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="font-display text-[0.95rem] uppercase tracking-[0.08em]">{title}</CardTitle>
            {subtitle ? <CardDescription className="mt-0.5 text-[10px] leading-4">{subtitle}</CardDescription> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">{children}</CardContent>
    </Card>
  );
}

function MetricPanel({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "muted" | "success" | "warning";
}) {
  return (
    <div className="rounded-[12px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
        <Badge variant={tone}>{label.split(" ")[0]}</Badge>
      </div>
      <div className="mt-3 font-display text-[1.7rem] leading-none text-white">{value}</div>
      <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{detail}</div>
    </div>
  );
}

function AnalyticsTabs({
  value,
  onChange,
}: {
  value: "order" | "strategy" | "diagnostics";
  onChange: (value: "order" | "strategy" | "diagnostics") => void;
}) {
  const items: Array<{ id: "order" | "strategy" | "diagnostics"; label: string }> = [
    { id: "order", label: "Order board" },
    { id: "strategy", label: "Strategy" },
    { id: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <div className="inline-flex rounded-[12px] border border-white/8 bg-black/30 p-1">
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-[10px] px-3 py-2 text-[10px] uppercase tracking-[0.22em] transition duration-200 ${
              active ? "bg-primary text-white shadow-[0_0_18px_rgba(225,41,68,0.25)]" : "text-muted-foreground hover:text-white"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function ControlTabs({
  value,
  onChange,
}: {
  value: "weekend" | "conditions" | "strategy" | "drivers" | "simulation";
  onChange: (value: "weekend" | "conditions" | "strategy" | "drivers" | "simulation") => void;
}) {
  const items: Array<{
    id: "weekend" | "conditions" | "strategy" | "drivers" | "simulation";
    label: string;
  }> = [
    { id: "weekend", label: "Weekend" },
    { id: "conditions", label: "Conditions" },
    { id: "strategy", label: "Strategy" },
    { id: "drivers", label: "Drivers" },
    { id: "simulation", label: "Simulation" },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full rounded-[12px] border border-white/8 bg-black/30 p-1">
        {items.map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`rounded-[10px] px-3 py-2 text-[10px] uppercase tracking-[0.22em] transition duration-200 ${
                active ? "bg-primary text-white shadow-[0_0_18px_rgba(225,41,68,0.25)]" : "text-muted-foreground hover:text-white"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimingStrip({ drivers }: { drivers: DriverResult[] }) {
  return (
    <div className="space-y-2">
      {drivers.map((driver, index) => (
        <div
          key={driver.driver_id}
          className="grid grid-cols-[34px_minmax(0,1fr)_58px_58px_58px] items-center gap-2 rounded-[10px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-2.5 py-2.5 md:grid-cols-[38px_minmax(0,1.2fr)_62px_62px_62px]"
        >
          <div className="font-display text-lg leading-none text-white">P{index + 1}</div>
          <div className="min-w-0">
            <div className="truncate text-[13px] text-white">{driver.driver_name}</div>
            <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{driver.team_name}</div>
          </div>
          <div className="rounded-[8px] border border-white/8 bg-black/25 px-1.5 py-1.5 text-center">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Win</div>
            <div className="mt-0.5 text-[12px] text-white">{formatPct(driver.win_probability)}</div>
          </div>
          <div className="rounded-[8px] border border-white/8 bg-black/25 px-1.5 py-1.5 text-center">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Pts</div>
            <div className="mt-0.5 text-[12px] text-white">{driver.expected_points.toFixed(1)}</div>
          </div>
          <div className="rounded-[8px] border border-white/8 bg-black/25 px-1.5 py-1.5 text-center">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Fit</div>
            <div className="mt-0.5 text-[12px] text-white">{driver.strategy_fit_score.toFixed(1)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DriverTable({ drivers }: { drivers: DriverResult[] }) {
  return (
    <div className="overflow-x-auto rounded-[16px] border border-white/8">
      <div className="min-w-[1040px]">
        <div className="grid grid-cols-[44px_1.6fr_1fr_repeat(7,minmax(82px,1fr))] gap-3 bg-white/[0.04] px-4 py-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          <span>Pos</span>
          <span>Driver</span>
          <span>Strategy</span>
          <span>Win</span>
          <span>Podium</span>
          <span>Points</span>
          <span>DNF</span>
          <span>Volatility</span>
          <span>Fit</span>
          <span>Exp</span>
        </div>
        {drivers.map((driver, index) => (
          <div
            key={driver.driver_id}
            className="grid grid-cols-[44px_1.6fr_1fr_repeat(7,minmax(82px,1fr))] gap-3 border-t border-white/6 px-4 py-4 text-sm"
          >
            <div className="font-display text-xl text-white">{index + 1}</div>
            <div>
              <div className="font-medium text-white">{driver.driver_name}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{driver.team_name}</div>
              <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{driver.explanation[0]}</div>
            </div>
            <div>
              <div className="text-white">{driver.assigned_strategy_name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{formatPct(driver.strategy_success_rate)} fit</div>
            </div>
            <div>{formatPct(driver.win_probability)}</div>
            <div>{formatPct(driver.podium_probability)}</div>
            <div>{driver.expected_points.toFixed(1)}</div>
            <div>{formatPct(driver.dnf_probability)}</div>
            <div>
              <Badge variant={badgeVariantForConfidence(driver.confidence_label)}>{driver.confidence_label}</Badge>
            </div>
            <div>{driver.strategy_fit_score.toFixed(1)}</div>
            <div>P{driver.expected_finish_position.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SimulatorWorkspace() {
  const [defaults, setDefaults] = useState<DefaultsPayload | null>(null);
  const [form, setForm] = useState<SimulationFormState | null>(null);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [suggestions, setSuggestions] = useState<StrategySuggestion[]>([]);
  const [analyticsView, setAnalyticsView] = useState<"order" | "strategy" | "diagnostics">("order");
  const [controlTab, setControlTab] = useState<"weekend" | "conditions" | "strategy" | "drivers" | "simulation">("weekend");
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [loadingSimulation, setLoadingSimulation] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredSimulation = useDeferredValue(simulation);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    async function load() {
      try {
        const payload = await fetchDefaults<DefaultsPayload>();
        const initialForm = buildInitialForm(payload);
        setDefaults(payload);
        setForm(initialForm);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to reach the API.");
      } finally {
        setLoadingDefaults(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!defaults || !form || suggestions.length > 0) {
      return;
    }
    const activeForm = form;
    async function hydrateSuggestions() {
      setLoadingSuggestions(true);
      try {
        const payload = await fetchSuggestions<StrategySuggestion[]>(activeForm);
        setSuggestions(payload);
      } catch {
        // Do not block the workspace on cold-start suggestion fetches.
      } finally {
        setLoadingSuggestions(false);
      }
    }
    void hydrateSuggestions();
  }, [defaults, form, suggestions.length]);

  async function requestSuggestions(
    activeForm: SimulationFormState = form as SimulationFormState,
    options?: { suppressError?: boolean },
  ) {
    if (!activeForm || !defaults) {
      return;
    }
    setLoadingSuggestions(true);
    if (!options?.suppressError) {
      setError(null);
    }
    try {
      const payload = await fetchSuggestions<StrategySuggestion[]>(activeForm);
      if (hasUnknownDriverIds(defaults, payload)) {
        throw new Error("The backend is still serving an older season catalog. Try again after the API redeploy completes.");
      }
      setSuggestions(payload);
    } catch (requestError) {
      if (!options?.suppressError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to load strategy calls.");
      }
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function executeSimulation() {
    if (!form || !defaults) {
      return;
    }
    setLoadingSimulation(true);
    setError(null);
    try {
      const response = await runSimulation<SimulationResponse>(form);
      if (hasUnknownDriverIds(defaults, response.drivers)) {
        throw new Error("The backend is still on the old fictional grid. Redeploy the API before running 2026 race simulations.");
      }
      startTransition(() => {
        setSimulation(response);
        setSuggestions(response.strategy_suggestions);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Simulation request failed.");
    } finally {
      setLoadingSimulation(false);
    }
  }

  if (loadingDefaults) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[190px] rounded-[20px]" />
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_320px] 2xl:grid-cols-[390px_minmax(0,1fr)_340px]">
          <Skeleton className="order-3 h-[980px] rounded-[20px] xl:order-1" />
          <Skeleton className="order-1 h-[1120px] rounded-[20px] xl:order-2" />
          <Skeleton className="order-2 h-[680px] rounded-[20px] xl:order-3" />
        </div>
      </div>
    );
  }

  if (!defaults || !form) {
    return (
      <Card className="border-rose-400/20 bg-rose-950/20">
        <CardHeader>
          <CardTitle>2026 season data unavailable</CardTitle>
          <CardDescription>
            Start the FastAPI service on `http://localhost:8000` for local development, or set `API_URL` / `NEXT_PUBLIC_API_URL` so the frontend proxy can reach the 2026 Formula 1 backend.
          </CardDescription>
        </CardHeader>
        {error ? <CardContent className="text-sm text-rose-200">{error}</CardContent> : null}
      </Card>
    );
  }

  const activeTrack = defaults.grands_prix.find((item) => item.id === form.grand_prix_id) ?? defaults.grands_prix[0];
  const activeWeather =
    defaults.weather_presets.find((item) => item.id === form.weather_preset_id) ?? defaults.weather_presets[0];
  const activePreset =
    DEMO_PRESETS.find(
      (preset) =>
        preset.grand_prix_id === form.grand_prix_id &&
        preset.weather_preset_id === form.weather_preset_id &&
        preset.simulation_runs === form.simulation_runs,
    )?.label ?? "Custom";
  const deferredDrivers = deferredSimulation?.drivers ?? [];
  const leadDriver = deferredDrivers[0];
  const topDrivers = deferredDrivers.slice(0, 4);
  const eventData =
    deferredSimulation
      ? [
          { label: "Weather", value: deferredSimulation.event_summary.weather_shift_rate },
          { label: "Yellow", value: deferredSimulation.event_summary.yellow_flag_rate },
          { label: "VSC", value: deferredSimulation.event_summary.vsc_rate },
          { label: "Safety", value: deferredSimulation.event_summary.safety_car_rate },
          { label: "Red", value: deferredSimulation.event_summary.red_flag_rate },
          { label: "Late", value: deferredSimulation.event_summary.late_incident_rate },
        ]
      : [];
  const positionData =
    deferredSimulation?.drivers.slice(0, 8).map((driver) => ({
      name: driver.driver_name.split(" ")[1] ?? driver.driver_name.split(" ")[0],
      expected: Number((defaults.drivers.length + 1 - driver.expected_finish_position).toFixed(2)),
      rawExpected: driver.expected_finish_position,
      win: Number((driver.win_probability * 100).toFixed(1)),
    })) ?? [];
  const topDistribution =
    deferredSimulation?.drivers.slice(0, 4).map((driver) => ({
      driver: driver.driver_name.split(" ")[1] ?? driver.driver_name.split(" ")[0],
      ...Object.fromEntries(
        driver.position_distribution.slice(0, 6).map((item) => [
          `P${item.position}`,
          Number((item.probability * 100).toFixed(1)),
        ]),
      ),
    })) ?? [];

  const currentVolatility = deferredSimulation?.event_summary.volatility_index ?? (
    form.environment.randomness_intensity * 0.32
    + form.environment.rain_onset * 0.22
    + activeTrack.weather_volatility * 0.18
    + activeTrack.safety_car_risk * 0.14
    + form.environment.full_safety_cars * 0.14
  );

  const leaderDiagnostics = leadDriver?.diagnostics ?? null;
  const motionProps = reduceMotion
    ? { initial: false, animate: undefined, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="space-y-3">
      <motion.section {...motionProps} className="sticky top-[5.25rem] z-20">
        <Card className="overflow-hidden rounded-[16px] border-primary/15 bg-[linear-gradient(120deg,rgba(13,15,20,1),rgba(8,10,13,1))] shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
          <CardContent className="p-3.5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Grand Prix</Badge>
                  <StatusChip label="Preset" value={activePreset} variant={activePreset === "Custom" ? "muted" : "default"} />
                  <StatusChip label="Weather" value={activeWeather.label} variant="muted" />
                  {activeTrack.sprint_weekend ? <StatusChip label="Weekend" value="Sprint" variant="warning" /> : null}
                  <StatusChip label="Volatility" value={volatilityLabel(currentVolatility)} variant={signalVariant(currentVolatility)} />
                  <StatusChip
                    label="Sim"
                    value={loadingSimulation ? "Running" : deferredSimulation ? "Loaded" : "Ready"}
                    variant={loadingSimulation ? "warning" : deferredSimulation ? "success" : "muted"}
                  />
                </div>
                <h2 className="mt-2.5 font-display text-[clamp(1.7rem,3vw,2.7rem)] leading-[0.98] tracking-[-0.05em] text-white">
                  {activeTrack.name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  <span>{activeTrack.circuit_name}</span>
                  <span>R{activeTrack.calendar_round}</span>
                  <span>{form.simulation_runs} runs</span>
                  <span>{form.complexity_level} detail</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <StatusChip label="Deg" value={activeTrack.degradation_profile} variant="muted" />
                  <StatusChip label="Track pos" value={`${Math.round(activeTrack.track_position_importance * 100)}`} variant="muted" />
                  <StatusChip label="Energy" value={`${Math.round(activeTrack.energy_sensitivity * 100)}`} variant="default" />
                  <StatusChip label="SC / VSC" value={`${Math.round((activeTrack.safety_car_risk + form.environment.full_safety_cars) * 50)}`} variant="warning" />
                </div>
              </div>

              <div className="flex w-full flex-col gap-2.5 xl:w-[360px] 2xl:w-[384px]">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button className="w-full justify-center" onClick={() => void executeSimulation()} disabled={loadingSimulation}>
                    {loadingSimulation ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Run Grand Prix
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={() => void requestSuggestions()}
                    disabled={loadingSuggestions}
                  >
                    {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                    Refresh
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
                  <StatusChip label="Weekend" value={activeWeather.label} variant={signalVariant(currentVolatility)} />
                  <StatusChip label="Chaos" value={`${Math.round(form.environment.randomness_intensity * 100)}`} variant="muted" />
                  <StatusChip label="Quali" value={`${Math.round(form.weights.qualifying_importance * 100)}`} variant="muted" />
                  <StatusChip label="Track pos" value={`${Math.round(activeTrack.track_position_importance * 100)}`} variant="muted" />
                </div>
                {error ? <div className="rounded-[10px] border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-[12px] leading-5 text-rose-100">{error}</div> : null}
              </div>
            </div>

            <div className="mt-3 grid gap-2.5 xl:grid-cols-[1.38fr_0.82fr] 2xl:grid-cols-[1.52fr_0.78fr]">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <HeaderMetric
                  label="Lead car"
                  value={leadDriver ? leadDriver.driver_name : "Pending"}
                  detail={leadDriver ? `${formatPct(leadDriver.win_probability)} win share` : "Run the current setup"}
                  tone="default"
                />
                <HeaderMetric
                  label="Podium lane"
                  value={leadDriver ? formatPct(leadDriver.podium_probability) : "Pending"}
                  detail={leadDriver ? `${leadDriver.team_name} tops the board` : "Awaiting run"}
                  tone="success"
                />
                <HeaderMetric
                  label="Points load"
                  value={leadDriver ? leadDriver.expected_points.toFixed(1) : "Pending"}
                  detail={leadDriver ? `${formatPct(leadDriver.points_probability)} points chance` : "Awaiting simulation"}
                  tone="success"
                />
                <HeaderMetric
                  label="Risk channel"
                  value={deferredSimulation ? deferredSimulation.event_summary.dominant_factor : "Track-led"}
                  detail={deferredSimulation ? deferredSimulation.scenario.event_outlook : "Track + control settings"}
                  tone="warning"
                />
              </div>
              <div className="rounded-[10px] border border-white/8 bg-black/25 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-primary/90">Timing strip</div>
                  <Badge variant={leadDriver ? badgeVariantForConfidence(leadDriver.confidence_label) : signalVariant(currentVolatility)}>
                    {leadDriver?.confidence_label ?? "Preview"}
                  </Badge>
                </div>
                {deferredSimulation ? (
                  <div className="mt-2.5">
                    <TimingStrip drivers={topDrivers} />
                  </div>
                ) : (
                  <div className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Run to load the top four, win share, points load, and strategy fit.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      <div className="grid gap-3 xl:grid-cols-[380px_minmax(0,1fr)_340px] 2xl:grid-cols-[420px_minmax(0,1fr)_360px]">
        <aside className="order-3 space-y-2.5 xl:order-1 xl:pr-1">
          <SectionFrame
            eyebrow="Control rail"
            title="Strategy inputs"
            action={<ControlTabs value={controlTab} onChange={setControlTab} />}
          >
            {controlTab === "weekend" ? (
              <div className="grid gap-2.5">
                <div className="grid gap-1.5">
                  {DEMO_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        const next = applyDemoPreset(defaults, form, preset.id);
                        setForm(next);
                        void requestSuggestions(next, { suppressError: true });
                      }}
                      className="rounded-[10px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left transition duration-200 hover:border-primary/30 hover:bg-white/[0.05] active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-white">{preset.label}</div>
                        <Badge variant="muted">{preset.simulation_runs}</Badge>
                      </div>
                      <div className="mt-1 line-clamp-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{preset.description}</div>
                    </button>
                  ))}
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
                  <SelectField
                    label="Grand Prix"
                    value={form.grand_prix_id}
                    onChange={(value) => setForm({ ...form, grand_prix_id: value })}
                    options={defaults.grands_prix.map((item) => ({ value: item.id, label: item.name }))}
                  />
                  <SelectField
                    label="Weather mode"
                    value={form.weather_preset_id}
                    onChange={(value) => setForm({ ...form, weather_preset_id: value })}
                    options={defaults.weather_presets.map((item) => ({ value: item.id, label: item.label }))}
                  />
                </div>
                <div className="rounded-[10px] border border-primary/15 bg-primary/8 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.24em] text-primary/90">Circuit card</div>
                      <div className="mt-1.5 text-sm text-white">{activeTrack.circuit_name}</div>
                      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{activeTrack.summary}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {activeTrack.sprint_weekend ? <Badge variant="warning">Sprint</Badge> : null}
                      <Badge variant="muted">{activeTrack.country}</Badge>
                    </div>
                  </div>
                  {activeTrack.homologation_note ? (
                    <div className="mt-2 rounded-[10px] border border-amber-300/20 bg-amber-400/10 p-2.5 text-[11px] leading-5 text-amber-100">
                      {activeTrack.homologation_note}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {controlTab === "conditions" ? (
              <div className="grid gap-2.5">
                <SliderField
                  label="Weather swing"
                  value={form.environment.rain_onset}
                  onChange={(value) => setForm({ ...form, environment: { ...form.environment, rain_onset: value } })}
                  description="Raises crossover pressure and wet-phase adaptation."
                />
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
                  <SliderField
                    label="SC / VSC risk"
                    value={form.environment.full_safety_cars}
                    onChange={(value) => setForm({ ...form, environment: { ...form.environment, full_safety_cars: value } })}
                    description="Higher neutralization rate, smaller pit-loss penalty."
                  />
                  <SliderField
                    label="Yellow flags"
                    value={form.environment.yellow_flags}
                    onChange={(value) => setForm({ ...form, environment: { ...form.environment, yellow_flags: value } })}
                    description="Short local cautions and tactical noise."
                  />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
                  <SliderField
                    label="Energy deployment"
                    value={form.environment.energy_deployment_intensity}
                    onChange={(value) =>
                      setForm({ ...form, environment: { ...form.environment, energy_deployment_intensity: value } })
                    }
                    description="Changes how strongly active-aero and deployment windows shape pace."
                  />
                  <SliderField
                    label="Retirement pressure"
                    value={form.environment.dnfs}
                    onChange={(value) => setForm({ ...form, environment: { ...form.environment, dnfs: value } })}
                    description="Mechanical and incident attrition."
                  />
                </div>
                <SliderField
                  label="Late-race incidents"
                  value={form.environment.late_race_incidents}
                  onChange={(value) =>
                    setForm({ ...form, environment: { ...form.environment, late_race_incidents: value } })
                  }
                  description="Adds restart pressure and closing-lap volatility."
                />
              </div>
            ) : null}

            {controlTab === "strategy" ? (
              <div className="space-y-2.5">
                <SelectField
                  label="Field"
                  value={form.field_strategy_preset}
                  onChange={(value) => setForm({ ...form, field_strategy_preset: value })}
                  options={[{ value: "", label: "Suggested / manual mix" }].concat(
                    defaults.strategy_templates.map((item) => ({ value: item.id, label: item.name })),
                  )}
                />
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <Button variant="secondary" onClick={() => void requestSuggestions()} disabled={loadingSuggestions}>
                    {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                    Refresh strategy
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const nextStrategies = { ...form.strategies };
                      for (const suggestion of suggestions) {
                        nextStrategies[suggestion.driver_id] = suggestion.strategy_id;
                      }
                      setForm({ ...form, field_strategy_preset: "", strategies: nextStrategies });
                    }}
                    disabled={!suggestions.length}
                  >
                    Apply field calls
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {suggestions.slice(0, 4).map((suggestion) => (
                    <div key={suggestion.driver_id} className="rounded-[10px] border border-white/8 bg-white/[0.03] p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-white">
                            {defaults.drivers.find((driver) => driver.id === suggestion.driver_id)?.name}
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                            {suggestion.strategy_name}
                          </div>
                        </div>
                        <Badge variant={badgeVariantForRisk(suggestion.risk_profile)}>{suggestion.risk_profile}</Badge>
                      </div>
                      <div className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{suggestion.rationale[0]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {controlTab === "drivers" ? (
              <div className="space-y-1.5">
                {defaults.drivers.map((driver) => {
                  const team = defaults.teams.find((item) => item.id === driver.team_id);
                  const override = form.driver_overrides.find((item) => item.driver_id === driver.id);
                  return (
                    <div key={driver.id} className="rounded-[10px] border border-white/8 bg-white/[0.03] p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-white">{driver.name}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{team?.name}</div>
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          Q {driver.qualifying_strength} · E {driver.energy_management}
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_72px]">
                        <select
                          value={form.strategies[driver.id] ?? ""}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              field_strategy_preset: "",
                              strategies: { ...form.strategies, [driver.id]: event.target.value },
                            })
                          }
                          className="min-h-10 rounded-[10px] border border-white/10 bg-[#090c11] px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
                        >
                          <option value="">Suggested / auto</option>
                          {defaults.strategy_templates.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={-15}
                          max={15}
                          step={1}
                          value={override?.recent_form_delta ?? 0}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              driver_overrides: form.driver_overrides.map((item) =>
                                item.driver_id === driver.id
                                  ? { ...item, recent_form_delta: Number(event.target.value) }
                                  : item,
                              ),
                            })
                          }
                          className="min-h-10 rounded-[10px] border border-white/10 bg-[#090c11] px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        <span>Form delta</span>
                        <span>{formatSigned(override?.recent_form_delta ?? 0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {controlTab === "simulation" ? (
              <div className="grid gap-2.5">
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Simulation runs</span>
                    <input
                      type="number"
                      min={50}
                      max={5000}
                      value={form.simulation_runs}
                      onChange={(event) => setForm({ ...form, simulation_runs: Number(event.target.value) })}
                      className="min-h-10 rounded-[10px] border border-white/10 bg-[#090c11] px-3.5 py-2.5 text-sm text-white outline-none focus:border-primary/60"
                    />
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">200-400 live-safe.</span>
                  </label>
                  <SelectField
                    label="Simulation detail"
                    value={form.complexity_level}
                    onChange={(value) =>
                      setForm({ ...form, complexity_level: value as SimulationFormState["complexity_level"] })
                    }
                    options={[
                      { value: "low", label: "Low detail" },
                      { value: "balanced", label: "Balanced" },
                      { value: "high", label: "High detail" },
                    ]}
                  />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
                  <SliderField
                    label="Qualifying weight"
                    value={form.weights.qualifying_importance}
                    onChange={(value) => setForm({ ...form, weights: { ...form.weights, qualifying_importance: value } })}
                    description="Higher Saturday carry-over and grid leverage."
                  />
                  <SliderField
                    label="Tire wear"
                    value={form.weights.tire_wear_weight}
                    onChange={(value) => setForm({ ...form, weights: { ...form.weights, tire_wear_weight: value } })}
                    description="Long-run deg and stint fade."
                  />
                  <SliderField
                    label="Overtake sensitivity"
                    value={form.weights.overtaking_sensitivity}
                    onChange={(value) => setForm({ ...form, weights: { ...form.weights, overtaking_sensitivity: value } })}
                    description="How much passing skill matters."
                  />
                  <SliderField
                    label="Energy deployment"
                    value={form.weights.energy_deployment_weight}
                    onChange={(value) =>
                      setForm({ ...form, weights: { ...form.weights, energy_deployment_weight: value } })
                    }
                    description="2026 deployment and low-drag payoff."
                  />
                  <SliderField
                    label="Pit loss"
                    value={form.weights.pit_stop_delta_sensitivity}
                    onChange={(value) =>
                      setForm({ ...form, weights: { ...form.weights, pit_stop_delta_sensitivity: value } })
                    }
                    description="Extra-stop penalty and bad timing cost."
                  />
                  <SliderField
                    label="Reliability"
                    value={form.weights.reliability_sensitivity}
                    onChange={(value) =>
                      setForm({ ...form, weights: { ...form.weights, reliability_sensitivity: value } })
                    }
                    description="How hard chaos and attrition bite."
                  />
                </div>
              </div>
            ) : null}
          </SectionFrame>
        </aside>

        <main className="order-1 space-y-3 xl:order-2">
          <motion.section {...motionProps}>
            <SectionFrame eyebrow="Race outcome projection" title="Outcome board" action={<Badge variant={signalVariant(currentVolatility)}>{volatilityLabel(currentVolatility)}</Badge>}>
              {!deferredSimulation ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 rounded-[10px] border border-dashed border-white/10 bg-black/20 px-3 py-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-primary/20 bg-primary/10">
                      <Radar className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-[1rem] uppercase tracking-[0.06em] text-white">Awaiting first run</div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Order, fit, points, and disruption load after the first simulation.</div>
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricPanel label="Weekend state" value={activeWeather.label} detail="Current weather mode" tone="muted" />
                    <MetricPanel label="Circuit pressure" value={volatilityLabel(currentVolatility)} detail="SC risk + weather swing + noise" tone={signalVariant(currentVolatility)} />
                    <MetricPanel label="Qualifying value" value={`${Math.round(activeTrack.qualifying_importance * 100)}/100`} detail="Grid leverage" tone="muted" />
                    <MetricPanel label="Energy demand" value={`${Math.round(activeTrack.energy_sensitivity * 100)}/100`} detail="Deployment payoff" tone="default" />
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-[1.3fr_0.7fr]">
                  <div className="grid gap-2.5 md:grid-cols-2">
                    <MetricPanel
                      label="Lead car"
                      value={leadDriver ? leadDriver.driver_name : "Pending"}
                      detail={leadDriver ? `${formatPct(leadDriver.win_probability)} win · P${leadDriver.expected_finish_position.toFixed(1)} expected` : "Pending"}
                      tone="default"
                    />
                    <MetricPanel
                      label="Podium lane"
                      value={leadDriver ? formatPct(leadDriver.podium_probability) : "Pending"}
                      detail={leadDriver ? `${leadDriver.team_name} leads the board` : "Pending"}
                      tone="success"
                    />
                    <MetricPanel
                      label="Points load"
                      value={leadDriver ? leadDriver.expected_points.toFixed(1) : "Pending"}
                      detail={leadDriver ? `${formatPct(leadDriver.points_probability)} score chance` : "Pending"}
                      tone="success"
                    />
                    <MetricPanel
                      label="Risk channel"
                      value={deferredSimulation.event_summary.dominant_factor}
                      detail={deferredSimulation.scenario.event_outlook}
                      tone="warning"
                    />
                  </div>
                  <div className="rounded-[12px] border border-white/8 bg-black/25 p-3.5">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-primary/90">Scenario line</div>
                    <div className="mt-2.5 text-sm leading-6 text-white">{deferredSimulation.scenario.headline}</div>
                    <div className="mt-3 grid gap-2.5">
                      <div className="rounded-[10px] border border-white/8 bg-white/[0.03] p-2.5">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Strategy outlook</div>
                        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{deferredSimulation.scenario.strategy_outlook}</div>
                      </div>
                      <div className="rounded-[10px] border border-white/8 bg-white/[0.03] p-2.5">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Confidence note</div>
                        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{deferredSimulation.scenario.confidence_note}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionFrame>
          </motion.section>

          {deferredSimulation ? (
            <>
              <motion.div {...motionProps}>
                <SectionFrame eyebrow="Detailed analytics" title="Race engineering deck" action={<AnalyticsTabs value={analyticsView} onChange={setAnalyticsView} />}>
                  {analyticsView === "order" ? (
                    <div className="space-y-5">
                      <div className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
                        <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Projected order</div>
                            <Badge variant="muted">Top 8</Badge>
                          </div>
                          <div className="h-[330px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={positionData} layout="vertical" margin={{ left: 8, right: 8 }}>
                                <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.08)" />
                                <XAxis type="number" tick={{ fill: "#8e9cab", fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="name" tick={{ fill: "#f5f7fa", fontSize: 12 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                  formatter={(_, __, payload) => `P${payload?.payload?.rawExpected?.toFixed?.(1) ?? "-"}`}
                                  contentStyle={tooltipStyle}
                                />
                                <Bar dataKey="expected" radius={[0, 8, 8, 0]}>
                                  {positionData.map((entry, index) => (
                                    <Cell key={entry.name} fill={index === 0 ? "#ff415f" : index <= 2 ? "#f7bb43" : "#8e9cab"} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Top-six distribution</div>
                            <Badge variant="muted">P1-P6</Badge>
                          </div>
                          <div className="h-[330px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={topDistribution}>
                                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                                <XAxis dataKey="driver" tick={{ fill: "#8e9cab", fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: "#8e9cab", fontSize: 12 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={tooltipStyle} />
                                {["P1", "P2", "P3", "P4", "P5", "P6"].map((key, index) => (
                                  <Bar key={key} dataKey={key} stackId="a" fill={distributionColors[index]} />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                      <DriverTable drivers={deferredDrivers} />
                    </div>
                  ) : null}

                  {analyticsView === "strategy" ? (
                    <div className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
                      <div className="space-y-3">
                        {suggestions.slice(0, 6).map((suggestion) => (
                          <div key={suggestion.driver_id} className="rounded-[16px] border border-white/8 bg-white/[0.03] p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-sm text-white">
                                  {defaults.drivers.find((driver) => driver.id === suggestion.driver_id)?.name}
                                </div>
                                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{suggestion.strategy_name}</div>
                              </div>
                              <Badge variant={badgeVariantForRisk(suggestion.risk_profile)}>{suggestion.risk_profile}</Badge>
                            </div>
                            <div className="mt-3 grid gap-1 text-sm leading-6 text-muted-foreground">
                              {suggestion.rationale.slice(0, 2).map((reason) => (
                                <div key={reason}>{reason}</div>
                              ))}
                            </div>
                            <div className="mt-3 border-t border-white/8 pt-3 text-[12px] leading-5 text-muted-foreground">{suggestion.tradeoff}</div>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-4">
                        <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Constructors view</div>
                          <div className="mt-4 grid gap-3">
                            {deferredSimulation.team_summary.map((team) => (
                              <div key={team.team_id} className="rounded-[14px] border border-white/8 bg-white/[0.03] p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm text-white">{team.team_name}</div>
                                  <div className="font-display text-[1.45rem] leading-none text-white">P{team.avg_expected_finish.toFixed(1)}</div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <div className="rounded-[10px] border border-white/8 bg-black/20 p-2.5">
                                    <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Points</div>
                                    <div className="mt-1 text-white">{team.expected_points.toFixed(1)}</div>
                                  </div>
                                  <div className="rounded-[10px] border border-white/8 bg-black/20 p-2.5">
                                    <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Podium</div>
                                    <div className="mt-1 text-white">{formatPct(team.combined_podium_probability)}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Engineer notes</div>
                          <div className="mt-4 grid gap-3">
                            {topDrivers.map((driver) => (
                              <div key={driver.driver_id} className="rounded-[14px] border border-white/8 bg-white/[0.03] p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm text-white">{driver.driver_name}</div>
                                    <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{driver.team_name}</div>
                                  </div>
                                  <div className="text-sm text-white">{formatPct(driver.win_probability)}</div>
                                </div>
                                <div className="mt-2 text-[12px] leading-5 text-muted-foreground">{driver.explanation[0]}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {analyticsView === "diagnostics" ? (
                    <div className="grid gap-5 2xl:grid-cols-[0.95fr_1.05fr]">
                      <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Disruption frequency</div>
                          <Badge variant={signalVariant(deferredSimulation.event_summary.volatility_index)}>
                            {deferredSimulation.event_summary.volatility_index.toFixed(2)}
                          </Badge>
                        </div>
                        <div className="h-[330px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={eventData}>
                              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                              <XAxis dataKey="label" tick={{ fill: "#8e9cab", fontSize: 12 }} axisLine={false} tickLine={false} />
                              <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: "#8e9cab", fontSize: 12 }} axisLine={false} tickLine={false} />
                              <Tooltip formatter={(value: number) => formatPct(value)} contentStyle={tooltipStyle} />
                              <Bar dataKey="value" radius={[7, 7, 0, 0]}>
                                {eventData.map((entry) => (
                                  <Cell
                                    key={entry.label}
                                    fill={
                                      entry.label === "Safety"
                                        ? "#f7bb43"
                                        : entry.label === "Red"
                                          ? "#ff875f"
                                          : entry.label === "VSC"
                                            ? "#31c48d"
                                            : entry.label === "Weather"
                                              ? "#ff415f"
                                              : "#8895a7"
                                    }
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="grid gap-4">
                        <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Lead diagnostics</div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <SignalMeter label="Pace edge" value={Math.min(1, Math.max(0, ((leaderDiagnostics?.pace_edge ?? 0) + 1.6) / 3.2))} secondary={compactNumber(leaderDiagnostics?.pace_edge ?? 0)} />
                            <SignalMeter label="Track fit" value={Math.min(1, Math.max(0, (leaderDiagnostics?.track_fit_score ?? 0) / 20))} secondary={compactNumber(leaderDiagnostics?.track_fit_score ?? 0)} />
                            <SignalMeter label="Strategy comp" value={Math.min(1, Math.max(0, ((leaderDiagnostics?.strategy_component ?? 0) + 6) / 12))} secondary={compactNumber(leaderDiagnostics?.strategy_component ?? 0)} />
                            <SignalMeter label="Chaos resilience" value={Math.min(1, Math.max(0, leaderDiagnostics?.chaos_resilience ?? 0))} secondary={compactNumber(leaderDiagnostics?.chaos_resilience ?? 0)} />
                          </div>
                        </div>
                        <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Impact summary</div>
                          <div className="mt-4 grid gap-3">
                            {deferredSimulation.event_summary.impact_summary.map((item) => (
                              <div key={item} className="rounded-[14px] border border-white/8 bg-white/[0.03] p-3 text-sm leading-6 text-muted-foreground">
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </SectionFrame>
              </motion.div>
            </>
          ) : (
            <SectionFrame eyebrow="No active run" title="Projection board">
              <div className="rounded-[12px] border border-dashed border-white/10 bg-black/20 p-5 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[10px] border border-primary/20 bg-primary/10">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-3 text-base uppercase tracking-[0.08em] text-white">No active projection</div>
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Run once to populate the board.</div>
              </div>
            </SectionFrame>
          )}
        </main>

        <aside className="order-2 grid gap-3 sm:grid-cols-2 xl:order-3 xl:grid-cols-1 xl:pl-1">
          <InsightCard
            title="Circuit sensitivity"
            subtitle="Track-led levers."
            icon={Thermometer}
          >
            <div className="grid gap-2">
              <SignalMeter label="Qualifying" value={activeTrack.qualifying_importance} />
              <SignalMeter label="Track position" value={activeTrack.track_position_importance} />
              <SignalMeter label="Energy demand" value={activeTrack.energy_sensitivity} />
              <SignalMeter label="Weather swing" value={activeTrack.weather_volatility} />
              <SignalMeter label="SC risk" value={activeTrack.safety_car_risk} />
            </div>
          </InsightCard>

          <InsightCard
            title="Scenario pressure"
            subtitle="Current control state."
            icon={ShieldAlert}
          >
            <div className="grid gap-2">
              <SignalMeter label="Weather" value={form.environment.rain_onset} secondary={sliderLabel(form.environment.rain_onset)} />
              <SignalMeter label="Race control" value={(form.environment.full_safety_cars + form.environment.virtual_safety_cars) / 2} secondary="SC / VSC" />
              <SignalMeter label="Attrition" value={(form.environment.dnfs + form.environment.crashes) / 2} secondary="DNF + incident" />
              <SignalMeter label="Randomness" value={form.environment.randomness_intensity} secondary={volatilityLabel(form.environment.randomness_intensity)} />
            </div>
          </InsightCard>

          <InsightCard
            title="Lead diagnostics"
            subtitle="Why the lead car is on top."
            icon={Zap}
          >
            {leaderDiagnostics ? (
              <div className="grid gap-2">
                <SignalMeter label="Pace edge" value={Math.min(1, Math.max(0, (leaderDiagnostics.pace_edge + 1.6) / 3.2))} secondary={compactNumber(leaderDiagnostics.pace_edge)} />
                <SignalMeter label="Track fit" value={Math.min(1, Math.max(0, leaderDiagnostics.track_fit_score / 20))} secondary={compactNumber(leaderDiagnostics.track_fit_score)} />
                <SignalMeter label="Strategy comp" value={Math.min(1, Math.max(0, (leaderDiagnostics.strategy_component + 6) / 12))} secondary={compactNumber(leaderDiagnostics.strategy_component)} />
                <SignalMeter label="Chaos resilience" value={Math.min(1, Math.max(0, leaderDiagnostics.chaos_resilience))} secondary={compactNumber(leaderDiagnostics.chaos_resilience)} />
              </div>
            ) : (
              <div className="rounded-[12px] border border-white/8 bg-white/[0.03] p-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Run to inspect pace edge, track fit, strategy comp, and chaos resilience.
              </div>
            )}
          </InsightCard>

          <InsightCard
            title="Track profile"
            subtitle="Weekend metadata."
            icon={Flag}
          >
            <div className="rounded-[10px] border border-white/8 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white">{activeTrack.name}</div>
                {activeTrack.sprint_weekend ? <Badge variant="warning">Sprint</Badge> : <Badge variant="muted">Standard</Badge>}
              </div>
              <div className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{activeTrack.summary}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[10px] border border-white/8 bg-black/20 p-2.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Circuit</div>
                <div className="mt-1 text-sm text-white">{activeTrack.circuit_type}</div>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-black/20 p-2.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Laps</div>
                <div className="mt-1 text-sm text-white">{activeTrack.laps}</div>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-black/20 p-2.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Pit loss</div>
                <div className="mt-1 text-sm text-white">{activeTrack.pit_loss_seconds.toFixed(1)}s</div>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-black/20 p-2.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Deg</div>
                <div className="mt-1 text-sm capitalize text-white">{activeTrack.degradation_profile}</div>
              </div>
            </div>
          </InsightCard>

          <InsightCard
            title="Top notes"
            subtitle="Front group scan."
            icon={Trophy}
          >
            {topDrivers.length ? (
              <div className="space-y-1.5">
                {topDrivers.map((driver) => (
                  <div key={driver.driver_id} className="rounded-[10px] border border-white/8 bg-white/[0.03] p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] text-white">{driver.driver_name}</div>
                        <div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{driver.team_name}</div>
                      </div>
                      <div className="text-[13px] text-white">{formatPct(driver.win_probability)}</div>
                    </div>
                    <div className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{driver.explanation[0]}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[12px] border border-white/8 bg-white/[0.03] p-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Leader notes and fit signals appear after the first run.
              </div>
            )}
          </InsightCard>
        </aside>
      </div>
    </div>
  );
}
