/** Cylinder line defaults from admin templates (aligned with web Orders). */

export const DEFAULT_OWNER = "Gas Huy Hoàng";

export type CylinderTemplateRow = {
  id: number;
  name: string;
  owner_name: string | null;
  inspection_expiry: string | null;
  import_date: string | null;
};

export type CylinderLineDefaults = {
  owner_name: string;
  inspection_expiry: string;
  import_date: string;
};

/** Extract kg label from product name (e.g. Gas 12kg → 12kg). */
export function cylinderTypeFromProductName(productName: string): string {
  const m = productName.match(/\d+\s*kg/gi);
  if (m) return m[0].replace(/\s+/g, "");
  return productName.trim();
}

/** Apply template or store default owner + dates to a new cart line. */
export function lineDefaultsFromTemplate(template: CylinderTemplateRow | null): CylinderLineDefaults {
  return {
    owner_name: template?.owner_name?.trim() || DEFAULT_OWNER,
    inspection_expiry: template?.inspection_expiry ?? "",
    import_date: template?.import_date ?? "",
  };
}

/** Offline fallback when API templates unavailable. */
export function localDefaultTemplate(): CylinderTemplateRow {
  return {
    id: 0,
    name: DEFAULT_OWNER,
    owner_name: DEFAULT_OWNER,
    inspection_expiry: null,
    import_date: null,
  };
}
