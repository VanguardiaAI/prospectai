// --- Lead country detection from phone prefix ---

export function detectCountryFromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[\s\-().]/g, "");
  // Map of phone prefixes to country codes (longest prefix first to avoid false matches)
  const prefixes: [string, string][] = [
    ["+521", "MX"], // Mexico mobile
    ["+52", "MX"],
    ["0052", "MX"],
    ["+54", "AR"],
    ["0054", "AR"],
    ["+56", "CL"],
    ["0056", "CL"],
    ["+57", "CO"],
    ["0057", "CO"],
    ["+51", "PE"],
    ["0051", "PE"],
    ["+593", "EC"],
    ["00593", "EC"],
    ["+598", "UY"],
    ["00598", "UY"],
    ["+34", "ES"],
    ["0034", "ES"],
    ["+1", "US"], // US/Canada
    ["001", "US"],
    ["+44", "UK"],
    ["0044", "UK"],
    ["+61", "AU"],
    ["0061", "AU"],
    ["+55", "BR"],
    ["0055", "BR"],
    ["+351", "PT"],
    ["00351", "PT"],
    ["+33", "FR"],
    ["0033", "FR"],
    ["+49", "DE"],
    ["0049", "DE"],
    ["+39", "IT"],
    ["0039", "IT"],
    ["+31", "NL"],
    ["0031", "NL"],
  ];
  for (const [prefix, country] of prefixes) {
    if (clean.startsWith(prefix)) return country;
  }
  return null;
}
