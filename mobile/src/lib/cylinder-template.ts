/** Cylinder line defaults from admin templates (aligned with web Orders). */

/** Auto-select this template when it exists; otherwise use no template. */
export const PREFERRED_TEMPLATE_NAME = "Gas Hoàng Ân";

const PREFERRED_TEMPLATE_KEY = PREFERRED_TEMPLATE_NAME.toLowerCase();

export type CylinderTemplateRow = {
  id: number;
  name: string;
  owner_name: string | null;
  import_source: string | null;
  inspection_expiry: string | null;
  import_date: string | null;
};

export type CylinderLineDefaults = {
  owner_name: string;
  import_source: string;
  inspection_expiry: string;
  import_date: string;
};

/** Extract kg label from product name (e.g. Gas 12kg → 12kg). */
export function cylinderTypeFromProductName(productName: string): string {
  const m = productName.match(/\d+\s*kg/gi);
  if (m) return m[0].replace(/\s+/g, "");
  return productName.trim();
}

/** Apply selected template fields to a new cart line; empty when no template is chosen. */
export function lineDefaultsFromTemplate(template: CylinderTemplateRow | null): CylinderLineDefaults {
  return {
    owner_name: template?.owner_name?.trim() ?? "",
    import_source: template?.import_source?.trim() ?? "",
    inspection_expiry: template?.inspection_expiry ?? "",
    import_date: template?.import_date ?? "",
  };
}

/** Match admin template row for the preferred template name, if configured. */
export function resolveDefaultTemplateId(templates: CylinderTemplateRow[]): string {
  const hit = templates.find(
    (t) =>
      t.name.trim().toLowerCase() === PREFERRED_TEMPLATE_KEY ||
      (t.owner_name?.trim().toLowerCase() ?? "") === PREFERRED_TEMPLATE_KEY,
  );
  return hit ? String(hit.id) : "";
}
