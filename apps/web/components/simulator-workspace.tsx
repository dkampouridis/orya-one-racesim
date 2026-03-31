"use client";

import type { ComponentType, ReactNode } from "react";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
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
    simulation_runs: 180,
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
    simulation_runs: 160,
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
    simulation_runs: 190,
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
  backgroundColor: "#0f0f0f",
  border: "1px solid #2a2a2a",
  borderRadius: 2,
  color: "#f0f0f0",
  fontFamily: "'DM Mono', monospace",
  fontSize: 11,
} as const;

const distributionColors = ["#e8002d", "#00d2a0", "#4fc3f7", "#f5a623", "#555555", "#333333"];

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
    return "info";
  }
  return "warning";
}

function badgeVariantForRisk(value: StrategySuggestion["risk_profile"]) {
  if (value === "Low") {
    return "success";
  }
  if (value === "Balanced") {
    return "warning";
  }
  return "default";
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

function signalVariant(value: number): "success" | "warning" | "default" {
  if (value < 0.34) {
    return "success";
  }
  if (value < 0.58) {
    return "warning";
  }
  return "default";
}

function telemetryVariant(value: number): "info" | "warning" | "default" {
  if (value < 0.42) {
    return "info";
  }
  if (value < 0.7) {
    return "warning";
  }
  return "default";
}


function compactNumber(value: number) {
  return value.toFixed(2);
}

function formatLapValue(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "Pending";
  }
  return `L${Math.round(value)}`;
}

function formatLapWindow(start?: number | null, end?: number | null) {
  if (start == null && end == null) {
    return "Pending";
  }
  if (start == null) {
    return `L${end}`;
  }
  if (end == null || start === end) {
    return `L${start}`;
  }
  return `L${start}-${end}`;
}

function stintPathLabel(path: string[]) {
  if (!path.length) {
    return "Awaiting run";
  }
  return path.join(" → ");
}

function stintLengthsLabel(lengths: number[]) {
  if (!lengths.length) {
    return "No lap data";
  }
  return lengths.map((length) => `L${Math.round(length)}`).join(" / ");
}

function formatAveragePerRun(value?: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) {
    return "Pending";
  }
  return `${value.toFixed(digits)} avg / run`;
}

function formatAveragePerDriver(value?: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) {
    return "Pending";
  }
  return `${value.toFixed(digits)} avg / driver`;
}

function formatScoreOutOf100(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "Pending";
  }
  return `${Math.round(value * 10)}/100`;
}

function formatCompactScore(value?: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) {
    return "Pending";
  }
  return value.toFixed(digits);
}

function trustTierVariant(
  value:
    | "High confidence"
    | "Moderate confidence"
    | "Experimental / Low confidence"
    | "Strong support"
    | "Moderate support"
    | "Limited support"
    | "Deep calibration"
    | "Established calibration"
    | "Limited calibration"
    | "Grounded"
    | "Partially grounded"
    | "Modeled-heavy"
    | "Stable"
    | "Variable"
    | "High-chaos",
): "success" | "warning" | "default" | "info" | "muted" {
  if (
    value === "High confidence"
    || value === "Strong support"
    || value === "Deep calibration"
    || value === "Grounded"
    || value === "Stable"
  ) {
    return "success";
  }
  if (
    value === "Moderate confidence"
    || value === "Moderate support"
    || value === "Established calibration"
    || value === "Partially grounded"
    || value === "Variable"
  ) {
    return "warning";
  }
  if (value === "Experimental / Low confidence" || value === "Limited support" || value === "Limited calibration" || value === "High-chaos") {
    return "default";
  }
  return "info";
}

function trustScoreLabel(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "Pending";
  }
  return `${Math.round(value * 100)}/100`;
}

function compactTrustLabel(value: string) {
  return value
    .replace(" confidence", "")
    .replace(" support", "")
    .replace(" calibration", "")
    .replace(" / Low confidence", "")
    .replace("Partially grounded", "Partial grounding");
}

function summarizePhaseLoad(value: number, type: "pit" | "move") {
  if (type === "pit") {
    if (value < 0.18) {
      return "Low stop pressure";
    }
    if (value < 0.34) {
      return "Measured stop pressure";
    }
    return "High stop pressure";
  }

  if (value < 1.2) {
    return "Low move rate";
  }
  if (value < 2.8) {
    return "Measured move rate";
  }
  return "High move rate";
}

function presetMetaLabel(preset: (typeof DEMO_PRESETS)[number], defaults: DefaultsPayload) {
  const gp = defaults.grands_prix.find((item) => item.id === preset.grand_prix_id)?.name ?? "Scenario";
  const weather = defaults.weather_presets.find((item) => item.id === preset.weather_preset_id)?.label ?? "Weather";
  return `${gp} · ${weather} · ${preset.simulation_runs} runs`;
}

function DisclosureButton({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: "1px solid #2a2a2a",
        borderRadius: "2px",
        padding: "3px 8px",
        background: "transparent",
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "#8a8a8a",
        cursor: "pointer",
        transition: "border-color 100ms, color 100ms",
      }}
      className="hover:border-[#444] hover:text-[#f0f0f0]"
    >
      <span>{expanded ? "Hide" : "Show"} {label}</span>
      {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
    </button>
  );
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
    <Card className="overflow-hidden">
      <div
        style={{
          borderBottom: "1px solid #1a1a1a",
          padding: "12px 16px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          {eyebrow ? (
            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#444444",
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#f0f0f0",
              marginTop: eyebrow ? 4 : 0,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: "#8a8a8a",
                marginTop: 3,
                fontStyle: "italic",
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        {action}
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
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
  variant?: "default" | "muted" | "success" | "warning" | "info";
}) {
  const borderColor =
    variant === "default"
      ? "#e8002d"
      : variant === "success"
        ? "#00d2a0"
        : variant === "warning"
          ? "#f5a623"
          : variant === "info"
            ? "#4fc3f7"
            : "#222222";
  const bgColor =
    variant === "default"
      ? "#1a0a0a"
      : "#111111";
  const valueColor =
    variant === "default"
      ? "#f0f0f0"
      : variant === "success"
        ? "#00d2a0"
        : variant === "warning"
          ? "#f5a623"
          : variant === "info"
            ? "#4fc3f7"
            : "#8a8a8a";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${borderColor}`,
        borderRadius: "2px",
        padding: "3px 8px",
        background: bgColor,
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          fontWeight: 400,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#444444",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: valueColor,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
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
  tone?: "muted" | "default" | "success" | "warning" | "info";
}) {
  const badgeLabel =
    tone === "default" ? "ATTACK" : tone === "success" ? "STABLE" : tone === "warning" ? "CAUTION" : tone === "info" ? "INFO" : "NEUTRAL";
  const badgeStyle: React.CSSProperties =
    tone === "default"
      ? { background: "#e8002d", border: "1px solid #e8002d", color: "#fff" }
      : tone === "success"
        ? { background: "transparent", border: "1px solid #00d2a0", color: "#00d2a0" }
        : tone === "warning"
          ? { background: "transparent", border: "1px solid #f5a623", color: "#f5a623" }
          : tone === "info"
            ? { background: "transparent", border: "1px solid #4fc3f7", color: "#4fc3f7" }
            : { background: "transparent", border: "1px dashed #444", color: "#8a8a8a" };

  return (
    <div
      style={{
        border: "1px solid #1f1f1f",
        borderRadius: "2px",
        padding: "12px",
        background: "#0f0f0f",
        transition: "border-color 100ms",
      }}
      className="hover:border-[#333]"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 400,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#444444",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "2px 6px",
            borderRadius: "2px",
            flexShrink: 0,
            ...badgeStyle,
          }}
        >
          {badgeLabel}
        </span>
      </div>
      <div
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 22,
          fontWeight: 700,
          color: "#f0f0f0",
          lineHeight: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          borderTop: "1px solid #1a1a1a",
          marginTop: 8,
          paddingTop: 8,
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          color: "#555",
          fontStyle: "italic",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {detail}
      </div>
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
    <label className="flex flex-col gap-1.5">
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "#444444",
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          minHeight: 36,
          borderRadius: "2px",
          border: "1px solid #2a2a2a",
          background: "#0f0f0f",
          padding: "6px 12px",
          fontSize: 12,
          fontFamily: "'Inter', sans-serif",
          color: "#f0f0f0",
          outline: "none",
          transition: "border-color 100ms",
          appearance: "none",
          cursor: "pointer",
        }}
        className="focus:border-[#e8002d]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} style={{ background: "#0f0f0f" }}>
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
    <label
      style={{
        display: "block",
        border: "1px solid #1f1f1f",
        borderRadius: "2px",
        background: "#0f0f0f",
        padding: "10px 12px",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: "#f0f0f0",
          }}
        >
          {label}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8a8a8a",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{sliderLabel(value)}</span>
          <span style={{ color: "#f0f0f0" }}>{value.toFixed(2)}</span>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: "100%", cursor: "pointer", accentColor: "#e8002d" }}
        className="h-1.5 appearance-none bg-[#1f1f1f] rounded-[2px]"
      />
      <p
        style={{
          marginTop: 6,
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          fontWeight: 400,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#444444",
        }}
      >
        {description.split(".")[0]}
      </p>
    </label>
  );
}

function SignalMeter({
  label,
  value,
  secondary,
  tone,
}: {
  label: string;
  value: number;
  secondary?: string;
  tone?: "default" | "muted" | "success" | "warning" | "info";
}) {
  const barColor =
    tone === "success"
      ? "#00d2a0"
      : tone === "warning"
        ? "#f5a623"
        : tone === "info"
          ? "#4fc3f7"
          : tone === "default"
            ? "#e8002d"
            : "#444444";

  const pct = Math.max(4, Math.min(100, value * 100));
  // Segmented dot indicators: 10 dots total
  const totalDots = 10;
  const filledDots = Math.round(pct / 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 400,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8a8a8a",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.12em",
            color: "#f0f0f0",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {secondary ?? `${Math.round(value * 100)}/100`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        {Array.from({ length: totalDots }).map((_, i) => (
          <span
            key={i}
            style={{
              fontSize: 8,
              color: i < filledDots ? barColor : "#2a2a2a",
              lineHeight: 1,
            }}
          >
            ●
          </span>
        ))}
      </div>
    </div>
  );
}

function InsightCard({
  title,
  subtitle,
  icon: Icon,
  children,
  tone = "info",
}: {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  tone?: "default" | "muted" | "success" | "warning" | "info";
}) {
  const iconColor =
    tone === "default"
      ? "#e8002d"
      : tone === "warning"
        ? "#f5a623"
        : tone === "success"
          ? "#00d2a0"
          : tone === "info"
            ? "#4fc3f7"
            : "#8a8a8a";

  return (
    <Card>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: `1px solid ${iconColor}22`,
              borderRadius: "2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: iconColor,
            }}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div>
            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#f0f0f0",
              }}
            >
              {title}
            </div>
            {subtitle ? (
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  color: "#8a8a8a",
                  marginTop: 2,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </Card>
  );
}

function MetricPanel({
  label,
  value,
  detail,
  tone = "default",
  badgeLabel,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "muted" | "success" | "warning" | "info";
  badgeLabel?: string;
}) {
  const bLabel = badgeLabel ?? label.split(" ")[0];
  return (
    <div
      style={{
        border: "1px solid #1f1f1f",
        borderRadius: "2px",
        background: "#0f0f0f",
        padding: "10px 12px",
        overflow: "hidden",
        minWidth: 0,
        transition: "border-color 100ms",
      }}
      className="hover:border-[#333]"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 400,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8a8a8a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        <Badge variant={tone} className="shrink-0">
          {bLabel}
        </Badge>
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: "'DM Mono', monospace",
          fontSize: 20,
          fontWeight: 700,
          color: "#f0f0f0",
          lineHeight: "1",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          color: "#666",
          fontStyle: "italic",
          lineHeight: 1.4,
        }}
      >
        {detail}
      </div>
    </div>
  );
}

function InlineDataPoint({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <div style={{ textAlign: align }}>
      <div
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 8,
          fontWeight: 400,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#444444",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: "'DM Mono', monospace",
          fontSize: 12,
          fontWeight: 500,
          color: "#f0f0f0",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TrustSummaryCard({
  trust,
  expanded,
  onToggle,
}: {
  trust: NonNullable<SimulationResponse["scenario"]["trust_summary"]>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <InsightCard title="Trust & calibration" subtitle="Confidence, support, grounding, and methodology honesty." icon={ShieldAlert} tone={trustTierVariant(trust.confidence_tier)}>
      <div className="flex flex-wrap gap-2">
        <Badge variant={trustTierVariant(trust.confidence_tier)}>{trust.confidence_tier}</Badge>
        <Badge variant={trustTierVariant(trust.historical_support_tier)}>{trust.historical_support_tier}</Badge>
        <Badge variant={trustTierVariant(trust.data_grounding_tier)}>{trust.data_grounding_tier}</Badge>
        <Badge variant={trustTierVariant(trust.volatility_tier)}>{trust.volatility_tier}</Badge>
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#8a8a8a", lineHeight: 1.5, fontStyle: "italic" }}>{trust.confidence_summary}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SignalMeter label="Confidence" value={trust.confidence_score} secondary={trustScoreLabel(trust.confidence_score)} tone={trustTierVariant(trust.confidence_tier)} />
        <SignalMeter label="Historical support" value={trust.historical_support_score} secondary={trustScoreLabel(trust.historical_support_score)} tone={trustTierVariant(trust.historical_support_tier)} />
        <SignalMeter label="Data grounding" value={trust.data_grounding_score} secondary={trustScoreLabel(trust.data_grounding_score)} tone={trustTierVariant(trust.data_grounding_tier)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <MetricPanel
          label="Winner hit"
          value={formatPct(trust.backtest_summary.winner_hit_rate)}
          detail={`${trust.backtest_summary.weekends_covered} weekends in the current benchmark report`}
          tone="info"
          badgeLabel="Backtest"
        />
        <MetricPanel
          label="Podium overlap"
          value={formatPct(trust.backtest_summary.podium_overlap_rate)}
          detail={`Finish MAE ${trust.backtest_summary.avg_finish_mae.toFixed(2)}`}
          tone="info"
          badgeLabel="Backtest"
        />
        <MetricPanel
          label="Track behavior"
          value={trust.backtest_summary.avg_track_behavior_error.toFixed(2)}
          detail={`Stop-count MAE ${trust.backtest_summary.avg_stop_count_mae.toFixed(2)}`}
          tone="warning"
          badgeLabel="Error"
        />
      </div>
      <div className="flex justify-end">
        <DisclosureButton expanded={expanded} onToggle={onToggle} label="trust notes" />
      </div>
      {expanded ? (
        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 12, display: "grid", gap: 12 }} className="lg:grid-cols-2">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: "#4fc3f7" }}>Calibration notes</div>
            {trust.calibration_notes.concat(trust.support_notes, trust.coverage_notes).map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#8a8a8a", lineHeight: 1.5 }}>
                <span style={{ marginTop: 4, width: 4, height: 4, borderRadius: "50%", background: "#e8002d", flexShrink: 0, display: "inline-block" }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: "#4fc3f7" }}>Provenance</div>
            {[
              { label: "Official", items: trust.provenance.official_sources },
              { label: "Normalized", items: trust.provenance.normalized_datasets },
              { label: "Modeled", items: trust.provenance.modeled_inputs },
              { label: "Calibrated", items: trust.provenance.calibrated_layers },
              { label: "Live assumptions", items: trust.provenance.live_assumptions },
            ].map((group) => (
              <div key={group.label} style={{ border: "1px solid #1a1a1a", borderRadius: "2px", background: "#0a0a0a", padding: "8px 10px" }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8a8a8a" }}>{group.label}</div>
                <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
                  {group.items.slice(0, 3).map((item) => (
                    <div key={item} style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#8a8a8a", lineHeight: 1.4 }}>{item}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </InsightCard>
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
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #1f1f1f",
        borderRadius: "2px",
        background: "#0f0f0f",
        overflow: "hidden",
      }}
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              padding: "6px 14px",
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: active ? "#f0f0f0" : "#8a8a8a",
              background: active ? "#e8002d" : "transparent",
              border: "none",
              cursor: "pointer",
              transition: "background 100ms, color 100ms",
              borderRight: "1px solid #1f1f1f",
            }}
            className={active ? "" : "hover:text-[#f0f0f0] hover:bg-[#141414]"}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

type ControlSectionId = "weekend" | "conditions" | "strategy" | "drivers" | "simulation";
type WorkspaceMode = "single" | "compare";
type CompareSide = "A" | "B";

function cloneFormState(form: SimulationFormState) {
  return JSON.parse(JSON.stringify(form)) as SimulationFormState;
}

function getCompareSafeRunCap(form: SimulationFormState) {
  const heavyWeather = /(rain|crossover|storm|mixed|wet)/i.test(form.weather_preset_id);
  const heavyCircuit = ["belgian-grand-prix", "singapore-grand-prix", "azerbaijan-grand-prix", "las-vegas-grand-prix"].includes(
    form.grand_prix_id,
  );

  let cap = form.complexity_level === "high" ? 90 : 120;
  if (heavyWeather) {
    cap -= 20;
  }
  if (heavyCircuit) {
    cap -= 10;
  }

  return Math.max(60, cap);
}

function buildCompareSafeForm(form: SimulationFormState) {
  const next = cloneFormState(form);
  next.simulation_runs = Math.min(next.simulation_runs, getCompareSafeRunCap(form));
  return next;
}

function getDriverOverride(form: SimulationFormState, driverId: string) {
  return (
    form.driver_overrides.find((item) => item.driver_id === driverId) ?? {
      driver_id: driverId,
      recent_form_delta: 0,
      qualifying_delta: 0,
      tire_management_delta: 0,
      overtaking_delta: 0,
      consistency_delta: 0,
      aggression_delta: 0,
    }
  );
}

function patchDriverOverride(
  form: SimulationFormState,
  driverId: string,
  patch: Partial<DriverOverride>,
) {
  return {
    ...form,
    driver_overrides: form.driver_overrides.map((item) =>
      item.driver_id === driverId ? { ...item, ...patch } : item,
    ),
  };
}

function compareBadgeVariant(delta: number, higherIsBetter = true): "success" | "warning" | "default" | "info" | "muted" {
  if (Math.abs(delta) < 0.02) {
    return "muted";
  }
  if (higherIsBetter) {
    return delta > 0 ? "success" : "warning";
  }
  return delta < 0 ? "success" : "warning";
}

function compareDeltaText(delta: number, suffix = "", digits = 1) {
  if (Math.abs(delta) < 0.05) {
    return "No material change";
  }
  const formatted = `${delta > 0 ? "+" : ""}${delta.toFixed(digits)}${suffix}`;
  return formatted;
}

function getActivePresetId(form: SimulationFormState) {
  const active = DEMO_PRESETS.find(
    (preset) =>
      preset.grand_prix_id === form.grand_prix_id &&
      preset.weather_preset_id === form.weather_preset_id &&
      preset.field_strategy_preset === form.field_strategy_preset &&
      preset.complexity_level === form.complexity_level &&
      preset.simulation_runs === form.simulation_runs,
  );
  return active?.id ?? "custom";
}

function getChangedFieldSummary(
  defaults: DefaultsPayload,
  formA: SimulationFormState,
  formB: SimulationFormState,
) {
  const changed: string[] = [];

  if (formA.grand_prix_id !== formB.grand_prix_id) {
    changed.push("Grand Prix");
  }
  if (formA.weather_preset_id !== formB.weather_preset_id) {
    changed.push("Weather mode");
  }
  if (formA.field_strategy_preset !== formB.field_strategy_preset) {
    changed.push("Field strategy");
  }
  if (formA.complexity_level !== formB.complexity_level) {
    changed.push("Simulation detail");
  }
  if (formA.simulation_runs !== formB.simulation_runs) {
    changed.push("Run count");
  }
  if (Math.abs(formA.weights.qualifying_importance - formB.weights.qualifying_importance) >= 0.04) {
    changed.push("Qualifying weight");
  }
  if (Math.abs(formA.weights.overtaking_sensitivity - formB.weights.overtaking_sensitivity) >= 0.04) {
    changed.push("Overtaking sensitivity");
  }
  if (Math.abs(formA.weights.energy_deployment_weight - formB.weights.energy_deployment_weight) >= 0.04) {
    changed.push("Energy deployment");
  }
  if (Math.abs(formA.weights.pit_stop_delta_sensitivity - formB.weights.pit_stop_delta_sensitivity) >= 0.04) {
    changed.push("Pit timing sensitivity");
  }
  if (Math.abs(formA.weights.reliability_sensitivity - formB.weights.reliability_sensitivity) >= 0.04) {
    changed.push("Reliability");
  }
  if (Math.abs(formA.environment.rain_onset - formB.environment.rain_onset) >= 0.05) {
    changed.push("Rain onset");
  }
  if (Math.abs(formA.environment.randomness_intensity - formB.environment.randomness_intensity) >= 0.05) {
    changed.push("Volatility");
  }
  if (Math.abs(formA.environment.full_safety_cars - formB.environment.full_safety_cars) >= 0.05) {
    changed.push("SC pressure");
  }

  const driverOverrideChanged = defaults.drivers.some((driver) => {
    const overrideA = getDriverOverride(formA, driver.id);
    const overrideB = getDriverOverride(formB, driver.id);
    return (
      overrideA.recent_form_delta !== overrideB.recent_form_delta ||
      overrideA.overtaking_delta !== overrideB.overtaking_delta ||
      overrideA.qualifying_delta !== overrideB.qualifying_delta
    );
  });

  if (driverOverrideChanged) {
    changed.push("Driver assumptions");
  }

  return changed;
}

function buildCompareInsights(
  formA: SimulationFormState,
  formB: SimulationFormState,
  resultA: SimulationResponse | null,
  resultB: SimulationResponse | null,
  defaults: DefaultsPayload,
) {
  const insights: string[] = [];
  const trackA = defaults.grands_prix.find((item) => item.id === formA.grand_prix_id);
  const trackB = defaults.grands_prix.find((item) => item.id === formB.grand_prix_id);

  if (resultA && resultB) {
    const leadA = resultA.drivers[0];
    const leadB = resultB.drivers[0];
    if (leadA && leadB && leadA.driver_id !== leadB.driver_id) {
      insights.push(`${leadA.driver_name} leads Scenario A while ${leadB.driver_name} leads Scenario B.`);
    }

    const moveDelta =
      resultB.event_summary.movement_summary.avg_overtakes_per_simulation -
      resultA.event_summary.movement_summary.avg_overtakes_per_simulation;
    if (Math.abs(moveDelta) >= 0.2) {
      insights.push(
        `${moveDelta > 0 ? "More" : "Fewer"} overtakes expected in Scenario ${moveDelta > 0 ? "B" : "A"}.`,
      );
    }

    const stopDelta =
      (resultB.event_summary.strategy_diagnostics.avg_first_stop_lap ?? 0) -
      (resultA.event_summary.strategy_diagnostics.avg_first_stop_lap ?? 0);
    if (Math.abs(stopDelta) >= 1.5) {
      insights.push(`Earlier first stop in Scenario ${stopDelta > 0 ? "A" : "B"}.`);
    }

    const scDelta =
      resultB.event_summary.event_timing.safety_car_leverage_score -
      resultA.event_summary.event_timing.safety_car_leverage_score;
    if (Math.abs(scDelta) >= 0.08) {
      insights.push(`Greater SC leverage in Scenario ${scDelta > 0 ? "B" : "A"}.`);
    }

    const volatilityDelta =
      resultB.event_summary.volatility_index - resultA.event_summary.volatility_index;
    if (Math.abs(volatilityDelta) >= 0.06) {
      insights.push(
        `${volatilityDelta > 0 ? "Higher" : "Lower"} confidence stability in Scenario ${volatilityDelta > 0 ? "B" : "A"} due to race volatility.`,
      );
    }
  }

  if (trackA && trackB && trackA.id !== trackB.id) {
    const trackPosDelta = trackB.track_position_importance - trackA.track_position_importance;
    if (Math.abs(trackPosDelta) >= 0.08) {
      insights.push(
        `${trackPosDelta > 0 ? trackB.name : trackA.name} preserves grid order more strongly through track-position pressure.`,
      );
    }
  }

  if (formA.weather_preset_id !== formB.weather_preset_id || Math.abs(formA.environment.rain_onset - formB.environment.rain_onset) >= 0.08) {
    insights.push(`Weather crossover pressure is materially different between the two scenarios.`);
  }

  return insights.slice(0, 5);
}

function ControlRailNav({
  value,
  onChange,
}: {
  value: ControlSectionId;
  onChange: (value: ControlSectionId) => void;
}) {
  const items: Array<{
    id: ControlSectionId;
    label: string;
    eyebrow: string;
  }> = [
    { id: "weekend", label: "Weekend", eyebrow: "R01" },
    { id: "conditions", label: "Conditions", eyebrow: "R02" },
    { id: "strategy", label: "Strategy", eyebrow: "R03" },
    { id: "drivers", label: "Drivers", eyebrow: "R04" },
    { id: "simulation", label: "Simulation", eyebrow: "R05" },
  ];

  return (
    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              minHeight: 52,
              border: `1px solid ${active ? "#e8002d44" : "#1f1f1f"}`,
              borderRadius: "2px",
              padding: "8px 12px",
              background: active ? "#1a0a0a" : "#0f0f0f",
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 100ms, background 100ms",
            }}
            className="group hover:border-[#2a2a2a] hover:bg-[#141414]"
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 8,
                  fontWeight: 500,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: active ? "#e8002d" : "#444444",
                }}
              >
                {item.eyebrow}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: active ? "#f0f0f0" : "#8a8a8a",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </div>
            </div>
            <div
              style={{
                width: 2,
                height: 24,
                background: active ? "#e8002d" : "#1f1f1f",
                flexShrink: 0,
                transition: "background 100ms",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function CompareConfigPanel({
  scenarioLabel,
  title,
  onTitleChange,
  defaults,
  form,
  onFormChange,
  changedFields,
  focusDriverId,
  onFocusDriverChange,
  loading,
  expanded,
  onToggleExpanded,
}: {
  scenarioLabel: CompareSide;
  title: string;
  onTitleChange: (value: string) => void;
  defaults: DefaultsPayload;
  form: SimulationFormState;
  onFormChange: (value: SimulationFormState) => void;
  changedFields: string[];
  focusDriverId: string;
  onFocusDriverChange: (value: string) => void;
  loading: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const activePresetId = getActivePresetId(form);
  const focusOverride = getDriverOverride(form, focusDriverId || defaults.drivers[0]?.id || "");
  const compareCap = getCompareSafeRunCap(form);
  const activeTrack = defaults.grands_prix.find((item) => item.id === form.grand_prix_id) ?? defaults.grands_prix[0];
  const activeWeather = defaults.weather_presets.find((item) => item.id === form.weather_preset_id) ?? defaults.weather_presets[0];
  const activeStrategy =
    defaults.strategy_templates.find((item) => item.id === form.field_strategy_preset)?.name ?? "Balanced / auto";

  return (
    <SectionFrame
      eyebrow={`Scenario ${scenarioLabel}`}
      title={title}
      subtitle={`${activeTrack.name} · ${activeWeather.label} · ${activeStrategy}`}
      action={
        <div className="flex items-center gap-2">
          <Badge variant={scenarioLabel === "A" ? "info" : "default"}>{loading ? "Running" : "Ready"}</Badge>
          <DisclosureButton expanded={expanded} onToggle={onToggleExpanded} label="controls" />
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">{activeTrack.circuit_name}</Badge>
          <Badge variant="muted">{activeWeather.label}</Badge>
          <Badge variant="default">{activeStrategy}</Badge>
          <Badge variant="warning">{Math.min(form.simulation_runs, compareCap)} runs</Badge>
          <Badge variant="muted">{form.complexity_level}</Badge>
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Scenario title</span>
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            className="min-h-10 rounded-[2px] border border-[#2a2a2a] bg-[#0f0f0f] px-3.5 py-2.5 text-sm text-[#f0f0f0] outline-none transition focus:border-[#e8002d]"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {changedFields.length ? changedFields.slice(0, 6).map((field) => <Badge key={field} variant="info">{field}</Badge>) : <Badge variant="muted">Matched baseline</Badge>}
        </div>

        {expanded ? (
          <>
            <div className="grid gap-2.5 border-t border-[#1f1f1f] pt-3 md:grid-cols-2">
              <SelectField
                label="Preset"
                value={activePresetId}
                onChange={(value) =>
                  onFormChange(value === "custom" ? form : applyDemoPreset(defaults, form, value))
                }
                options={[
                  { value: "custom", label: "Custom" },
                  ...DEMO_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
                ]}
              />
              <SelectField
                label="Grand Prix"
                value={form.grand_prix_id}
                onChange={(value) => onFormChange({ ...form, grand_prix_id: value })}
                options={defaults.grands_prix.map((item) => ({ value: item.id, label: item.name }))}
              />
              <SelectField
                label="Weather"
                value={form.weather_preset_id}
                onChange={(value) => onFormChange({ ...form, weather_preset_id: value })}
                options={defaults.weather_presets.map((item) => ({ value: item.id, label: item.label }))}
              />
              <SelectField
                label="Field strategy"
                value={form.field_strategy_preset}
                onChange={(value) => onFormChange({ ...form, field_strategy_preset: value })}
                options={[
                  { value: "", label: "Balanced / auto" },
                  ...defaults.strategy_templates.map((item) => ({ value: item.id, label: item.name })),
                ]}
              />
              <label className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Simulation runs</span>
                <input
                  type="number"
                  min={50}
                  max={500}
                  value={form.simulation_runs}
                  onChange={(event) => onFormChange({ ...form, simulation_runs: Number(event.target.value) })}
                  className="min-h-10 rounded-[2px] border border-[#2a2a2a] bg-[#0f0f0f] px-3.5 py-2.5 text-sm text-[#f0f0f0] outline-none transition focus:border-[#e8002d]"
                />
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a]">Compare-safe cap {compareCap} runs</span>
              </label>
              <SelectField
                label="Detail"
                value={form.complexity_level}
                onChange={(value) => onFormChange({ ...form, complexity_level: value as SimulationFormState["complexity_level"] })}
                options={[
                  { value: "low", label: "Low detail" },
                  { value: "balanced", label: "Balanced" },
                  { value: "high", label: "High detail" },
                ]}
              />
            </div>

            <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3">
              <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[#4fc3f7]">Driver assumption</div>
              <div className="grid gap-2.5 md:grid-cols-3">
                <SelectField
                  label="Driver"
                  value={focusDriverId}
                  onChange={onFocusDriverChange}
                  options={defaults.drivers.map((driver) => ({ value: driver.id, label: driver.name }))}
                />
                <label className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Form delta</span>
                  <input
                    type="number"
                    min={-15}
                    max={15}
                    step={1}
                    value={focusOverride.recent_form_delta}
                    onChange={(event) => onFormChange(patchDriverOverride(form, focusDriverId, { recent_form_delta: Number(event.target.value) }))}
                    className="min-h-10 rounded-[2px] border border-[#2a2a2a] bg-[#0f0f0f] px-3.5 py-2.5 text-sm text-[#f0f0f0] outline-none transition focus:border-[#e8002d]"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Overtake delta</span>
                  <input
                    type="number"
                    min={-15}
                    max={15}
                    step={1}
                    value={focusOverride.overtaking_delta}
                    onChange={(event) => onFormChange(patchDriverOverride(form, focusDriverId, { overtaking_delta: Number(event.target.value) }))}
                    className="min-h-10 rounded-[2px] border border-[#2a2a2a] bg-[#0f0f0f] px-3.5 py-2.5 text-sm text-[#f0f0f0] outline-none transition focus:border-[#e8002d]"
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-2.5 md:grid-cols-2">
              <SliderField
                label="Qualifying weight"
                value={form.weights.qualifying_importance}
                onChange={(value) => onFormChange({ ...form, weights: { ...form.weights, qualifying_importance: value } })}
                description="Saturday carry-over and grid leverage."
              />
              <SliderField
                label="Overtake sensitivity"
                value={form.weights.overtaking_sensitivity}
                onChange={(value) => onFormChange({ ...form, weights: { ...form.weights, overtaking_sensitivity: value } })}
                description="How much passing skill matters."
              />
              <SliderField
                label="Energy deployment"
                value={form.weights.energy_deployment_weight}
                onChange={(value) => onFormChange({ ...form, weights: { ...form.weights, energy_deployment_weight: value } })}
                description="Straight-line release and active-aero payoff."
              />
              <SliderField
                label="Pit timing sensitivity"
                value={form.weights.pit_stop_delta_sensitivity}
                onChange={(value) => onFormChange({ ...form, weights: { ...form.weights, pit_stop_delta_sensitivity: value } })}
                description="Extra-stop penalty and bad timing cost."
              />
              <SliderField
                label="Reliability"
                value={form.weights.reliability_sensitivity}
                onChange={(value) => onFormChange({ ...form, weights: { ...form.weights, reliability_sensitivity: value } })}
                description="How hard chaos and attrition bite."
              />
              <SliderField
                label="Rain onset"
                value={form.environment.rain_onset}
                onChange={(value) => onFormChange({ ...form, environment: { ...form.environment, rain_onset: value } })}
                description="Wet crossover probability."
              />
              <SliderField
                label="Volatility"
                value={form.environment.randomness_intensity}
                onChange={(value) => onFormChange({ ...form, environment: { ...form.environment, randomness_intensity: value } })}
                description="Overall race-state randomness."
              />
              <SliderField
                label="SC pressure"
                value={form.environment.full_safety_cars}
                onChange={(value) => onFormChange({ ...form, environment: { ...form.environment, full_safety_cars: value } })}
                description="Neutralization pressure on the strategy model."
              />
            </div>
          </>
        ) : null}
      </div>
    </SectionFrame>
  );
}

function CompareMetricCard({
  label,
  scenarioA,
  scenarioB,
  delta,
  deltaTone = "info",
  detail,
}: {
  label: string;
  scenarioA: string;
  scenarioB: string;
  delta: string;
  deltaTone?: "default" | "muted" | "success" | "warning" | "info";
  detail: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #1f1f1f",
        borderRadius: "2px",
        background: "#0f0f0f",
        padding: "12px",
        transition: "border-color 100ms",
      }}
      className="hover:border-[#333]"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 400,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#8a8a8a",
          }}
        >
          {label}
        </div>
        <Badge variant={deltaTone}>{delta}</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: "#4fc3f7" }}>A</div>
          <div style={{ marginTop: 4, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{scenarioA}</div>
        </div>
        <div style={{ color: "#444444", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>→</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: "#e8002d" }}>B</div>
          <div style={{ marginTop: 4, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{scenarioB}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#666", fontStyle: "italic", lineHeight: 1.4 }}>{detail}</div>
    </div>
  );
}

function TimingStrip({
  drivers,
  expanded = false,
}: {
  drivers: DriverResult[];
  expanded?: boolean;
}) {
  return (
    <div className="timing-strip" style={{ display: "flex", flexDirection: "column", gap: 1, background: "#1a1a1a" }}>
      {drivers.map((driver, index) => (
        <div
          key={driver.driver_id}
          style={{
            display: "grid",
            gridTemplateColumns: "40px 1fr 60px 60px 60px 60px",
            alignItems: "center",
            gap: 8,
            minHeight: 48,
            background: "#0f0f0f",
            padding: "0 12px",
            borderLeft: "2px solid transparent",
            transition: "background 100ms, border-color 100ms",
          }}
          className="hover:bg-[#161616] hover:border-l-[#e8002d]"
        >
          {/* Position block */}
          <div
            style={{
              width: 32,
              height: 32,
              background: index === 0 ? "#e8002d" : "#1a1a1a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'DM Mono', monospace",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
              borderRadius: "2px",
            }}
          >
            {index + 1}
          </div>
          {/* Driver */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: "#f0f0f0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {driver.driver_name}
            </div>
            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 8,
                fontWeight: 400,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#555",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {driver.team_name}
            </div>
          </div>
          {/* Stats */}
          <InlineDataPoint label="Win" value={formatPct(driver.win_probability)} align="right" />
          <InlineDataPoint label="Pts" value={driver.expected_points.toFixed(1)} align="right" />
          <InlineDataPoint label="Fit" value={formatCompactScore(driver.strategy_fit_score)} align="right" />
          <InlineDataPoint label="Stops" value={driver.expected_stop_count.toFixed(1)} align="right" />
        </div>
      ))}
      {expanded && drivers.length > 0 ? (
        <div style={{ background: "#0f0f0f", padding: "8px 12px 10px", borderTop: "1px solid #1a1a1a" }}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {drivers.slice(0, 1).map((driver) => (
              <>
                <InlineDataPoint key="nd" label="Net delta" value={formatSigned(Number(driver.net_position_delta.toFixed(1)))} />
                <InlineDataPoint key="ss" label="Strategy success" value={formatPct(driver.strategy_success_rate)} />
                <InlineDataPoint key="po" label="Podium odds" value={formatPct(driver.podium_probability)} />
                <InlineDataPoint key="ef" label="Expected finish" value={`P${driver.expected_finish_position.toFixed(1)}`} />
              </>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StopMixBar({ stops, share }: { stops: number; share: number }) {
  const totalBlocks = 20;
  const filled = Math.round(share * totalBlocks);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#8a8a8a",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{stops} stop</span>
        <span style={{ color: "#4fc3f7" }}>{formatPct(share)}</span>
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2 }}>
        {Array.from({ length: totalBlocks }).map((_, i) => (
          <span key={i} style={{ color: i < filled ? "#4fc3f7" : "#1f1f1f" }}>█</span>
        ))}
      </div>
    </div>
  );
}

function StintSummaryCard({
  driver,
  accent,
  expanded = false,
}: {
  driver: DriverResult;
  accent: "default" | "info" | "success";
  expanded?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #1f1f1f",
        borderRadius: "2px",
        background: "#0f0f0f",
        padding: "14px",
        transition: "border-color 100ms",
      }}
      className="hover:border-[#333]"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "#f0f0f0" }}>{driver.driver_name}</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: "#555", marginTop: 3 }}>{driver.team_name}</div>
        </div>
        <Badge variant={accent}>{driver.expected_stop_count.toFixed(1)} stops</Badge>
      </div>
      <div
        style={{
          border: "1px solid #1a1a1a",
          borderRadius: "2px",
          padding: "10px 12px",
          background: "#0a0a0a",
          marginBottom: 10,
        }}
      >
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.22em", textTransform: "uppercase", color: "#444" }}>Primary race path</div>
        <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: "#f0f0f0", lineHeight: 1.5 }}>{stintPathLabel(driver.primary_stint_path)}</div>
        <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "#555" }}>
          Avg stint lengths · {stintLengthsLabel(driver.primary_stint_lengths)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InlineDataPoint label="First stop" value={formatLapValue(driver.average_first_pit_lap)} />
        <InlineDataPoint label="Pit window" value={formatLapWindow(driver.first_pit_window_start, driver.first_pit_window_end)} />
        <InlineDataPoint label="Stop count" value={`${driver.expected_stop_count.toFixed(1)} avg`} />
      </div>
      {expanded && driver.alternate_stint_path.length ? (
        <div
          style={{
            marginTop: 10,
            border: "1px solid #1a1a1a",
            borderRadius: "2px",
            padding: "10px 12px",
            background: "#0a0a0a",
          }}
        >
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.22em", textTransform: "uppercase", color: "#444" }}>Alternate path</div>
          <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#f0f0f0aa", lineHeight: 1.4 }}>{stintPathLabel(driver.alternate_stint_path)}</div>
          <div style={{ marginTop: 5, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "#555" }}>
            Avg stint lengths · {stintLengthsLabel(driver.alternate_stint_lengths)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RaceTimelineStrip({
  phases,
  mode = "detail",
}: {
  phases: SimulationResponse["event_summary"]["race_phases"];
  mode?: "compact" | "detail";
}) {
  return (
    <div className="grid gap-1 lg:grid-cols-4" style={{ background: "#1a1a1a", gap: 1 }}>
      {phases.map((phase) => (
        <div
          key={phase.phase_id}
          style={{
            border: "1px solid #1f1f1f",
            borderRadius: "2px",
            background: "#0f0f0f",
            padding: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 400, letterSpacing: "0.22em", textTransform: "uppercase", color: "#444" }}>{phase.label}</div>
              <div style={{ marginTop: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8a8a8a" }}>
                {formatLapWindow(phase.start_lap, phase.end_lap)}
              </div>
            </div>
            <Badge variant={signalVariant(phase.volatility)}>{volatilityLabel(phase.volatility)}</Badge>
          </div>
          {mode === "compact" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SignalMeter
                label="Risk"
                value={phase.volatility}
                secondary={`${phase.volatility.toFixed(2)} score`}
                tone={signalVariant(phase.volatility)}
              />
              <div className="grid grid-cols-2 gap-3">
                <InlineDataPoint label="Pit pressure" value={summarizePhaseLoad(phase.pit_pressure, "pit").replace(" pressure", "")} />
                <InlineDataPoint label="Move load" value={summarizePhaseLoad(phase.overtake_load, "move").replace(" rate", "")} align="right" />
              </div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#8a8a8a", fontStyle: "italic", lineHeight: 1.4 }}>{phase.summary}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SignalMeter
                label="Phase risk"
                value={phase.volatility}
                secondary={`${phase.volatility.toFixed(2)} risk score`}
                tone={signalVariant(phase.volatility)}
              />
              <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 8, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                <InlineDataPoint label="Pit pressure" value={formatAveragePerDriver(phase.pit_pressure, 2)} />
                <InlineDataPoint label="Move rate" value={formatAveragePerRun(phase.overtake_load, 1)} align="right" />
              </div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#8a8a8a", fontStyle: "italic", lineHeight: 1.4 }}>{phase.summary}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DriverTable({ drivers }: { drivers: DriverResult[] }) {
  const winColor = (p: number) =>
    p > 0.3 ? "#00d2a0" : p > 0.1 ? "#f5a623" : "#555555";

  return (
    <div style={{ overflowX: "auto", border: "1px solid #1f1f1f", borderRadius: "2px" }}>
      <div style={{ minWidth: 1040 }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "44px 1.6fr 1fr repeat(7, minmax(82px, 1fr))",
            gap: 12,
            background: "#141414",
            padding: "10px 16px",
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "#444444",
          }}
        >
          <span>Pos</span>
          <span>Driver</span>
          <span>Strategy</span>
          <span>Win odds</span>
          <span>Podium</span>
          <span>Exp pts</span>
          <span>DNF</span>
          <span>Volatility</span>
          <span>Strat fit</span>
          <span>Expected</span>
        </div>
        {drivers.map((driver, index) => (
          <div
            key={driver.driver_id}
            style={{
              display: "grid",
              gridTemplateColumns: "44px 1.6fr 1fr repeat(7, minmax(82px, 1fr))",
              gap: 12,
              padding: "14px 16px",
              borderTop: "1px solid #1a1a1a",
              background: index % 2 === 0 ? "#0a0a0a" : "#0f0f0f",
              borderLeft: "2px solid transparent",
              transition: "background 100ms, border-color 100ms",
              alignItems: "start",
            }}
            className="hover:bg-[#161616] hover:border-l-[#e8002d]"
          >
            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 18,
                fontWeight: 700,
                color: "#f0f0f0",
                fontVariantNumeric: "tabular-nums",
                paddingTop: 2,
              }}
            >
              {index + 1}
            </div>
            <div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "#f0f0f0" }}>{driver.driver_name}</div>
              <div style={{ marginTop: 3, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", color: "#555" }}>{driver.team_name}</div>
              <div style={{ marginTop: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#8a8a8a", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{driver.explanation[0]}</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#f0f0f0", fontWeight: 500 }}>{driver.assigned_strategy_name}</div>
              <div style={{ marginTop: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#555", fontVariantNumeric: "tabular-nums" }}>{formatPct(driver.strategy_success_rate)} success rate</div>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500, color: winColor(driver.win_probability), fontVariantNumeric: "tabular-nums" }}>{formatPct(driver.win_probability)}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{formatPct(driver.podium_probability)}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{driver.expected_points.toFixed(1)}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{formatPct(driver.dnf_probability)}</div>
            <div>
              <Badge variant={badgeVariantForConfidence(driver.confidence_label)}>{driver.confidence_label}</Badge>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{driver.strategy_fit_score.toFixed(1)}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>P{driver.expected_finish_position.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SimulatorWorkspace() {
  const [defaults, setDefaults] = useState<DefaultsPayload | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("single");
  const [form, setForm] = useState<SimulationFormState | null>(null);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [suggestions, setSuggestions] = useState<StrategySuggestion[]>([]);
  const [compareFormA, setCompareFormA] = useState<SimulationFormState | null>(null);
  const [compareFormB, setCompareFormB] = useState<SimulationFormState | null>(null);
  const [compareSimulationA, setCompareSimulationA] = useState<SimulationResponse | null>(null);
  const [compareSimulationB, setCompareSimulationB] = useState<SimulationResponse | null>(null);
  const [compareTitleA, setCompareTitleA] = useState("Scenario A");
  const [compareTitleB, setCompareTitleB] = useState("Scenario B");
  const [compareFocusDriverA, setCompareFocusDriverA] = useState("");
  const [compareFocusDriverB, setCompareFocusDriverB] = useState("");
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState<CompareSide | "both" | null>(null);
  const [showCompareDetail, setShowCompareDetail] = useState(false);
  const [showCompareConfigA, setShowCompareConfigA] = useState(false);
  const [showCompareConfigB, setShowCompareConfigB] = useState(false);
  const [analyticsView, setAnalyticsView] = useState<"order" | "strategy" | "diagnostics">("order");
  const [controlTab, setControlTab] = useState<ControlSectionId>("weekend");
  const [showPresetDetail, setShowPresetDetail] = useState(false);
  const [showProjectedFrontDetail, setShowProjectedFrontDetail] = useState(false);
  const [showMovementDetail, setShowMovementDetail] = useState(false);
  const [showDeepRaceDetail, setShowDeepRaceDetail] = useState(false);
  const [showTelemetryRail, setShowTelemetryRail] = useState(false);
  const [showTrustDetail, setShowTrustDetail] = useState(false);
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
        setCompareFormA(buildCompareSafeForm(initialForm));
        setCompareFormB(buildCompareSafeForm(initialForm));
        setCompareFocusDriverA(payload.drivers[0]?.id ?? "");
        setCompareFocusDriverB(payload.drivers[1]?.id ?? payload.drivers[0]?.id ?? "");
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

  function duplicateCurrentIntoCompare() {
    if (!form || !defaults) {
      return;
    }
    const nextA = buildCompareSafeForm(form);
    const nextB = buildCompareSafeForm(form);
    setCompareFormA(nextA);
    setCompareFormB(nextB);
    setCompareSimulationA(null);
    setCompareSimulationB(null);
    setCompareTitleA("Scenario A");
    setCompareTitleB("Scenario B");
    setCompareFocusDriverA(compareFocusDriverA || defaults.drivers[0]?.id || "");
    setCompareFocusDriverB(compareFocusDriverB || defaults.drivers[1]?.id || defaults.drivers[0]?.id || "");
    setCompareError(null);
  }

  async function executeCompareSimulation(side: CompareSide, activeForm: SimulationFormState) {
    if (!defaults) {
      return null;
    }

    const safeForm = buildCompareSafeForm(activeForm);
    const response = await runSimulation<SimulationResponse>(safeForm);
    if (hasUnknownDriverIds(defaults, response.drivers)) {
      throw new Error("The backend is still on the old fictional grid. Redeploy the API before running 2026 race simulations.");
    }
    if (side === "A") {
      setCompareSimulationA(response);
    } else {
      setCompareSimulationB(response);
    }
    return response;
  }

  async function runCompareScenarios() {
    if (!compareFormA || !compareFormB || !defaults) {
      return;
    }

    setCompareLoading("both");
    setCompareError(null);
    try {
      await executeCompareSimulation("A", compareFormA);
      await executeCompareSimulation("B", compareFormB);
    } catch (requestError) {
      setCompareError(requestError instanceof Error ? requestError.message : "Compare run failed.");
    } finally {
      setCompareLoading(null);
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
      <Card className="border-[#e8002d44] bg-[#1a0a0a]">
        <CardHeader>
          <CardTitle>2026 season data unavailable</CardTitle>
          <CardDescription>
            Start the FastAPI service on `http://localhost:8000` for local development, or set `API_URL` / `NEXT_PUBLIC_API_URL` so the frontend proxy can reach the 2026 Formula 1 backend.
          </CardDescription>
        </CardHeader>
        {error ? <CardContent className="text-sm text-[#f0f0f0]">{error}</CardContent> : null}
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
  const movementSummary = deferredSimulation?.event_summary.movement_summary;
  const strategyDiagnostics = deferredSimulation?.event_summary.strategy_diagnostics;
  const eventTiming = deferredSimulation?.event_summary.event_timing;
  const racePhases = deferredSimulation?.event_summary.race_phases ?? [];
  const trustSummary = deferredSimulation?.scenario.trust_summary;
  const stopMix = strategyDiagnostics?.stop_count_distribution ?? [];
  const stopMixLeader = stopMix[0];
  const biggestMovers = deferredDrivers
    .slice()
    .sort((left, right) => Math.abs(right.net_position_delta) - Math.abs(left.net_position_delta))
    .slice(0, 3);
  const hardestToPass = deferredDrivers
    .slice()
    .sort(
      (left, right) =>
        left.average_overtakes + left.average_position_changes * 0.25 - (right.average_overtakes + right.average_position_changes * 0.25),
    )
    .slice(0, 3);
  const stintDrivers = topDrivers.slice(0, 2);
  const mainTurningPoints = deferredSimulation?.event_summary.evolution_summary.slice(0, 3) ?? [];

  const currentVolatility = deferredSimulation?.event_summary.volatility_index ?? (
    form.environment.randomness_intensity * 0.32
    + form.environment.rain_onset * 0.22
    + activeTrack.weather_volatility * 0.18
    + activeTrack.safety_car_risk * 0.14
    + form.environment.full_safety_cars * 0.14
  );

  const leaderDiagnostics = leadDriver?.diagnostics ?? null;
  const compareChangedFields =
    compareFormA && compareFormB ? getChangedFieldSummary(defaults, compareFormA, compareFormB) : [];
  const compareTrackA =
    compareFormA ? defaults.grands_prix.find((item) => item.id === compareFormA.grand_prix_id) ?? defaults.grands_prix[0] : null;
  const compareTrackB =
    compareFormB ? defaults.grands_prix.find((item) => item.id === compareFormB.grand_prix_id) ?? defaults.grands_prix[0] : null;
  const compareWeatherA =
    compareFormA ? defaults.weather_presets.find((item) => item.id === compareFormA.weather_preset_id) ?? defaults.weather_presets[0] : null;
  const compareWeatherB =
    compareFormB ? defaults.weather_presets.find((item) => item.id === compareFormB.weather_preset_id) ?? defaults.weather_presets[0] : null;
  const compareLeadA = compareSimulationA?.drivers[0] ?? null;
  const compareLeadB = compareSimulationB?.drivers[0] ?? null;
  const compareTrustA = compareSimulationA?.scenario.trust_summary ?? null;
  const compareTrustB = compareSimulationB?.scenario.trust_summary ?? null;
  const compareTopA = compareSimulationA?.drivers.slice(0, 4) ?? [];
  const compareTopB = compareSimulationB?.drivers.slice(0, 4) ?? [];
  const compareInsights =
    compareFormA && compareFormB
      ? buildCompareInsights(compareFormA, compareFormB, compareSimulationA, compareSimulationB, defaults)
      : [];
  const compareMovementDelta =
    (compareSimulationB?.event_summary.movement_summary.avg_overtakes_per_simulation ?? 0) -
    (compareSimulationA?.event_summary.movement_summary.avg_overtakes_per_simulation ?? 0);
  const comparePointsDelta = (compareLeadB?.expected_points ?? 0) - (compareLeadA?.expected_points ?? 0);
  const compareWinDelta = (compareLeadB?.win_probability ?? 0) - (compareLeadA?.win_probability ?? 0);
  const comparePodiumDelta = (compareLeadB?.podium_probability ?? 0) - (compareLeadA?.podium_probability ?? 0);
  const compareStopDelta =
    (compareSimulationB?.event_summary.strategy_diagnostics.avg_first_stop_lap ?? 0) -
    (compareSimulationA?.event_summary.strategy_diagnostics.avg_first_stop_lap ?? 0);
  const compareVolatilityDelta =
    (compareSimulationB?.event_summary.volatility_index ?? 0) -
    (compareSimulationA?.event_summary.volatility_index ?? 0);
  const compareScDelta =
    (compareSimulationB?.event_summary.event_timing.safety_car_leverage_score ?? 0) -
    (compareSimulationA?.event_summary.event_timing.safety_car_leverage_score ?? 0);
  const comparePhaseRows = ["opening", "first-stop", "transition", "closing"].map((phaseId) => {
    const phaseA = compareSimulationA?.event_summary.race_phases.find((phase) => phase.phase_id === phaseId);
    const phaseB = compareSimulationB?.event_summary.race_phases.find((phase) => phase.phase_id === phaseId);
    return {
      phaseId,
      label: phaseA?.label ?? phaseB?.label ?? phaseId,
      phaseA,
      phaseB,
    };
  });
  const compareTrustNarrative = (() => {
    if (!compareTrustA || !compareTrustB) {
      return "Run both scenarios to compare confidence, historical support, and grounding side by side.";
    }

    const confidenceDelta = compareTrustB.confidence_score - compareTrustA.confidence_score;
    const supportDelta = compareTrustB.historical_support_score - compareTrustA.historical_support_score;
    if (Math.abs(confidenceDelta) < 0.05 && Math.abs(supportDelta) < 0.05) {
      return "Both scenarios sit on similar trust footing; the key trade-off is race behavior, not calibration depth.";
    }
    if (confidenceDelta > 0.05) {
      return `Scenario B is better grounded overall, with ${compareTrustB.historical_support_tier.toLowerCase()} and ${compareTrustB.volatility_tier.toLowerCase()} conditions.`;
    }
    return `Scenario A is better grounded overall, with ${compareTrustA.historical_support_tier.toLowerCase()} and ${compareTrustA.volatility_tier.toLowerCase()} conditions.`;
  })();
  const compareDecisionCall = (() => {
    if (!compareSimulationA || !compareSimulationB) {
      return {
        title: "Run both scenarios",
        body: "The board will turn the raw race outputs into a direct A/B decision once both scenarios are simulated.",
        tone: "muted" as const,
      };
    }

    const pointsEdge = comparePointsDelta;
    const winEdge = compareWinDelta * 100;
    const volatilityEdge = compareVolatilityDelta;
    const movementEdge = compareMovementDelta;

    if (pointsEdge >= 0.8 && volatilityEdge <= 0.04) {
      return {
        title: "Scenario B is the stronger baseline call",
        body: `It improves expected points by ${compareDeltaText(pointsEdge, " pts")} with no meaningful volatility penalty.`,
        tone: "success" as const,
      };
    }

    if (pointsEdge <= -0.8 && volatilityEdge >= -0.04) {
      return {
        title: "Scenario A is the stronger baseline call",
        body: `It protects expected points by ${compareDeltaText(Math.abs(pointsEdge), " pts")} without giving away confidence stability.`,
        tone: "success" as const,
      };
    }

    if (Math.abs(movementEdge) >= 0.2 || Math.abs(volatilityEdge) >= 0.06) {
      const attackSide = movementEdge > 0 || winEdge > 0 ? "B" : "A";
      return {
        title: `Scenario ${attackSide} is the higher-variance attack path`,
        body: "It shifts race movement and volatility enough to change how the race unfolds, not just the finishing order.",
        tone: "warning" as const,
      };
    }

    return {
      title: "Both scenarios are strategically close",
      body: "The main differences are in setup emphasis rather than a major shift in race outcome or control.",
      tone: "muted" as const,
    };
  })();
  const compareWhatChanged = [
    compareLeadA?.driver_id === compareLeadB?.driver_id
      ? `${compareLeadA?.driver_name ?? "The same driver"} remains the projected lead car.`
      : `${compareLeadA?.driver_name ?? "Scenario A"} gives way to ${compareLeadB?.driver_name ?? "Scenario B"} at the front.`,
    Math.abs(compareStopDelta) >= 1.5
      ? `The first stop opens earlier in Scenario ${compareStopDelta > 0 ? "A" : "B"}.`
      : "First-stop timing stays broadly aligned.",
    Math.abs(compareMovementDelta) >= 0.2
      ? `Race movement is ${compareMovementDelta > 0 ? "higher" : "lower"} in Scenario ${compareMovementDelta > 0 ? "B" : "A"}.`
      : "Race movement stays close across both scenarios.",
  ];
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
        <Card className="overflow-hidden border-[#1f1f1f]">
          <CardContent className="p-3.5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#1f1f1f] pb-3">
              <div className="inline-flex rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-1">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("single")}
                  className={`rounded-[2px] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors duration-100 ${
                    workspaceMode === "single" ? "bg-[#e8002d] text-[#f0f0f0]" : "text-[#8a8a8a] hover:text-[#f0f0f0]"
                  }`}
                >
                  Single scenario
                </button>
                <button
                  type="button"
                  onClick={() => {
                    duplicateCurrentIntoCompare();
                    setWorkspaceMode("compare");
                  }}
                  className={`rounded-[2px] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors duration-100 ${
                    workspaceMode === "compare" ? "bg-[#e8002d] text-[#f0f0f0]" : "text-[#8a8a8a] hover:text-[#f0f0f0]"
                  }`}
                >
                  Compare mode
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {workspaceMode === "compare" ? <Badge variant="info">Decision workflow</Badge> : <Badge>Grand Prix</Badge>}
                <Badge variant="muted">{workspaceMode === "compare" ? "A / B board" : "Single board"}</Badge>
              </div>
            </div>

            {workspaceMode === "single" ? (
              <>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>Grand Prix</Badge>
                      <StatusChip label="Preset" value={activePreset} variant={activePreset === "Custom" ? "muted" : "default"} />
                      <StatusChip label="Weather" value={activeWeather.label} variant="info" />
                      {activeTrack.sprint_weekend ? <StatusChip label="Weekend" value="Sprint" variant="warning" /> : null}
                      <StatusChip label="Volatility" value={volatilityLabel(currentVolatility)} variant={signalVariant(currentVolatility)} />
                      <StatusChip
                        label="Sim"
                        value={loadingSimulation ? "Running" : deferredSimulation ? "Loaded" : "Ready"}
                        variant={loadingSimulation ? "warning" : deferredSimulation ? "success" : "muted"}
                      />
                    </div>
                    <h2 className="mt-2.5 font-mono text-[clamp(1.7rem,3vw,2.7rem)] leading-[0.98] tracking-[-0.05em] text-[#f0f0f0]">
                      {activeTrack.name}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                      <span>{activeTrack.circuit_name}</span>
                      <span>R{activeTrack.calendar_round}</span>
                      <span>{form.simulation_runs} runs</span>
                      <span>{form.complexity_level} detail</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <StatusChip label="Deg" value={activeTrack.degradation_profile} variant={telemetryVariant(activeTrack.tire_stress)} />
                      <StatusChip label="Track pos" value={`${Math.round(activeTrack.track_position_importance * 100)}`} variant="info" />
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
                    <div className="grid gap-2 rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-2.5 sm:grid-cols-2">
                      <StatusChip label="Weekend" value={activeWeather.label} variant="info" />
                      <StatusChip label="Chaos" value={`${Math.round(form.environment.randomness_intensity * 100)}`} variant={signalVariant(form.environment.randomness_intensity)} />
                      <StatusChip label="Quali" value={`${Math.round(form.weights.qualifying_importance * 100)}`} variant="info" />
                      <StatusChip label="Track pos" value={`${Math.round(activeTrack.track_position_importance * 100)}`} variant="info" />
                    </div>
                    {error ? <div className="rounded-[2px] border border-[#e8002d44] bg-[#1a0a0a] px-3 py-2 text-[12px] leading-5 text-[#f0f0f0]">{error}</div> : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 xl:grid-cols-[1.52fr_0.71fr] 2xl:grid-cols-[1.65fr_0.68fr]">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
                  <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Timing strip</div>
                      <Badge variant={leadDriver ? badgeVariantForConfidence(leadDriver.confidence_label) : signalVariant(currentVolatility)}>
                        {leadDriver?.confidence_label ?? "Preview"}
                      </Badge>
                    </div>
                    {deferredSimulation ? (
                      <div className="mt-2">
                        <TimingStrip drivers={topDrivers} />
                      </div>
                    ) : (
                      <div className="mt-2 line-clamp-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#8a8a8a]">
                        Run to load the projected top four, win odds, expected points, and strategy detail.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">Compare mode</Badge>
                      <StatusChip label="Scenario A" value={compareTitleA} variant="info" />
                      <StatusChip label="Scenario B" value={compareTitleB} variant="default" />
                      <StatusChip label="Changed fields" value={`${compareChangedFields.length}`} variant={compareChangedFields.length ? "warning" : "muted"} />
                    </div>
                    <h2 className="mt-2.5 font-mono text-[clamp(1.7rem,3vw,2.5rem)] leading-[0.98] tracking-[-0.05em] text-[#f0f0f0]">
                      Compare what changed, how much, and why
                    </h2>
                    <div className="mt-1 max-w-3xl text-[12px] leading-6 text-[#8a8a8a]">
                      Build two scenarios from the same baseline, run them with compare-safe caps, and inspect the race-order, strategy, movement, and risk deltas in one board.
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-2.5 xl:w-[520px]">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      <Button
                        variant="secondary"
                        className="w-full justify-center"
                        onClick={() => duplicateCurrentIntoCompare()}
                      >
                        Duplicate baseline
                      </Button>
                      <Button
                        variant="secondary"
                        className="w-full justify-center"
                        onClick={() => {
                          if (!compareFormA) return;
                          setCompareFormB(cloneFormState(compareFormA));
                          setCompareSimulationB(null);
                        }}
                      >
                        Copy A → B
                      </Button>
                      <Button
                        variant="secondary"
                        className="w-full justify-center"
                        onClick={() => {
                          if (!compareFormB) return;
                          setCompareFormA(cloneFormState(compareFormB));
                          setCompareSimulationA(null);
                        }}
                      >
                        Copy B → A
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      <Button
                        variant="secondary"
                        className="w-full justify-center"
                        onClick={() => {
                          if (!compareFormA || !compareFormB) return;
                          const nextA = cloneFormState(compareFormB);
                          const nextB = cloneFormState(compareFormA);
                          const titleA = compareTitleB;
                          const titleB = compareTitleA;
                          const resultA = compareSimulationB;
                          const resultB = compareSimulationA;
                          const focusA = compareFocusDriverB;
                          const focusB = compareFocusDriverA;
                          setCompareFormA(nextA);
                          setCompareFormB(nextB);
                          setCompareTitleA(titleA);
                          setCompareTitleB(titleB);
                          setCompareSimulationA(resultA);
                          setCompareSimulationB(resultB);
                          setCompareFocusDriverA(focusA);
                          setCompareFocusDriverB(focusB);
                        }}
                      >
                        Swap A / B
                      </Button>
                      <Button className="w-full justify-center" onClick={() => void runCompareScenarios()} disabled={compareLoading !== null}>
                        {compareLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        Run both
                      </Button>
                      <Button variant="secondary" className="w-full justify-center" onClick={() => setWorkspaceMode("single")}>
                        Exit compare
                      </Button>
                    </div>
                    {compareError ? <div className="rounded-[2px] border border-[#e8002d44] bg-[#1a0a0a] px-3 py-2 text-[12px] leading-5 text-[#f0f0f0]">{compareError}</div> : null}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {workspaceMode === "compare" && compareFormA && compareFormB ? (
        <div className="space-y-3">
          <motion.section {...motionProps}>
            <SectionFrame
              eyebrow="Comparison board"
              title="Scenario delta view"
              subtitle="What changed, how much it changed, and why the race model moved."
              action={
                <div className="flex items-center gap-2">
                  <Badge variant="info">{compareChangedFields.length} changed fields</Badge>
                  <DisclosureButton expanded={showCompareDetail} onToggle={() => setShowCompareDetail((value) => !value)} label="detail deck" />
                </div>
              }
            >
              {compareSimulationA && compareSimulationB ? (
                <div className="space-y-3">
                  <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">What changed</div>
                        <div className="mt-1 text-sm text-[#f0f0f0]">
                          {compareLeadA?.driver_name ?? "Scenario A"} vs {compareLeadB?.driver_name ?? "Scenario B"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {compareChangedFields.slice(0, 5).map((field) => <Badge key={field} variant="info">{field}</Badge>)}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 border-t border-[#1f1f1f] pt-3 lg:grid-cols-[0.92fr_1.08fr_0.9fr]">
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8a8a8a]">Observed shift</div>
                        {compareWhatChanged.map((item) => (
                          <div key={item} className="flex items-start gap-2 text-[11px] leading-5 text-[#8a8a8a]">
                            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#4fc3f7", flexShrink: 0, display: "inline-block", marginTop: 4 }} />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8a8a8a]">Why it changed</div>
                        {compareInsights.map((item) => (
                          <div key={item} className="flex items-start gap-2 text-[11px] leading-5 text-[#8a8a8a]">
                            <span style={{ marginTop: 4, width: 4, height: 4, borderRadius: "50%", background: "#e8002d", flexShrink: 0, display: "inline-block" }} />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-[#8a8a8a]">Decision support</div>
                          <Badge variant={compareDecisionCall.tone}>{compareDecisionCall.tone === "success" ? "Clear edge" : compareDecisionCall.tone === "warning" ? "Trade-off" : "Close call"}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-[#f0f0f0]">{compareDecisionCall.title}</div>
                        <div className="mt-1.5 text-[11px] leading-5 text-[#8a8a8a]">{compareDecisionCall.body}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                    <CompareMetricCard
                      label="Lead car"
                      scenarioA={compareLeadA?.driver_name ?? "Pending"}
                      scenarioB={compareLeadB?.driver_name ?? "Pending"}
                      delta={compareLeadA?.driver_id === compareLeadB?.driver_id ? "Matched" : "Changed"}
                      deltaTone={compareLeadA?.driver_id === compareLeadB?.driver_id ? "muted" : "info"}
                      detail="Who controls the race once the first key windows open."
                    />
                    <CompareMetricCard
                      label="Win odds"
                      scenarioA={compareLeadA ? formatPct(compareLeadA.win_probability) : "Pending"}
                      scenarioB={compareLeadB ? formatPct(compareLeadB.win_probability) : "Pending"}
                      delta={compareDeltaText(compareWinDelta * 100, " pts")}
                      deltaTone={compareBadgeVariant(compareWinDelta, true)}
                      detail="Lead-car win probability difference from Scenario A to B."
                    />
                    <CompareMetricCard
                      label="Podium / points"
                      scenarioA={compareLeadA ? `${formatPct(compareLeadA.podium_probability)} · ${compareLeadA.expected_points.toFixed(1)} pts` : "Pending"}
                      scenarioB={compareLeadB ? `${formatPct(compareLeadB.podium_probability)} · ${compareLeadB.expected_points.toFixed(1)} pts` : "Pending"}
                      delta={compareDeltaText(comparePointsDelta, " pts")}
                      deltaTone={compareBadgeVariant(comparePointsDelta, true)}
                      detail={`Podium delta ${compareDeltaText(comparePodiumDelta * 100, " pts")} for the projected lead car.`}
                    />
                    <CompareMetricCard
                      label="Risk / volatility"
                      scenarioA={compareSimulationA ? volatilityLabel(compareSimulationA.event_summary.volatility_index) : "Pending"}
                      scenarioB={compareSimulationB ? volatilityLabel(compareSimulationB.event_summary.volatility_index) : "Pending"}
                      delta={compareDeltaText(compareVolatilityDelta, "", 2)}
                      deltaTone={compareBadgeVariant(compareVolatilityDelta, false)}
                      detail="Higher values mean more race-state instability and lower confidence."
                    />
                  </div>

                  <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Confidence / calibration</div>
                        <div className="mt-1 text-sm text-[#f0f0f0]">{compareTrustNarrative}</div>
                      </div>
                      <Badge variant="info">Trust delta</Badge>
                    </div>
                    <div className="mt-3 grid gap-3 border-t border-[#1f1f1f] pt-3 lg:grid-cols-2">
                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-[#4fc3f7]">{compareTitleA}</div>
                          {compareTrustA ? <Badge variant={trustTierVariant(compareTrustA.confidence_tier)}>{compactTrustLabel(compareTrustA.confidence_tier)}</Badge> : null}
                        </div>
                        <div className="mt-3 grid gap-2">
                          <SignalMeter label="Confidence" value={compareTrustA?.confidence_score ?? 0} secondary={trustScoreLabel(compareTrustA?.confidence_score)} tone={compareTrustA ? trustTierVariant(compareTrustA.confidence_tier) : "muted"} />
                          <SignalMeter label="Support" value={compareTrustA?.historical_support_score ?? 0} secondary={compareTrustA ? compactTrustLabel(compareTrustA.historical_support_tier) : "Pending"} tone={compareTrustA ? trustTierVariant(compareTrustA.historical_support_tier) : "muted"} />
                          <SignalMeter label="Grounding" value={compareTrustA?.data_grounding_score ?? 0} secondary={compareTrustA ? compactTrustLabel(compareTrustA.data_grounding_tier) : "Pending"} tone={compareTrustA ? trustTierVariant(compareTrustA.data_grounding_tier) : "muted"} />
                        </div>
                      </div>
                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-[#e8002d]">{compareTitleB}</div>
                          {compareTrustB ? <Badge variant={trustTierVariant(compareTrustB.confidence_tier)}>{compactTrustLabel(compareTrustB.confidence_tier)}</Badge> : null}
                        </div>
                        <div className="mt-3 grid gap-2">
                          <SignalMeter label="Confidence" value={compareTrustB?.confidence_score ?? 0} secondary={trustScoreLabel(compareTrustB?.confidence_score)} tone={compareTrustB ? trustTierVariant(compareTrustB.confidence_tier) : "muted"} />
                          <SignalMeter label="Support" value={compareTrustB?.historical_support_score ?? 0} secondary={compareTrustB ? compactTrustLabel(compareTrustB.historical_support_tier) : "Pending"} tone={compareTrustB ? trustTierVariant(compareTrustB.historical_support_tier) : "muted"} />
                          <SignalMeter label="Grounding" value={compareTrustB?.data_grounding_score ?? 0} secondary={compareTrustB ? compactTrustLabel(compareTrustB.data_grounding_tier) : "Pending"} tone={compareTrustB ? trustTierVariant(compareTrustB.data_grounding_tier) : "muted"} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                      <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Top order difference</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-3">
                          <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[#4fc3f7]">{compareTitleA}</div>
                          <TimingStrip drivers={compareTopA} />
                        </div>
                        <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-3">
                          <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[#e8002d]">{compareTitleB}</div>
                          <TimingStrip drivers={compareTopB} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Strategy difference</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <MetricPanel
                            label={compareTitleA}
                            value={formatLapValue(compareSimulationA.event_summary.strategy_diagnostics.avg_first_stop_lap)}
                            detail={`Window ${formatLapWindow(compareSimulationA.event_summary.strategy_diagnostics.first_stop_window_start, compareSimulationA.event_summary.strategy_diagnostics.first_stop_window_end)} · ${compareLeadA?.expected_stop_count.toFixed(1) ?? "0.0"} avg stops`}
                            tone="info"
                            badgeLabel="A"
                          />
                          <MetricPanel
                            label={compareTitleB}
                            value={formatLapValue(compareSimulationB.event_summary.strategy_diagnostics.avg_first_stop_lap)}
                            detail={`Window ${formatLapWindow(compareSimulationB.event_summary.strategy_diagnostics.first_stop_window_start, compareSimulationB.event_summary.strategy_diagnostics.first_stop_window_end)} · ${compareLeadB?.expected_stop_count.toFixed(1) ?? "0.0"} avg stops`}
                            tone="default"
                            badgeLabel="B"
                          />
                        </div>
                        <div className="mt-2 text-[11px] leading-5 text-[#8a8a8a]">
                          {Math.abs(compareStopDelta) >= 1.5
                            ? `Scenario ${compareStopDelta > 0 ? "A" : "B"} opens the first stop window earlier.`
                            : "First-stop timing stays broadly similar across both scenarios."}
                        </div>
                      </div>

                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Movement / overtake difference</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <MetricPanel
                            label="Scenario A"
                            value={formatAveragePerRun(compareSimulationA.event_summary.movement_summary.avg_overtakes_per_simulation)}
                            detail={formatAveragePerDriver(compareSimulationA.event_summary.movement_summary.avg_position_changes_per_driver)}
                            tone={signalVariant(compareSimulationA.event_summary.movement_summary.race_fluidity_score)}
                            badgeLabel={compareSimulationA.event_summary.movement_summary.overtaking_intensity}
                          />
                          <MetricPanel
                            label="Scenario B"
                            value={formatAveragePerRun(compareSimulationB.event_summary.movement_summary.avg_overtakes_per_simulation)}
                            detail={formatAveragePerDriver(compareSimulationB.event_summary.movement_summary.avg_position_changes_per_driver)}
                            tone={signalVariant(compareSimulationB.event_summary.movement_summary.race_fluidity_score)}
                            badgeLabel={compareSimulationB.event_summary.movement_summary.overtaking_intensity}
                          />
                        </div>
                        <div className="mt-2 text-[11px] leading-5 text-[#8a8a8a]">
                          {Math.abs(compareMovementDelta) >= 0.2
                            ? `${compareMovementDelta > 0 ? "Scenario B" : "Scenario A"} produces more race movement and overtaking load.`
                            : "Race movement remains close between the two scenarios."}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                      <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Risk / weather / SC difference</div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <MetricPanel
                          label="Scenario A"
                          value={formatScoreOutOf100(compareSimulationA.event_summary.event_timing.safety_car_leverage_score)}
                          detail={`Crossover ${formatLapWindow(compareSimulationA.event_summary.event_timing.weather_crossover_window_start, compareSimulationA.event_summary.event_timing.weather_crossover_window_end)} · ${compareSimulationA.event_summary.dominant_factor}`}
                          tone="warning"
                          badgeLabel="SC"
                        />
                        <MetricPanel
                          label="Scenario B"
                          value={formatScoreOutOf100(compareSimulationB.event_summary.event_timing.safety_car_leverage_score)}
                          detail={`Crossover ${formatLapWindow(compareSimulationB.event_summary.event_timing.weather_crossover_window_start, compareSimulationB.event_summary.event_timing.weather_crossover_window_end)} · ${compareSimulationB.event_summary.dominant_factor}`}
                          tone="warning"
                          badgeLabel="SC"
                        />
                      </div>
                      <div className="mt-2 text-[11px] leading-5 text-[#8a8a8a]">
                        {Math.abs(compareScDelta) >= 0.08
                          ? `Scenario ${compareScDelta > 0 ? "B" : "A"} is more sensitive to neutralization leverage and race-control timing.`
                          : "Neutralization leverage is broadly aligned across the two scenarios."}
                      </div>
                    </div>

                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                      <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Race phase delta</div>
                      <div className="mt-3 grid gap-2">
                        {comparePhaseRows.map((row) => {
                          const volatilityDelta = (row.phaseB?.volatility ?? 0) - (row.phaseA?.volatility ?? 0);
                          return (
                            <div key={row.phaseId} className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[10px] uppercase tracking-[0.2em] text-[#8a8a8a]">{row.label}</div>
                                <Badge variant={compareBadgeVariant(volatilityDelta, false)}>{compareDeltaText(volatilityDelta, "", 2)}</Badge>
                              </div>
                              <div className="mt-1.5 text-[11px] leading-5 text-[#8a8a8a]">
                                A {row.phaseA ? volatilityLabel(row.phaseA.volatility) : "Pending"} · B {row.phaseB ? volatilityLabel(row.phaseB.volatility) : "Pending"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {showCompareDetail ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      <SectionFrame eyebrow="Scenario A deep read" title={compareTitleA} subtitle={compareTrackA ? `${compareTrackA.name} · ${compareWeatherA?.label}` : undefined}>
                        <div className="space-y-3">
                          {compareLeadA ? <StintSummaryCard driver={compareLeadA} accent="info" expanded /> : null}
                          {compareSimulationA?.event_summary.race_phases ? <RaceTimelineStrip phases={compareSimulationA.event_summary.race_phases} /> : null}
                        </div>
                      </SectionFrame>
                      <SectionFrame eyebrow="Scenario B deep read" title={compareTitleB} subtitle={compareTrackB ? `${compareTrackB.name} · ${compareWeatherB?.label}` : undefined}>
                        <div className="space-y-3">
                          {compareLeadB ? <StintSummaryCard driver={compareLeadB} accent="default" expanded /> : null}
                          {compareSimulationB?.event_summary.race_phases ? <RaceTimelineStrip phases={compareSimulationB.event_summary.race_phases} /> : null}
                        </div>
                      </SectionFrame>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[2px] border border-dashed border-[#2a2a2a] bg-[#0a0a0a] p-5 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[2px] border border-[#4fc3f744] bg-[#001a26]">
                    <Radar className="h-5 w-5 text-[#4fc3f7]" />
                  </div>
                  <div className="mt-3 text-base uppercase tracking-[0.08em] text-[#f0f0f0]">Run both scenarios</div>
                  <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">
                    Compare Mode runs the current engine twice with compare-safe caps, then computes delta summaries on the frontend.
                  </div>
                </div>
              )}
            </SectionFrame>
          </motion.section>

          <motion.section {...motionProps}>
            <SectionFrame
              eyebrow="Scenario setup"
              title="A / B control surfaces"
              subtitle="Compact scenario summaries first. Open controls only when you need to change the underlying assumptions."
              action={<Badge variant="muted">Config below analysis</Badge>}
            >
              <div className="grid gap-3 xl:grid-cols-2">
                <CompareConfigPanel
                  scenarioLabel="A"
                  title={compareTitleA}
                  onTitleChange={setCompareTitleA}
                  defaults={defaults}
                  form={compareFormA}
                  onFormChange={(value) => {
                    setCompareFormA(value);
                    setCompareSimulationA(null);
                  }}
                  changedFields={compareChangedFields}
                  focusDriverId={compareFocusDriverA || defaults.drivers[0]?.id || ""}
                  onFocusDriverChange={setCompareFocusDriverA}
                  loading={compareLoading === "A" || compareLoading === "both"}
                  expanded={showCompareConfigA}
                  onToggleExpanded={() => setShowCompareConfigA((value) => !value)}
                />
                <CompareConfigPanel
                  scenarioLabel="B"
                  title={compareTitleB}
                  onTitleChange={setCompareTitleB}
                  defaults={defaults}
                  form={compareFormB}
                  onFormChange={(value) => {
                    setCompareFormB(value);
                    setCompareSimulationB(null);
                  }}
                  changedFields={compareChangedFields}
                  focusDriverId={compareFocusDriverB || defaults.drivers[1]?.id || defaults.drivers[0]?.id || ""}
                  onFocusDriverChange={setCompareFocusDriverB}
                  loading={compareLoading === "B" || compareLoading === "both"}
                  expanded={showCompareConfigB}
                  onToggleExpanded={() => setShowCompareConfigB((value) => !value)}
                />
              </div>
            </SectionFrame>
          </motion.section>
        </div>
      ) : (
      <div className="grid gap-3 xl:grid-cols-[380px_minmax(0,1fr)_340px] 2xl:grid-cols-[420px_minmax(0,1fr)_360px]">
        <aside className="order-3 space-y-2.5 xl:order-1 xl:pr-1">
          <SectionFrame eyebrow="Control rail" title="Strategy inputs">
            <div className="grid gap-3 lg:grid-cols-[116px_minmax(0,1fr)] xl:grid-cols-[124px_minmax(0,1fr)]">
              <div className="lg:border-r lg:border-[#1a1a1a] lg:pr-3">
                <ControlRailNav value={controlTab} onChange={setControlTab} />
              </div>

              <div className="min-w-0 lg:pl-1">
                {controlTab === "weekend" ? (
                  <div className="grid gap-2.5">
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Weekend presets</div>
                        <DisclosureButton expanded={showPresetDetail} onToggle={() => setShowPresetDetail((value) => !value)} label="preset notes" />
                      </div>
                      {DEMO_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            const next = applyDemoPreset(defaults, form, preset.id);
                            setForm(next);
                            void requestSuggestions(next, { suppressError: true });
                          }}
                          className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-2.5 text-left transition duration-100 hover:border-[#2a2a2a] hover:bg-[#141414] active:scale-[0.99]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm text-[#f0f0f0]">{preset.label}</div>
                              <div className="mt-1 line-clamp-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a]">
                                {presetMetaLabel(preset, defaults)}
                              </div>
                            </div>
                            <Badge variant="info">{preset.simulation_runs}</Badge>
                          </div>
                          {showPresetDetail ? (
                            <div className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-[#8a8a8a]">{preset.description}</div>
                          ) : null}
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
                <div className="rounded-[2px] border border-[#4fc3f726] bg-[#001a26] p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Circuit card</div>
                      <div className="mt-1.5 text-sm text-[#f0f0f0]">{activeTrack.circuit_name}</div>
                      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a]">{activeTrack.summary}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {activeTrack.sprint_weekend ? <Badge variant="warning">Sprint</Badge> : null}
                      <Badge variant="info">{activeTrack.country}</Badge>
                    </div>
                  </div>
                  {activeTrack.homologation_note ? (
                    <div className="mt-2 rounded-[2px] border border-[#f5a62344] bg-[#1a1000] p-2.5 text-[11px] leading-5 text-[#f5a623]">
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
                        <div key={suggestion.driver_id} className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-[#f0f0f0]">
                                {defaults.drivers.find((driver) => driver.id === suggestion.driver_id)?.name}
                              </div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#8a8a8a]">
                                {suggestion.strategy_name}
                              </div>
                            </div>
                            <Badge variant={badgeVariantForRisk(suggestion.risk_profile)}>{suggestion.risk_profile}</Badge>
                          </div>
                          <div className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-[#8a8a8a]">{suggestion.rationale[0]}</div>
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
                        <div key={driver.id} className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-[#f0f0f0]">{driver.name}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#8a8a8a]">{team?.name}</div>
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.2em] text-[#8a8a8a]">
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
                              className="min-h-10 rounded-[2px] border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f0f0f0] outline-none focus:border-[#e8002d]"
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
                              className="min-h-10 rounded-[2px] border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f0f0f0] outline-none focus:border-[#e8002d]"
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
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
                        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Simulation runs</span>
                        <input
                          type="number"
                          min={50}
                          max={5000}
                          value={form.simulation_runs}
                          onChange={(event) => setForm({ ...form, simulation_runs: Number(event.target.value) })}
                          className="min-h-10 rounded-[2px] border border-[#2a2a2a] bg-[#0f0f0f] px-3.5 py-2.5 text-sm text-[#f0f0f0] outline-none focus:border-[#e8002d]"
                        />
                        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a]">80-220 live-safe. Heavy weather/chaos may auto-cut lower with low-detail fallback.</span>
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
              </div>
            </div>
          </SectionFrame>
        </aside>

        <main className="order-1 space-y-3 xl:order-2">
          <motion.section {...motionProps}>
            <SectionFrame
              eyebrow="Race outcome projection"
              title="Outcome board"
              subtitle="Projected order, stop phases, overtaking load, and leverage windows from the lap-by-lap engine."
              action={<Badge variant={signalVariant(currentVolatility)}>{volatilityLabel(currentVolatility)}</Badge>}
            >
              {!deferredSimulation ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 rounded-[2px] border border-dashed border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#4fc3f744] bg-[#001a26]">
                      <Radar className="h-5 w-5 text-[#4fc3f7]" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-[1rem] uppercase tracking-[0.06em] text-[#f0f0f0]">Awaiting first run</div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a]">Order, fit, points, and disruption load after the first simulation.</div>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricPanel label="Weekend state" value={activeWeather.label} detail="Current weather mode" tone="info" badgeLabel="Weekend" />
                    <MetricPanel label="Circuit pressure" value={volatilityLabel(currentVolatility)} detail="SC risk + weather swing + noise" tone={signalVariant(currentVolatility)} badgeLabel="Circuit" />
                    <MetricPanel label="Qualifying value" value={`${Math.round(activeTrack.qualifying_importance * 100)}/100`} detail="Grid leverage" tone="info" badgeLabel="Quali" />
                    <MetricPanel label="Energy demand" value={`${Math.round(activeTrack.energy_sensitivity * 100)}/100`} detail="Deployment payoff" tone="default" badgeLabel="Energy" />
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 2xl:grid-cols-[1.14fr_0.86fr]">
                  <div className="space-y-3">
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Execution strip</div>
                          <div className="mt-1 text-sm text-[#f0f0f0]">Where the race changes, when stops open, and when volatility rises.</div>
                        </div>
                        <Badge variant={signalVariant(movementSummary?.race_fluidity_score ?? currentVolatility)}>
                          {movementSummary?.overtaking_intensity ?? "Preview"}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <RaceTimelineStrip phases={racePhases} mode="compact" />
                      </div>
                    </div>

                    <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                      <MetricPanel
                        label="First stop"
                        value={formatLapValue(strategyDiagnostics?.avg_first_stop_lap)}
                        detail={`Window ${formatLapWindow(strategyDiagnostics?.first_stop_window_start, strategyDiagnostics?.first_stop_window_end)}`}
                        tone="info"
                        badgeLabel="Pit"
                      />
                      <MetricPanel
                        label="Stop count"
                        value={`${strategyDiagnostics?.avg_stop_count.toFixed(1) ?? "0.0"} avg`}
                        detail={
                          stopMixLeader
                            ? `${stopMixLeader.stops}-stop path leads at ${formatPct(stopMixLeader.share)}`
                            : "Awaiting stop mix"
                        }
                        tone="default"
                        badgeLabel="Mix"
                      />
                      <MetricPanel
                        label="Overtake load"
                        value={movementSummary ? formatAveragePerRun(movementSummary.avg_overtakes_per_simulation) : "Pending"}
                        detail={
                          movementSummary
                            ? formatAveragePerDriver(movementSummary.avg_position_changes_per_driver)
                            : "Awaiting movement profile"
                        }
                        tone={signalVariant(movementSummary?.race_fluidity_score ?? 0)}
                        badgeLabel="Moves"
                      />
                      <MetricPanel
                        label="SC leverage"
                        value={eventTiming ? formatScoreOutOf100(eventTiming.safety_car_leverage_score) : "Pending"}
                        detail={
                          eventTiming
                            ? `${eventTiming.average_neutralized_pit_gain.toFixed(1)}s avg pit gain under SC / VSC · ${eventTiming.leverage_phase}`
                            : "Awaiting neutralization profile"
                        }
                        tone="warning"
                        badgeLabel="Neutral"
                      />
                    </div>

                    <div className="grid gap-2.5 xl:grid-cols-[0.92fr_1.08fr]">
                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Race control brief</div>
                            <div className="mt-1 text-sm text-[#f0f0f0]">{deferredSimulation.scenario.headline}</div>
                          </div>
                          <Badge variant="info">{deferredSimulation.event_summary.dominant_factor}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2 border-t border-[#1f1f1f] pt-3">
                          {mainTurningPoints.map((item) => (
                            <div key={item} className="flex items-start gap-2 text-[11px] leading-5 text-[#8a8a8a]">
                              <span style={{ marginTop: 4, width: 4, height: 4, borderRadius: "50%", background: "#e8002d", flexShrink: 0, display: "inline-block" }} />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Race path</div>
                            <div className="mt-1 text-sm text-[#f0f0f0]">Strategy, leverage, and late-race conditions at a glance.</div>
                          </div>
                          <Badge variant={leadDriver ? badgeVariantForConfidence(leadDriver.confidence_label) : "warning"}>
                            {leadDriver?.confidence_label ?? "Preview"}
                          </Badge>
                        </div>
                        <div className="mt-3 grid gap-y-3 border-t border-[#1f1f1f] pt-3 sm:grid-cols-2 sm:gap-x-6">
                          <InlineDataPoint label="Strategy outlook" value={deferredSimulation.scenario.strategy_outlook} />
                          <InlineDataPoint label="Pressure phase" value={eventTiming?.leverage_phase ?? deferredSimulation.scenario.event_outlook} />
                          <InlineDataPoint label="Crossover window" value={formatLapWindow(eventTiming?.weather_crossover_window_start, eventTiming?.weather_crossover_window_end)} />
                          <InlineDataPoint label="Late-race risk" value={eventTiming ? volatilityLabel(eventTiming.late_race_interruption_risk) : "Pending"} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Projected front</div>
                          <div className="mt-1 text-sm text-[#f0f0f0]">Who controls the race when the first key windows open.</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="info">{topDrivers.length} cars</Badge>
                          <DisclosureButton
                            expanded={showProjectedFrontDetail}
                            onToggle={() => setShowProjectedFrontDetail((value) => !value)}
                            label="driver detail"
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <TimingStrip drivers={topDrivers} expanded={showProjectedFrontDetail} />
                      </div>
                      <div className="mt-3 grid gap-3">
                        {stintDrivers.map((driver, index) => (
                          <StintSummaryCard
                            key={driver.driver_id}
                            driver={driver}
                            accent={index === 0 ? "default" : "info"}
                            expanded={showProjectedFrontDetail}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Race snapshot</div>
                        <Badge variant={trustSummary ? trustTierVariant(trustSummary.confidence_tier) : signalVariant(currentVolatility)}>
                          {trustSummary ? compactTrustLabel(trustSummary.confidence_tier) : volatilityLabel(currentVolatility)}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-y-3 border-t border-[#1f1f1f] pt-3 sm:grid-cols-2 xl:grid-cols-3 xl:gap-x-5">
                        <InlineDataPoint label="Lead car" value={leadDriver ? leadDriver.driver_name : "Pending"} />
                        <InlineDataPoint label="Podium lane" value={leadDriver ? formatPct(leadDriver.podium_probability) : "Pending"} />
                        <InlineDataPoint label="Confidence" value={trustSummary ? compactTrustLabel(trustSummary.confidence_tier) : "Pending"} />
                        <InlineDataPoint label="Historical support" value={trustSummary ? compactTrustLabel(trustSummary.historical_support_tier) : "Pending"} />
                        <InlineDataPoint label="Grounding" value={trustSummary ? compactTrustLabel(trustSummary.data_grounding_tier) : "Pending"} />
                        <InlineDataPoint label="Volatility" value={trustSummary ? trustSummary.volatility_tier : volatilityLabel(currentVolatility)} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionFrame>
          </motion.section>

          {deferredSimulation ? (
            <motion.section {...motionProps}>
              <SectionFrame
                eyebrow="Lap-by-lap execution"
                title="Phase detail deck"
                subtitle="Expanded phase-by-phase detail after the main board: stop mix, event timing, stint ladders, and volatility windows."
                action={
                  <div className="flex items-center gap-2">
                    <Badge variant={signalVariant(movementSummary?.race_fluidity_score ?? currentVolatility)}>
                      {movementSummary?.overtaking_intensity ?? "Preview"}
                    </Badge>
                    <DisclosureButton
                      expanded={showDeepRaceDetail}
                      onToggle={() => setShowDeepRaceDetail((value) => !value)}
                      label="phase deck"
                    />
                  </div>
                }
              >
                {showDeepRaceDetail ? (
                <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-3">
                    <RaceTimelineStrip phases={racePhases} />
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Turning points</div>
                        <div className="mt-3 grid gap-2 border-t border-[#1f1f1f] pt-3">
                          {deferredSimulation.event_summary.evolution_summary.map((item) => (
                            <div key={item} className="flex items-start gap-2 text-[11px] leading-5 text-[#8a8a8a]">
                              <span style={{ marginTop: 4, width: 4, height: 4, borderRadius: "50%", background: "#e8002d", flexShrink: 0, display: "inline-block" }} />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Stop mix</div>
                          <Badge variant="info">{formatLapWindow(strategyDiagnostics?.first_stop_window_start, strategyDiagnostics?.first_stop_window_end)}</Badge>
                        </div>
                        <div className="mt-3 grid gap-3 border-t border-[#1f1f1f] pt-3">
                          {stopMix.map((bucket) => (
                            <StopMixBar key={bucket.stops} stops={bucket.stops} share={bucket.share} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid gap-3">
                      {stintDrivers.map((driver, index) => (
                        <StintSummaryCard
                          key={driver.driver_id}
                          driver={driver}
                          accent={index === 0 ? "default" : "info"}
                        />
                      ))}
                    </div>
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#444444] letter-spacing-[0.2em]">Event timing</div>
                        <Badge variant={signalVariant(eventTiming?.safety_car_leverage_score ?? 0)}>{eventTiming?.leverage_phase ?? "Pending"}</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <MetricPanel
                          label="First stop"
                          value={formatLapValue(strategyDiagnostics?.avg_first_stop_lap)}
                          detail={`Window ${formatLapWindow(strategyDiagnostics?.first_stop_window_start, strategyDiagnostics?.first_stop_window_end)}`}
                          tone="info"
                          badgeLabel="Window"
                        />
                        <MetricPanel
                          label="Crossover"
                          value={formatLapWindow(eventTiming?.weather_crossover_window_start, eventTiming?.weather_crossover_window_end)}
                          detail={eventTiming?.average_weather_shift_lap ? `Avg shift ${formatLapValue(eventTiming.average_weather_shift_lap)}` : "Dry-stable baseline"}
                          tone="warning"
                          badgeLabel="Weather"
                        />
                        <MetricPanel
                          label="SC leverage"
                          value={eventTiming ? formatScoreOutOf100(eventTiming.safety_car_leverage_score) : "Pending"}
                          detail={eventTiming ? `${eventTiming.average_neutralized_pit_gain.toFixed(1)}s avg pit gain under SC / VSC` : "Awaiting run"}
                          tone="warning"
                          badgeLabel="Neutral"
                        />
                        <MetricPanel
                          label="Disruption"
                          value={formatLapWindow(eventTiming?.disruption_window_start, eventTiming?.disruption_window_end)}
                          detail={eventTiming?.average_disruption_lap ? `Avg event ${formatLapValue(eventTiming.average_disruption_lap)}` : "No disruption bias"}
                          tone="default"
                          badgeLabel="Risk"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                ) : (
                  <div className="rounded-[2px] border border-dashed border-[#2a2a2a] bg-[#0a0a0a] px-4 py-3 text-[11px] leading-5 text-[#8a8a8a]">
                    Open the phase deck for the full lap-by-lap breakdown: phase cards, stop mix, detailed event timing, and projected stint ladders.
                  </div>
                )}
              </SectionFrame>
            </motion.section>
          ) : null}

          {deferredSimulation ? (
            <>
              <motion.div {...motionProps}>
                <SectionFrame eyebrow="Detailed analytics" title="Race engineering deck" action={<AnalyticsTabs value={analyticsView} onChange={setAnalyticsView} />}>
                  {analyticsView === "order" ? (
                    <div className="space-y-5">
                      <div className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
                        <div className="border border-[#1f1f1f] rounded-[2px] bg-[#0f0f0f] p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Projected order</div>
                            <Badge variant="info">Top 8</Badge>
                          </div>
                          <div className="h-[330px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={positionData} layout="vertical" margin={{ left: 8, right: 8 }}>
                                <CartesianGrid horizontal={false} stroke="#1f1f1f" />
                                <XAxis type="number" tick={{ fill: "#444444", fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="name" tick={{ fill: "#f0f0f0", fontSize: 12 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                  formatter={(_, __, payload) => `P${payload?.payload?.rawExpected?.toFixed?.(1) ?? "-"}`}
                                  contentStyle={tooltipStyle}
                                />
                                <Bar dataKey="expected" radius={[0, 2, 2, 0]}>
                                  {positionData.map((entry, index) => (
                                    <Cell key={entry.name} fill={index === 0 ? "#e8002d" : index <= 2 ? "#00d2a0" : index <= 5 ? "#4fc3f7" : "#555555"} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div className="border border-[#1f1f1f] rounded-[2px] bg-[#0f0f0f] p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Top-six distribution</div>
                            <Badge variant="info">P1-P6</Badge>
                          </div>
                          <div className="h-[330px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={topDistribution}>
                                <CartesianGrid vertical={false} stroke="#1f1f1f" />
                                <XAxis dataKey="driver" tick={{ fill: "#444444", fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: "#444444", fontSize: 12 }} axisLine={false} tickLine={false} />
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
                          <div key={suggestion.driver_id} className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-sm text-[#f0f0f0]">
                                  {defaults.drivers.find((driver) => driver.id === suggestion.driver_id)?.name}
                                </div>
                                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#8a8a8a]">{suggestion.strategy_name}</div>
                              </div>
                              <Badge variant={badgeVariantForRisk(suggestion.risk_profile)}>{suggestion.risk_profile}</Badge>
                            </div>
                            <div className="mt-3 grid gap-1 text-sm leading-6 text-[#8a8a8a]">
                              {suggestion.rationale.slice(0, 2).map((reason) => (
                                <div key={reason}>{reason}</div>
                              ))}
                            </div>
                            <div className="mt-3 border-t border-[#1f1f1f] pt-3 text-[12px] leading-5 text-[#8a8a8a]">{suggestion.tradeoff}</div>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-4">
                        <div className="border border-[#1f1f1f] rounded-[2px] bg-[#0f0f0f] p-4">
                          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Constructors view</div>
                          <div className="mt-4 grid gap-3">
                            {deferredSimulation.team_summary.map((team) => (
                              <div key={team.team_id} className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm text-[#f0f0f0]">{team.team_name}</div>
                                  <div className="font-mono text-[1.45rem] leading-none text-[#f0f0f0]">P{team.avg_expected_finish.toFixed(1)}</div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-2.5">
                                    <div className="text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Points</div>
                                    <div className="mt-1 text-[#f0f0f0]">{team.expected_points.toFixed(1)}</div>
                                  </div>
                                  <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-2.5">
                                    <div className="text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Podium</div>
                                    <div className="mt-1 text-[#f0f0f0]">{formatPct(team.combined_podium_probability)}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="border border-[#1f1f1f] rounded-[2px] bg-[#0f0f0f] p-4">
                          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Engineer notes</div>
                          <div className="mt-4 grid gap-3">
                            {topDrivers.map((driver) => (
                              <div key={driver.driver_id} className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm text-[#f0f0f0]">{driver.driver_name}</div>
                                    <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#8a8a8a]">{driver.team_name}</div>
                                  </div>
                                  <div className="text-sm text-[#f0f0f0]">{formatPct(driver.win_probability)}</div>
                                </div>
                                <div className="mt-2 text-[12px] leading-5 text-[#8a8a8a]">{driver.explanation[0]}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {analyticsView === "diagnostics" ? (
                    <div className="grid gap-5 2xl:grid-cols-[0.95fr_1.05fr]">
                      <div className="border border-[#1f1f1f] rounded-[2px] bg-[#0f0f0f] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Disruption frequency</div>
                          <Badge variant={signalVariant(deferredSimulation.event_summary.volatility_index)}>
                            {deferredSimulation.event_summary.volatility_index.toFixed(2)}
                          </Badge>
                        </div>
                        <div className="h-[330px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={eventData}>
                              <CartesianGrid vertical={false} stroke="#1f1f1f" />
                              <XAxis dataKey="label" tick={{ fill: "#444444", fontSize: 12 }} axisLine={false} tickLine={false} />
                              <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: "#444444", fontSize: 12 }} axisLine={false} tickLine={false} />
                              <Tooltip formatter={(value: number) => formatPct(value)} contentStyle={tooltipStyle} />
                              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                                {eventData.map((entry) => (
                                  <Cell
                                    key={entry.label}
                                    fill={
                                      entry.label === "Red"
                                        ? "#e8002d"
                                        : entry.label === "Weather"
                                          ? "#f5a623"
                                          : entry.label === "Safety"
                                            ? "#f5a623"
                                            : entry.label === "VSC"
                                              ? "#4fc3f7"
                                              : "#444444"
                                    }
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="grid gap-4">
                        <div className="border border-[#1f1f1f] rounded-[2px] bg-[#0f0f0f] p-4">
                          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Lead diagnostics</div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <SignalMeter label="Pace edge" value={Math.min(1, Math.max(0, ((leaderDiagnostics?.pace_edge ?? 0) + 1.6) / 3.2))} secondary={compactNumber(leaderDiagnostics?.pace_edge ?? 0)} />
                            <SignalMeter label="Track fit" value={Math.min(1, Math.max(0, (leaderDiagnostics?.track_fit_score ?? 0) / 20))} secondary={compactNumber(leaderDiagnostics?.track_fit_score ?? 0)} />
                            <SignalMeter label="Strategy comp" value={Math.min(1, Math.max(0, ((leaderDiagnostics?.strategy_component ?? 0) + 6) / 12))} secondary={compactNumber(leaderDiagnostics?.strategy_component ?? 0)} />
                            <SignalMeter label="Chaos resilience" value={Math.min(1, Math.max(0, leaderDiagnostics?.chaos_resilience ?? 0))} secondary={compactNumber(leaderDiagnostics?.chaos_resilience ?? 0)} />
                          </div>
                        </div>
                        <div className="border border-[#1f1f1f] rounded-[2px] bg-[#0f0f0f] p-4">
                          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8a8a8a]">Impact summary</div>
                          <div className="mt-4 grid gap-3">
                            {deferredSimulation.event_summary.impact_summary.map((item) => (
                              <div key={item} className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-3 text-sm leading-6 text-[#8a8a8a]">
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
              <div className="rounded-[2px] border border-dashed border-[#2a2a2a] bg-[#0a0a0a] p-5 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[2px] border border-[#f5a62344] bg-[#1a1000]">
                  <AlertTriangle className="h-5 w-5 text-[#f5a623]" />
                </div>
                <div className="mt-3 text-base uppercase tracking-[0.08em] text-[#f0f0f0]">No active projection</div>
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">Run once to populate the board.</div>
              </div>
            </SectionFrame>
          )}
        </main>

        <aside className="order-2 grid gap-3 sm:grid-cols-2 xl:order-3 xl:grid-cols-1 xl:pl-1">
          {trustSummary ? (
            <TrustSummaryCard trust={trustSummary} expanded={showTrustDetail} onToggle={() => setShowTrustDetail((value) => !value)} />
          ) : null}
          <InsightCard
            title="Movement load"
            subtitle="Race fluidity and passing."
            icon={BarChart3}
            tone="default"
          >
            {movementSummary ? (
              <div className="grid gap-3">
                <SignalMeter
                  label="Fluidity"
                  value={movementSummary.race_fluidity_score}
                  secondary={movementSummary.overtaking_intensity}
                  tone={signalVariant(movementSummary.race_fluidity_score)}
                />
                <div className="grid grid-cols-2 gap-3 border-t border-[#1f1f1f] pt-3">
                  <InlineDataPoint label="Avg overtakes" value={formatAveragePerRun(movementSummary.avg_overtakes_per_simulation)} />
                  <InlineDataPoint label="Avg position changes" value={formatAveragePerDriver(movementSummary.avg_position_changes_per_driver)} align="right" />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Track traffic read</div>
                    <DisclosureButton expanded={showMovementDetail} onToggle={() => setShowMovementDetail((value) => !value)} label="more" />
                  </div>
                  <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Likely mover</div>
                        <div className="mt-1 truncate text-[13px] text-[#f0f0f0]">{biggestMovers[0]?.driver_name ?? "Pending"}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Net delta</div>
                        <div className="mt-1 text-[12px] text-[#f0f0f0]">{biggestMovers[0] ? `${formatSigned(Number(biggestMovers[0].net_position_delta.toFixed(1)))}` : "Pending"}</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Hardest to clear</div>
                        <div className="mt-1 truncate text-[13px] text-[#f0f0f0]">{hardestToPass[0]?.driver_name ?? "Pending"}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Passes faced</div>
                        <div className="mt-1 text-[12px] text-[#f0f0f0]">{hardestToPass[0] ? formatAveragePerRun(hardestToPass[0].average_overtakes) : "Pending"}</div>
                      </div>
                    </div>
                  </div>
                  {showMovementDetail ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-2.5">
                        <div className="text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Mover ladder</div>
                        <div className="mt-2 grid gap-1.5">
                          {biggestMovers.map((driver) => (
                            <div key={driver.driver_id} className="flex items-center justify-between gap-3 text-[11px] text-[#8a8a8a]">
                              <span className="truncate text-[#f0f0f0]">{driver.driver_name}</span>
                              <span>{formatSigned(Number(driver.net_position_delta.toFixed(1)))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-2.5">
                        <div className="text-[9px] uppercase tracking-[0.18em] text-[#8a8a8a]">Traffic anchors</div>
                        <div className="mt-2 grid gap-1.5">
                          {hardestToPass.map((driver) => (
                            <div key={driver.driver_id} className="flex items-center justify-between gap-3 text-[11px] text-[#8a8a8a]">
                              <span className="truncate text-[#f0f0f0]">{driver.driver_name}</span>
                              <span>{formatAveragePerRun(driver.average_overtakes)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                Run to inspect overtaking load, movers, and race fluidity.
              </div>
            )}
          </InsightCard>

          <InsightCard
            title="Event timing"
            subtitle="Race control intelligence."
            icon={ShieldAlert}
            tone="warning"
          >
            {eventTiming ? (
              <div className="grid gap-3">
                <SignalMeter
                  label="SC leverage"
                  value={eventTiming.safety_car_leverage_score}
                  secondary={eventTiming.leverage_phase}
                  tone={signalVariant(eventTiming.safety_car_leverage_score)}
                />
                <div className="grid grid-cols-2 gap-3 border-t border-[#1f1f1f] pt-3">
                  <InlineDataPoint label="Disruption window" value={formatLapWindow(eventTiming.disruption_window_start, eventTiming.disruption_window_end)} />
                  <InlineDataPoint label="Crossover window" value={formatLapWindow(eventTiming.weather_crossover_window_start, eventTiming.weather_crossover_window_end)} align="right" />
                </div>
                <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-2.5 text-[11px] leading-5 text-[#8a8a8a]">
                  Avg disruption {formatLapValue(eventTiming.average_disruption_lap)} · avg neutralized pit gain {eventTiming.average_neutralized_pit_gain.toFixed(1)}s · late-race interruption risk {formatPct(eventTiming.late_race_interruption_risk)}
                </div>
              </div>
            ) : (
              <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                Run to inspect SC leverage, disruption windows, and crossover timing.
              </div>
            )}
          </InsightCard>

          <InsightCard
            title="Circuit sensitivity"
            subtitle="Track-led levers."
            icon={Thermometer}
            tone="info"
          >
            <div className="grid gap-2">
              <SignalMeter label="Qualifying" value={activeTrack.qualifying_importance} tone="info" />
              <SignalMeter label="Track position" value={activeTrack.track_position_importance} tone="info" />
              <SignalMeter label="Energy demand" value={activeTrack.energy_sensitivity} tone={telemetryVariant(activeTrack.energy_sensitivity)} />
              <SignalMeter label="Weather swing" value={activeTrack.weather_volatility} tone="warning" />
              <SignalMeter label="SC risk" value={activeTrack.safety_car_risk} tone="warning" />
            </div>
          </InsightCard>
          <SectionFrame
            eyebrow="Engineer telemetry"
            title="Deep reads"
            subtitle="Secondary diagnostics, scenario pressure, and front-group notes."
            action={
              <DisclosureButton
                expanded={showTelemetryRail}
                onToggle={() => setShowTelemetryRail((value) => !value)}
                label="telemetry"
              />
            }
          >
            {showTelemetryRail ? (
              <div className="grid gap-3">
                <InsightCard
                  title="Scenario pressure"
                  subtitle="Current control state."
                  icon={ShieldAlert}
                  tone="warning"
                >
                  <div className="grid gap-2">
                    <SignalMeter label="Weather" value={form.environment.rain_onset} secondary={sliderLabel(form.environment.rain_onset)} tone="warning" />
                    <SignalMeter label="Race control" value={(form.environment.full_safety_cars + form.environment.virtual_safety_cars) / 2} secondary="SC / VSC" tone="warning" />
                    <SignalMeter label="Attrition" value={(form.environment.dnfs + form.environment.crashes) / 2} secondary="DNF + incident" tone="default" />
                    <SignalMeter label="Randomness" value={form.environment.randomness_intensity} secondary={volatilityLabel(form.environment.randomness_intensity)} tone={signalVariant(form.environment.randomness_intensity)} />
                  </div>
                </InsightCard>

                <InsightCard
                  title="Lead diagnostics"
                  subtitle="Why the lead car is on top."
                  icon={Zap}
                  tone="default"
                >
                  {leaderDiagnostics ? (
                    <div className="grid gap-2">
                      <SignalMeter label="Pace edge" value={Math.min(1, Math.max(0, (leaderDiagnostics.pace_edge + 1.6) / 3.2))} secondary={`${compactNumber(leaderDiagnostics.pace_edge)} delta`} tone="default" />
                      <SignalMeter label="Track fit" value={Math.min(1, Math.max(0, leaderDiagnostics.track_fit_score / 20))} secondary={`${compactNumber(leaderDiagnostics.track_fit_score)} score`} tone="info" />
                      <SignalMeter label="Strategy edge" value={Math.min(1, Math.max(0, (leaderDiagnostics.strategy_component + 6) / 12))} secondary={`${compactNumber(leaderDiagnostics.strategy_component)} score`} tone="success" />
                      <SignalMeter label="Chaos resilience" value={Math.min(1, Math.max(0, leaderDiagnostics.chaos_resilience))} secondary={`${compactNumber(leaderDiagnostics.chaos_resilience)} score`} tone="success" />
                    </div>
                  ) : (
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                      Run to inspect pace edge, track fit, strategy edge, and chaos resilience.
                    </div>
                  )}
                </InsightCard>

                <InsightCard
                  title="Track profile"
                  subtitle="Weekend metadata."
                  icon={Flag}
                  tone="info"
                >
                  <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-[#f0f0f0]">{activeTrack.name}</div>
                      {activeTrack.sprint_weekend ? <Badge variant="warning">Sprint</Badge> : <Badge variant="info">Standard</Badge>}
                    </div>
                    <div className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-[#8a8a8a]">{activeTrack.summary}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-2.5">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">Circuit</div>
                      <div className="mt-1 text-sm text-[#f0f0f0]">{activeTrack.circuit_type}</div>
                    </div>
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-2.5">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">Laps</div>
                      <div className="mt-1 text-sm text-[#f0f0f0]">{activeTrack.laps}</div>
                    </div>
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-2.5">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">Pit loss</div>
                      <div className="mt-1 text-sm text-[#f0f0f0]">{activeTrack.pit_loss_seconds.toFixed(1)}s</div>
                    </div>
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0a0a0a] p-2.5">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">Deg</div>
                      <div className="mt-1 text-sm capitalize text-[#f0f0f0]">{activeTrack.degradation_profile}</div>
                    </div>
                  </div>
                </InsightCard>

                <InsightCard
                  title="Top notes"
                  subtitle="Front group scan."
                  icon={Trophy}
                  tone="success"
                >
                  {topDrivers.length ? (
                    <div className="space-y-1.5">
                      {topDrivers.map((driver) => (
                        <div key={driver.driver_id} className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[13px] text-[#f0f0f0]">{driver.driver_name}</div>
                              <div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">{driver.team_name}</div>
                            </div>
                            <div className="text-[13px] text-[#f0f0f0]">{formatPct(driver.win_probability)}</div>
                          </div>
                          <div className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-[#8a8a8a]">{driver.explanation[0]}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[2px] border border-[#1f1f1f] bg-[#0f0f0f] p-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                      Leader notes and fit signals appear after the first run.
                    </div>
                  )}
                </InsightCard>
              </div>
            ) : (
              <div className="rounded-[2px] border border-dashed border-[#2a2a2a] bg-[#0a0a0a] px-4 py-3 text-[11px] leading-5 text-[#8a8a8a]">
                Open telemetry to inspect scenario pressure, lead diagnostics, detailed track metadata, and front-group notes.
              </div>
            )}
          </SectionFrame>
        </aside>
      </div>
      )}
    </div>
  );
}
