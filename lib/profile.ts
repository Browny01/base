// Who is using Base, as set during onboarding. Kept tiny and free of secrets:
// the display name, the timezone that "today" is measured in, and the marker
// that says onboarding already ran.

export interface UserProfile {
  name: string;
  timezone: string;              // IANA id, e.g. "Europe/London"
  timezoneOffsetMinutes: number; // fallback for places Intl can't format
  onboardedAt?: string;          // ISO — absent means onboarding still due
}

export const DEFAULT_PROFILE: UserProfile = {
  name: "",
  timezone: "UTC",
  timezoneOffsetMinutes: 0,
};

export const needsOnboarding = (profile?: Partial<UserProfile>): boolean => !profile?.onboardedAt;

// First name only: "Lucas Brown" greets as "Lucas", and the avatar shows one
// letter.
export function firstName(profile?: Partial<UserProfile>): string {
  return (profile?.name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function initialOf(profile?: Partial<UserProfile>): string {
  const name = firstName(profile);
  return name ? name[0].toUpperCase() : "?";
}

// "Good morning" without a trailing name when the profile has none, so a fresh
// install never greets a stranger by someone else's name.
export function greeting(date = new Date(), timezone = "UTC"): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone })
      .format(date),
  );
  if (Number.isNaN(hour)) return "Hello";
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function greetingFor(profile?: Partial<UserProfile>, date = new Date()): string {
  return greeting(date, profile?.timezone || "UTC");
}

export function offsetMinutes(timezone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!match) return 0;
    const sign = match[1] === "-" ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
  } catch {
    return 0;
  }
}

// A short, readable picker. Intl's full zone list is long and mostly places
// nobody's day starts in, so the common ones come first.
export const COMMON_TIMEZONES = [
  "Pacific/Auckland",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Adelaide",
  "Australia/Perth",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Warsaw",
  "Europe/Kyiv",
  "Europe/Istanbul",
  "Europe/Athens",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Mexico_City",
  "Pacific/Honolulu",
  "UTC",
];

function regionOf(timezone: string): string {
  return timezone.includes("/") ? timezone.split("/")[0].replace(/_/g, " ") : "Other";
}

function cityOf(timezone: string): string {
  const tail = timezone.split("/")[1];
  return (tail ?? timezone).replace(/_/g, " ");
}

export interface TimeZoneOption {
  value: string;
  label: string;
  region: string;
}

export function timeZoneOptions(current?: string): TimeZoneOption[] {
  let all: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supported === "function") all = supported("timeZone");
  } catch {
    all = [];
  }
  if (!all.length) all = COMMON_TIMEZONES;

  const seen = new Set<string>();
  const options: TimeZoneOption[] = [];
  for (const zone of [...COMMON_TIMEZONES, ...all, ...(current ? [current] : [])]) {
    if (seen.has(zone)) continue;
    seen.add(zone);
    options.push({ value: zone, label: `${cityOf(zone)}, ${regionOf(zone)}`, region: regionOf(zone) });
  }
  return options;
}

export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}