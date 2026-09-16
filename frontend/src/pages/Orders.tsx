import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { DestructiveConfirmDialog } from "@/components/DestructiveConfirmDialog";
import { DeliveryNotesPanel } from "@/components/DeliveryNotesPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Plus,
  Trash2,
  ShoppingBag,
  FileText,
  Pencil,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  MapPin,
  Navigation,
  ClipboardPaste,
} from "lucide-react";
import type { GeocodeHit } from "@/lib/geocode-map";
import { defaultOrderMapCenter, googleDirectionsUrl } from "@/lib/geocode-map";
import { OrderAddressPickMap } from "@/components/OrderAddressPickMap";
import { OrderSlip } from "@/components/order-composer/OrderSlip";
import { DeliveryMapPanel } from "@/components/DeliveryMapPanel";
import { Badge } from "@/components/ui/badge";
import { formatVND, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import {
  CUSTOMER_SEGMENT_LABEL,
  CUSTOMER_SEGMENT_OPTIONS,
  isCustomerSegment,
  phonesLikelyMatch,
  type CustomerSegment,
} from "@/lib/customer-segment";
import { unitPriceForSegment } from "@/lib/product-price";

/** ``YYYY-MM-DD`` theo giờ máy (dùng cho ``<input type="date" />``). */
function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse optional WGS84 pair for ``delivery_latitude`` / ``delivery_longitude`` API fields. */
function parseOptionalLatLng(latStr: string, lngStr: string): { delivery_latitude: number | null; delivery_longitude: number | null } {
  const t1 = latStr.trim();
  const t2 = lngStr.trim();
  if (!t1 && !t2) return { delivery_latitude: null, delivery_longitude: null };
  if (!t1 || !t2) throw new Error("GPS: cần nhập đủ vĩ độ và kinh độ, hoặc để trống cả hai");
  const la = Number(t1.replace(",", "."));
  const lo = Number(t2.replace(",", "."));
  if (!Number.isFinite(la) || !Number.isFinite(lo)) throw new Error("GPS: vĩ độ/kinh độ không hợp lệ");
  if (la < -90 || la > 90 || lo < -180 || lo > 180) throw new Error("GPS: tọa độ ngoài phạm vi cho phép");
  return { delivery_latitude: la, delivery_longitude: lo };
}

/** Làm tròn WGS84 giống bản đồ ghim (6 chữ số thập phân). */
function roundCoord6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Tọa độ gửi API: cặp ô pin hợp lệ (legacy), không thì điểm geocode/ghim trên bản đồ.
 */
function resolveDeliveryCoordsForPayload(
  pinLatStr: string,
  pinLngStr: string,
  mapPoint: { lat: number; lng: number } | null
): { delivery_latitude: number | null; delivery_longitude: number | null } {
  try {
    const p = parseOptionalLatLng(pinLatStr, pinLngStr);
    if (p.delivery_latitude != null) return p;
  } catch {
    /* Một ô điền một ô trống — bỏ qua, thử mapPoint */
  }
  if (mapPoint) {
    return { delivery_latitude: roundCoord6(mapPoint.lat), delivery_longitude: roundCoord6(mapPoint.lng) };
  }
  return { delivery_latitude: null, delivery_longitude: null };
}

/** Lấy dạng loại chai từ tên SP (vd ``Gas 12kg`` → ``12kg``). */
function cylinderTypeFromProductName(productName: string): string {
  const m = productName.match(/\d+\s*kg/gi);
  if (m) return m[0].replace(/\s+/g, "");
  return productName.trim();
}

interface ApiCylinderTemplate {
  id: number;
  name: string;
  owner_name: string | null;
  import_source: string | null;
  inspection_expiry: string | null;
  import_date: string | null;
  is_active: boolean;
}

interface Product {
  id: number;
  name: string;
  sku: string | null;
  sell_price: string | number;
  wholesale_price?: string | number;
  restaurant_price?: string | number;
  stock_quantity: number;
}

interface OrderRow {
  id: number;
  order_code: string;
  customer_name: string;
  phone: string | null;
  customer_segment?: CustomerSegment | null;
  address?: string | null;
  note?: string | null;
  delivery_date?: string | null;
  store_contact?: string | null;
  vat_rate?: number;
  payment_mode?: "cash" | "debt" | "partial";
  paid_amount?: number | string;
  outstanding_amount?: number | string;
  total: string | number;
  created_at: string;
  /** True when every line + địa chỉ/SĐT/ngày giao đủ để đưa vào sổ gas. */
  gas_ledger_ready?: boolean;
  /** Các mục còn thiếu so với sổ gas (tiếng Việt), rỗng khi đủ. */
  gas_ledger_gaps?: string[];
  assigned_to_user_id?: number | null;
  assigned_to_username?: string | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  /** Trạng thái giao: đang giao / hoàn thành (nhân viên + lịch sử). */
  delivery_status?: "in_transit" | "completed";
  /** Vỏ cho mượn / nợ vỏ (kiểm kê cuối ngày). */
  borrowed_shell_units?: number;
  order_items: {
    id?: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number | string;
    subtotal: number | string;
    owner_name?: string | null;
    cylinder_type?: string | null;
    cylinder_serial?: string | null;
    inspection_expiry?: string | null;
    import_source?: string | null;
    import_date?: string | null;
  }[];
}

interface StaffUserRow {
  id: number;
  username: string;
  role: string;
}

interface OrdersListPayload {
  items: OrderRow[];
  total: number;
}

/**
 * Tính thiếu sót sổ gas trên client (khớp logic backend) khi API chưa trả ``gas_ledger_gaps``.
 */
function computeClientGasLedgerGaps(o: OrderRow): string[] {
  const out: string[] = [];
  const items = o.order_items ?? [];
  if (items.length === 0) {
    out.push("Đơn: chưa có dòng hàng.");
    return out;
  }
  if (!o.phone?.trim()) out.push("Đơn: thiếu số điện thoại khách.");
  if (!o.address?.trim()) out.push("Đơn: thiếu địa chỉ khách.");
  if (!o.delivery_date?.trim()) out.push("Đơn: thiếu ngày giao hàng.");
  items.forEach((li, i) => {
    const idx = i + 1;
    const label = (li.product_name || "").trim() || `dòng ${idx}`;
    const miss: string[] = [];
    if (!li.owner_name?.trim()) miss.push("chủ sở hữu");
    if (!li.cylinder_type?.trim()) miss.push("loại chai");
    if (!li.inspection_expiry?.trim()) miss.push("hạn kiểm định");
    if (!li.import_source?.trim()) miss.push("nơi nhập");
    if (!li.import_date?.trim()) miss.push("ngày nhập");
    if (miss.length > 0) out.push(`Mặt hàng ${idx} (${label}): thiếu ${miss.join(", ")}.`);
  });
  return out;
}

/** Danh sách hiển thị: ưu tiên API, không thì suy ra từ dữ liệu đơn. */
function gasLedgerGapsForDisplay(o: OrderRow, gasReady: boolean): string[] {
  if (gasReady) return [];
  const fromApi = o.gas_ledger_gaps;
  if (fromApi && fromApi.length > 0) return fromApi;
  return computeClientGasLedgerGaps(o);
}

/** Cart row: allow duplicate products (multiple cylinders with different serials). */
interface CartLine {
  lineKey: string;
  product_id: number;
  name: string;
  unit_price: number;
  quantity: number;
  owner_name: string;
  cylinder_type: string;
  cylinder_serial: string;
  inspection_expiry: string;
  import_source: string;
  import_date: string;
}

const NONE_TEMPLATE = "__none__";

/** Auto-select this template when it exists; otherwise keep "Không dùng mẫu". */
const PREFERRED_TEMPLATE_NAME = "Gas Hoàng Ân";

/** Pick active template id matching the preferred template name, if any. */
function resolveDefaultTemplateId(templates: ApiCylinderTemplate[]): string | null {
  const key = PREFERRED_TEMPLATE_NAME.toLowerCase();
  const hit = templates.find(
    (t) =>
      t.name.trim().toLowerCase() === key || (t.owner_name?.trim().toLowerCase() ?? "") === key,
  );
  return hit ? String(hit.id) : null;
}

/** Chuỗi in phiếu / lưu ``store_contact`` — có thể override bằng ``VITE_DEFAULT_STORE_CONTACT``. */
const DEFAULT_STORE_CONTACT_LINE =
  typeof import.meta.env.VITE_DEFAULT_STORE_CONTACT === "string" && import.meta.env.VITE_DEFAULT_STORE_CONTACT.trim()
    ? import.meta.env.VITE_DEFAULT_STORE_CONTACT.trim()
    : "GAS Huy Hoàng - Thuận Tân, Truông Mít - 0984135227 | 0908868643";

type AdminOrdersSection = "orders" | "notes" | "map";

function initialOrdersSectionFromUrl(): AdminOrdersSection {
  if (typeof window === "undefined") return "orders";
  const t = new URLSearchParams(window.location.search).get("tab");
  if (t === "map" || t === "notes") return t;
  return "orders";
}

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams();
  /** Admin-only: đơn, ghi chú giao, hoặc bản đồ giao (``?tab=map``). */
  const [adminSection, setAdminSection] = useState<AdminOrdersSection>(initialOrdersSectionFromUrl);

  const setAdminSectionSynced = useCallback(
    (s: AdminOrdersSection) => {
      setAdminSection(s);
      if (s === "orders") {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ tab: s }, { replace: true });
      }
    },
    [setSearchParams]
  );

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "map" || t === "notes") setAdminSection(t);
    else setAdminSection("orders");
  }, [searchParams]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", note: "" });
  const [deliveryDate, setDeliveryDate] = useState("");
  const [vatRate, setVatRate] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<"cash" | "debt" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [cylinderTemplates, setCylinderTemplates] = useState<ApiCylinderTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(NONE_TEMPLATE);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pickProductId, setPickProductId] = useState<string>("");
  const [pickQty, setPickQty] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<{ id: number; order_code: string } | null>(null);
  const [deliveryStaffId, setDeliveryStaffId] = useState<string>("__none__");
  const [staffOptions, setStaffOptions] = useState<Array<{ id: number; username: string }>>([]);
  const [addrGeocodeLoading, setAddrGeocodeLoading] = useState(false);
  const [reverseGeocodeLoading, setReverseGeocodeLoading] = useState(false);
  const [addrGeocodeHits, setAddrGeocodeHits] = useState<GeocodeHit[]>([]);
  const [addrMapPoint, setAddrMapPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [addrMapLabel, setAddrMapLabel] = useState<string | null>(null);
  const [pinLatStr, setPinLatStr] = useState("");
  const [pinLngStr, setPinLngStr] = useState("");
  const [mapPasteRaw, setMapPasteRaw] = useState("");
  const [mapPasteLoading, setMapPasteLoading] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<"in_transit" | "completed">("in_transit");
  const [borrowedShellUnits, setBorrowedShellUnits] = useState(0);
  const [customerSegment, setCustomerSegment] = useState<CustomerSegment | "">("");

  useEffect(() => {
    setCart((prev) =>
      prev.map((line) => {
        const p = products.find((x) => x.id === line.product_id);
        if (!p) return line;
        return { ...line, unit_price: unitPriceForSegment(p, customerSegment || null) };
      }),
    );
  }, [customerSegment, products]);

  const load = useCallback(async () => {
    try {
      const productsPromise = apiGet<Product[]>("/api/products");
      const templatesPromise = apiGet<ApiCylinderTemplate[]>("/api/cylinder-templates");
      const usersPromise = apiGet<StaffUserRow[]>("/api/users");
      const offset = (page - 1) * pageSize;
      const qParam = searchQuery.trim() ? `&q=${encodeURIComponent(searchQuery.trim())}` : "";
      const ordersPromise = apiGet<OrdersListPayload>(`/api/orders?limit=${pageSize}&offset=${offset}${qParam}`);
      const [ordersRes, p, tpl, users] = await Promise.all([ordersPromise, productsPromise, templatesPromise, usersPromise]);
      const total = ordersRes.total ?? 0;
      const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
      if (page > maxPage && total > 0) {
        setPage(maxPage);
        return;
      }
      setOrders(ordersRes.items ?? []);
      setOrdersTotal(total);
      setProducts(p ?? []);
      const activeTemplates = tpl ?? [];
      setCylinderTemplates(activeTemplates);
      const defaultTemplateId = resolveDefaultTemplateId(activeTemplates);
      if (defaultTemplateId) {
        setSelectedTemplateId((cur) => (cur === NONE_TEMPLATE ? defaultTemplateId : cur));
      }
      setStaffOptions((users ?? []).filter((u) => u.role === "user").map((x) => ({ id: x.id, username: x.username })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu");
    }
  }, [page, pageSize, searchQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (adminSection === "notes" || adminSection === "map") {
      setOpen(false);
    }
  }, [adminSection]);

  const selectedPreset = useMemo(() => {
    if (!selectedTemplateId || selectedTemplateId === NONE_TEMPLATE) return null;
    return cylinderTemplates.find((t) => String(t.id) === selectedTemplateId) ?? null;
  }, [cylinderTemplates, selectedTemplateId]);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const vatAmount = useMemo(() => Math.round((subtotal * vatRate) / 100), [subtotal, vatRate]);
  const total = subtotal + vatAmount;
  const outstandingPreview = Math.max(
    0,
    total - (paymentMode === "cash" ? total : paymentMode === "debt" ? 0 : paidAmount)
  );

  const liveLedgerGaps = useMemo(
    () =>
      computeClientGasLedgerGaps({
        id: 0,
        order_code: "",
        customer_name: customer.name,
        phone: customer.phone,
        address: customer.address,
        delivery_date: deliveryDate,
        total: 0,
        created_at: "",
        order_items: cart.map((i) => ({
          product_id: i.product_id,
          product_name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.unit_price * i.quantity,
          owner_name: i.owner_name,
          cylinder_type: i.cylinder_type,
          inspection_expiry: i.inspection_expiry,
          import_source: i.import_source,
          import_date: i.import_date,
        })),
      }),
    [customer.name, customer.phone, customer.address, deliveryDate, cart],
  );

  const slipGoodsLabel = cart.map((i) => `${i.name} × ${i.quantity}`).join(", ");
  const paymentLabel =
    paymentMode === "cash" ? "Thanh toán đủ" : paymentMode === "partial" ? "Thu một phần" : "Ghi nợ";

  const pinAsMapPoint = useMemo(() => {
    try {
      const p = parseOptionalLatLng(pinLatStr, pinLngStr);
      if (p.delivery_latitude == null) return null;
      return { lat: p.delivery_latitude, lng: p.delivery_longitude! };
    } catch {
      return null;
    }
  }, [pinLatStr, pinLngStr]);

  /** Ưu tiên cặp pin trong state; không thì điểm geocode/ghim bản đồ. */
  const mapPickMarker = pinAsMapPoint ?? addrMapPoint;

  const onMapPickCoords = useCallback((lat: number, lng: number) => {
    setAddrMapPoint({ lat, lng });
    setPinLatStr(String(lat));
    setPinLngStr(String(lng));
    setAddrMapLabel(null);
    toast.message("Đã ghim trên bản đồ — bấm Gợi ý địa chỉ từ ghim nếu cần điền chữ vào ô địa chỉ");
  }, []);

  const qtyReservedForProduct = (productId: number, excludeLineKey?: string) =>
    cart.filter((c) => c.product_id === productId && c.lineKey !== excludeLineKey).reduce((s, c) => s + c.quantity, 0);

  const addToCart = () => {
    if (!pickProductId) return;
    const p = products.find((x) => x.id === Number(pickProductId));
    if (!p) return;
    if (pickQty < 1) return;
    const reserved = qtyReservedForProduct(p.id);
    if (editingOrderId === null && reserved + pickQty > p.stock_quantity) {
      toast.error(`Không đủ tồn kho (${p.stock_quantity - reserved} còn lại cho mặt hàng này)`);
      return;
    }
    const owner = selectedPreset?.owner_name?.trim() ?? "";
    const insp = selectedPreset?.inspection_expiry ?? "";
    const impSrc = selectedPreset?.import_source?.trim() ?? "";
    const impD = selectedPreset?.import_date ?? "";
    setCart((prev) => [
      ...prev,
      {
        lineKey: crypto.randomUUID(),
        product_id: p.id,
        name: p.name,
        unit_price: unitPriceForSegment(p, customerSegment || null),
        quantity: pickQty,
        owner_name: owner,
        cylinder_type: cylinderTypeFromProductName(p.name),
        cylinder_serial: "",
        inspection_expiry: insp,
        import_source: impSrc,
        import_date: impD,
      },
    ]);
    setPickProductId("");
    setPickQty(1);
  };

  const removeLine = (lineKey: string) => setCart((c) => c.filter((i) => i.lineKey !== lineKey));

  const updateLine = (lineKey: string, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((row) => {
        if (row.lineKey !== lineKey) return row;
        const next = { ...row, ...patch };
        if (patch.quantity !== undefined) {
          const p = products.find((x) => x.id === next.product_id);
          if (p && editingOrderId === null) {
            const reserved = qtyReservedForProduct(p.id, lineKey) + next.quantity;
            if (reserved > p.stock_quantity) {
              toast.error(`Tồn kho không đủ (tối đa ${p.stock_quantity - qtyReservedForProduct(p.id, lineKey)})`);
              return row;
            }
          }
          next.quantity = Math.max(1, next.quantity);
        }
        return next;
      })
    );
  };

  /** Clears OSM preview / geocode list tied to the order address dialog. */
  const clearAddrGeocodeUi = () => {
    setAddrGeocodeLoading(false);
    setAddrGeocodeHits([]);
    setAddrMapPoint(null);
    setAddrMapLabel(null);
  };

  const reset = () => {
    setEditingOrderId(null);
    setCustomer({ name: "", phone: "", address: "", note: "" });
    setDeliveryDate(todayLocalIso());
    setCart([]);
    setVatRate(0);
    setPaymentMode("cash");
    setPaidAmount(0);
    setPickProductId("");
    setPickQty(1);
    setSelectedTemplateId(resolveDefaultTemplateId(cylinderTemplates) ?? NONE_TEMPLATE);
    setDeliveryStaffId("__none__");
    clearAddrGeocodeUi();
    setPinLatStr("");
    setPinLngStr("");
    setMapPasteRaw("");
    setDeliveryStatus("in_transit");
    setBorrowedShellUnits(0);
    setCustomerSegment("");
  };

  const openEditOrder = async (orderId: number) => {
    clearAddrGeocodeUi();
    try {
      const o = await apiGet<OrderRow>(`/api/orders/${orderId}`);
      setEditingOrderId(o.id);
      setCustomer({
        name: o.customer_name ?? "",
        phone: o.phone ?? "",
        address: o.address ?? "",
        note: o.note ?? "",
      });
      setDeliveryDate(o.delivery_date ?? "");
      setVatRate(o.vat_rate ?? 0);
      setPaymentMode(o.payment_mode ?? "cash");
      setPaidAmount(Number(o.paid_amount ?? 0));
      setDeliveryStaffId(o.assigned_to_user_id != null ? String(o.assigned_to_user_id) : "__none__");
      setDeliveryStatus(o.delivery_status === "completed" ? "completed" : "in_transit");
      setBorrowedShellUnits(Number(o.borrowed_shell_units ?? 0));
      setCustomerSegment(isCustomerSegment(o.customer_segment) ? o.customer_segment : "");
      setPinLatStr(
        o.delivery_latitude != null && Number.isFinite(Number(o.delivery_latitude)) ? String(o.delivery_latitude) : ""
      );
      setPinLngStr(
        o.delivery_longitude != null && Number.isFinite(Number(o.delivery_longitude)) ? String(o.delivery_longitude) : ""
      );
      setCart(
        (o.order_items ?? []).map((li) => ({
          lineKey: crypto.randomUUID(),
          product_id: li.product_id,
          name: li.product_name,
          unit_price: Number(li.unit_price),
          quantity: li.quantity,
          owner_name: li.owner_name ?? "",
          cylinder_type: li.cylinder_type ?? cylinderTypeFromProductName(li.product_name),
          cylinder_serial: li.cylinder_serial ?? "",
          inspection_expiry: li.inspection_expiry ?? "",
          import_source: li.import_source ?? "",
          import_date: li.import_date ?? "",
        }))
      );
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được đơn hàng");
    }
  };

  /** Geocode the current address line (Nominatim via ``/api/geocode``) and show OSM preview. */
  const searchAddressOnMap = async () => {
    const q = customer.address.trim();
    if (q.length < 2) {
      toast.error("Nhập ít nhất 2 ký tự địa chỉ để tìm (số nhà, đường, phường…)");
      return;
    }
    setAddrGeocodeLoading(true);
    setAddrGeocodeHits([]);
    setAddrMapPoint(null);
    setAddrMapLabel(null);
    try {
      const res = await apiGet<{ items: GeocodeHit[] }>(`/api/geocode?q=${encodeURIComponent(q)}&limit=8`);
      const items = res.items ?? [];
      setAddrGeocodeHits(items);
      if (items.length === 0) {
        toast.message("Không tìm thấy — chỉnh địa chỉ rồi tìm lại");
      } else {
        const first = items[0];
        setAddrMapPoint({ lat: first.lat, lng: first.lng });
        setAddrMapLabel(first.display_name);
        const la = roundCoord6(first.lat);
        const lo = roundCoord6(first.lng);
        setPinLatStr(String(la));
        setPinLngStr(String(lo));
        if (items.length > 1) toast.message("Nhiều kết quả — chọn dòng đúng bên dưới");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Geocode thất bại");
    }
    setAddrGeocodeLoading(false);
  };

  const pickAddrGeocodeHit = (h: GeocodeHit) => {
    setAddrMapPoint({ lat: h.lat, lng: h.lng });
    setAddrMapLabel(h.display_name);
    const la = roundCoord6(h.lat);
    const lo = roundCoord6(h.lng);
    setPinLatStr(String(la));
    setPinLngStr(String(lo));
  };

  /** Copy the pinned geocode label into the editable address field. */
  const applyPinnedAddressToField = () => {
    const label = addrMapLabel?.trim();
    if (!label) {
      toast.error("Chưa có điểm ghim — bấm Tìm trên bản đồ và chọn một dòng");
      return;
    }
    setCustomer((c) => ({ ...c, address: label }));
    toast.success("Đã cập nhật ô địa chỉ");
  };

  /** Reverse-geocode điểm đang ghim (bản đồ hoặc kết quả tìm) để điền ô địa chỉ chữ. */
  /** Parse pasted Plus Code / Maps link / DMS / decimals via API, then sync map + address field. */
  const applyMapPasteToOrderLocation = async () => {
    const raw = mapPasteRaw.trim();
    if (raw.length < 2) {
      toast.error("Dán ít nhất 2 ký tự (link, Plus Code, hoặc tọa độ)");
      return;
    }
    setMapPasteLoading(true);
    try {
      const hit = await apiPost<GeocodeHit>("/api/geocode/from-paste", { raw });
      setAddrMapPoint({ lat: hit.lat, lng: hit.lng });
      setAddrMapLabel(hit.display_name);
      setAddrGeocodeHits([]);
      setPinLatStr(String(roundCoord6(hit.lat)));
      setPinLngStr(String(roundCoord6(hit.lng)));
      setCustomer((c) => ({ ...c, address: hit.display_name }));
      setMapPasteRaw("");
      toast.success("Đã áp dụng vị trí từ nội dung dán");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xử lý được nội dung dán");
    } finally {
      setMapPasteLoading(false);
    }
  };

  const reversePinToAddress = async () => {
    const pt = pinAsMapPoint ?? addrMapPoint;
    if (!pt) {
      toast.error("Ghim trên bản đồ hoặc bấm Tìm trên bản đồ rồi chọn một dòng trước");
      return;
    }
    const la = roundCoord6(pt.lat);
    const lo = roundCoord6(pt.lng);
    setReverseGeocodeLoading(true);
    try {
      const hit = await apiGet<GeocodeHit>(`/api/geocode/reverse?lat=${encodeURIComponent(String(la))}&lng=${encodeURIComponent(String(lo))}`);
      setAddrMapPoint({ lat: hit.lat, lng: hit.lng });
      setAddrMapLabel(hit.display_name);
      setAddrGeocodeHits([]);
      setPinLatStr(String(roundCoord6(hit.lat)));
      setPinLngStr(String(roundCoord6(hit.lng)));
      setCustomer((c) => ({ ...c, address: hit.display_name }));
      toast.success("Đã cập nhật địa chỉ theo reverse OSM (có thể sửa tay)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reverse thất bại");
    } finally {
      setReverseGeocodeLoading(false);
    }
  };

  const performDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      await apiDelete(`/api/orders/${orderToDelete.id}`);
      toast.success("Đã xóa đơn hàng");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
      throw e;
    }
  };

  /** Prefill segment from the newest other order on the same phone when the field is still empty. */
  const prefillsSegmentFromPhone = async () => {
    const phone = customer.phone.trim();
    if (!phone || customerSegment) return;
    try {
      const res = await apiGet<OrdersListPayload>(`/api/orders?q=${encodeURIComponent(phone)}&limit=10&offset=0`);
      const match = (res.items ?? []).find(
        (o) =>
          o.id !== editingOrderId &&
          phonesLikelyMatch(o.phone, phone) &&
          isCustomerSegment(o.customer_segment),
      );
      if (match && isCustomerSegment(match.customer_segment)) {
        setCustomerSegment(match.customer_segment);
      }
    } catch {
      /* lookup is optional; submit still requires an explicit pick */
    }
  };

  const submit = async () => {
    if (!customer.name.trim()) {
      toast.error("Vui lòng nhập tên khách hàng");
      return;
    }
    if (cart.length === 0) {
      toast.error("Vui lòng thêm ít nhất 1 sản phẩm");
      return;
    }
    if (!customer.phone.trim()) {
      toast.error("Vui lòng nhập số điện thoại khách");
      return;
    }
    if (!isCustomerSegment(customerSegment)) {
      toast.error("Vui lòng chọn tệp khách hàng");
      return;
    }
    setSaving(true);
    try {
      const { delivery_latitude, delivery_longitude } = resolveDeliveryCoordsForPayload(pinLatStr, pinLngStr, addrMapPoint);
      const paidForPayload = paymentMode === "cash" ? total : paymentMode === "debt" ? 0 : Math.max(0, paidAmount);
      const payload = {
        customer_name: customer.name.trim(),
        phone: customer.phone.trim(),
        address: customer.address.trim() || null,
        note: customer.note.trim() || null,
        delivery_date: deliveryDate || null,
        store_contact: DEFAULT_STORE_CONTACT_LINE,
        vat_rate: vatRate,
        payment_mode: paymentMode,
        paid_amount: paidForPayload,
        assigned_to_user_id: deliveryStaffId === "__none__" ? null : Number(deliveryStaffId),
        delivery_latitude,
        delivery_longitude,
        delivery_status: deliveryStatus,
        borrowed_shell_units: borrowedShellUnits,
        customer_segment: customerSegment,
        lines: cart.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          owner_name: i.owner_name.trim() || null,
          cylinder_type: i.cylinder_type.trim() || null,
          cylinder_serial: i.cylinder_serial.trim() || null,
          inspection_expiry: i.inspection_expiry || null,
          import_source: i.import_source.trim() || null,
          import_date: i.import_date || null,
        })),
      };
      if (editingOrderId === null) {
        await apiPost<OrderRow>("/api/orders", payload);
        toast.success("Đã tạo đơn hàng");
        setPage(1);
      } else {
        await apiPatch<OrderRow>(`/api/orders/${editingOrderId}`, payload);
        toast.success("Đã cập nhật đơn hàng");
      }
      reset();
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
    setSaving(false);
  };

  return (
    <AppLayout
      title={
        adminSection === "notes"
          ? "Ghi chú giao hàng"
          : adminSection === "map"
            ? "Đơn hàng — Bản đồ giao"
            : "Đơn hàng"
      }
      description={
        adminSection === "notes"
          ? "Ghi chữ hoặc ghi âm — cùng trang với đơn hàng."
          : adminSection === "map"
            ? "Chọn đơn để xem OSM và mở Google Maps chỉ đường (tối đa 50 đơn mới nhất)."
            : `${ordersTotal.toLocaleString("vi-VN")} đơn — gán nhân viên giao khi tạo/sửa`
      }
      actions={
        adminSection === "orders" ? (
          <Button
            onClick={() => {
              reset();
              setOpen(true);
            }}
            className="gap-1"
          >
            <Plus className="h-4 w-4" /> Tạo đơn hàng
          </Button>
        ) : null
      }
    >
      <DestructiveConfirmDialog
        open={orderToDelete !== null}
        onOpenChange={(v) => {
          if (!v) setOrderToDelete(null);
        }}
        title="Xóa đơn hàng?"
        description={
          orderToDelete
            ? `Đơn ${orderToDelete.order_code} sẽ bị xóa và tồn kho được hoàn lại. Thao tác này không hoàn tác.`
            : ""
        }
        onConfirm={performDeleteOrder}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={adminSection === "orders" ? "default" : "outline"}
          className="min-h-11"
          onClick={() => setAdminSectionSynced("orders")}
        >
          Danh sách đơn
        </Button>
        <Button
          type="button"
          variant={adminSection === "notes" ? "default" : "outline"}
          className="min-h-11"
          onClick={() => setAdminSectionSynced("notes")}
        >
          Ghi chú giao hàng
        </Button>
        <Button
          type="button"
          variant={adminSection === "map" ? "default" : "outline"}
          className="min-h-11"
          onClick={() => setAdminSectionSynced("map")}
        >
          Bản đồ giao
        </Button>
      </div>

      {adminSection === "map" && <DeliveryMapPanel />}

      {adminSection === "notes" && (
        <div className="mb-6">
          <DeliveryNotesPanel compact />
        </div>
      )}

      {adminSection === "orders" && (
        <>
        <Card className="mb-4 p-3 shadow-card">
          <div className="grid gap-1.5">
            <Label htmlFor="orders-search">Tìm theo mã đơn / khách / SĐT</Label>
            <Input
              id="orders-search"
              className="min-h-11"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Ví dụ: DH- hoặc 0909..."
            />
          </div>
        </Card>
        <Card className="shadow-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[11rem] whitespace-normal">Mã đơn / sổ gas</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Nhân viên giao</TableHead>
                  <TableHead>Trạng thái giao</TableHead>
                  <TableHead>SP</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead className="min-w-[260px] text-center">Phiếu, xuất &amp; CRUD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <ShoppingBag className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {searchQuery.trim() ? "Không tìm thấy đơn phù hợp." : "Chưa có đơn hàng nào."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((o) => {
                    const gasReady = o.gas_ledger_ready === true;
                    const gasGaps = gasLedgerGapsForDisplay(o, gasReady);
                    const gapsId = `order-${o.id}-gas-gaps`;
                    return (
                    <Fragment key={o.id}>
                    <TableRow
                      className={
                        gasReady
                          ? "border-l-4 border-l-emerald-600 bg-emerald-50/90 dark:border-l-emerald-500 dark:bg-emerald-950/30"
                          : "border-l-4 border-l-amber-600 bg-amber-50/90 dark:border-l-amber-500 dark:bg-amber-950/35"
                      }
                      aria-label={
                        gasReady
                          ? `Đơn ${o.order_code}: đủ hồ sơ sổ gas`
                          : `Đơn ${o.order_code}: thiếu thông tin sổ gas — xem hàng chi tiết ngay bên dưới`
                      }
                      aria-describedby={!gasReady ? gapsId : undefined}
                    >
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
                          <span className="font-mono text-xs leading-normal">{o.order_code}</span>
                          {gasReady ? (
                            <Badge
                              variant="outline"
                              className="w-fit shrink-0 gap-1 border-emerald-700 text-emerald-950 dark:border-emerald-400 dark:text-emerald-50"
                            >
                              <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Đủ sổ gas
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="w-fit shrink-0 gap-1 border-amber-800 text-amber-950 dark:border-amber-400 dark:text-amber-50"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Thiếu sổ gas
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{o.customer_name}</div>
                        {o.phone && <div className="text-xs text-muted-foreground">{o.phone}</div>}
                        <Badge variant="outline" className="mt-1 w-fit text-xs">
                          {isCustomerSegment(o.customer_segment)
                            ? CUSTOMER_SEGMENT_LABEL[o.customer_segment]
                            : CUSTOMER_SEGMENT_LABEL.unspecified}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {o.assigned_to_username ?? "—"}
                      </TableCell>
                      <TableCell>
                        {o.delivery_status === "completed" ? (
                          <Badge variant="outline" className="text-xs">
                            Hoàn thành
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Đang giao
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{o.order_items?.length ?? 0} mặt hàng</TableCell>
                      <TableCell className="text-right font-semibold">{formatVND(o.total)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          <Button variant="outline" size="sm" className="gap-1" asChild>
                            <Link to={`/don-hang/phieu/${o.id}`} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-3.5 w-3.5" /> In
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => void openEditOrder(o.id)}>
                            <Pencil className="h-3.5 w-3.5" /> Sửa
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setOrderToDelete({ id: o.id, order_code: o.order_code })}
                            aria-label={`Xóa đơn ${o.order_code}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {!gasReady && (
                      <TableRow
                        className="border-l-4 border-l-amber-600 bg-amber-50/90 dark:border-l-amber-500 dark:bg-amber-950/35"
                        aria-label={`Chi tiết thiếu sót sổ gas cho đơn ${o.order_code}`}
                      >
                        <TableCell colSpan={8} className="py-3">
                          <div
                            id={gapsId}
                            className="rounded-md border border-amber-800/40 bg-card px-3 py-2 shadow-sm dark:border-amber-400/40"
                          >
                            <p className="mb-1.5 text-sm font-semibold text-foreground">Cần bổ sung cho sổ gas</p>
                            {gasGaps.length > 0 ? (
                              <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed text-foreground">
                                {gasGaps.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground">Mở Sửa để kiểm tra các trường sổ gas.</p>
                            )}
                            <p className="mt-2 text-xs text-muted-foreground">Bấm Sửa trên đơn này để điền đủ rồi lưu — dòng sẽ tự đủ điều kiện xuất sổ gas.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {ordersTotal === 0
                ? "Không có đơn."
                : `Hiển thị ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, ordersTotal)} / ${ordersTotal.toLocaleString("vi-VN")} đơn`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="orders-page-size" className="text-sm whitespace-nowrap">
                Số đơn / trang
              </Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger id="orders-page-size" className="h-11 w-[100px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 min-w-[88px]"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 min-w-[88px]"
                  disabled={page * pageSize >= ordersTotal}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="flex h-[min(90vh,920px)] w-[min(1100px,calc(100vw-2rem))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:rounded-lg">
          <DialogHeader className="shrink-0 space-y-0 border-b px-5 py-4 pr-12 text-left">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle>{editingOrderId === null ? "Tạo đơn hàng" : "Cập nhật đơn hàng"}</DialogTitle>
              <span
                className={`inline-block rotate-[-2deg] border-2 px-2 py-0.5 text-[11px] font-bold ${
                  liveLedgerGaps.length === 0 ? "border-[#2c8a58] text-[#2c8a58]" : "border-[#e3940f] text-[#e3940f]"
                }`}
              >
                {liveLedgerGaps.length === 0 ? "Đủ sổ gas" : "Thiếu sổ gas"}
              </span>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
            <div className="min-h-0 space-y-4 overflow-y-auto border-b p-4 lg:border-b-0 lg:border-r">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Tên khách</Label>
                  <Input
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    placeholder="Chị Lan"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Số điện thoại</Label>
                  <Input
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    onBlur={() => void prefillsSegmentFromPhone()}
                    placeholder="0909 123 456"
                    inputMode="tel"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Tệp khách hàng</Label>
                <div className="flex flex-wrap gap-2">
                  {CUSTOMER_SEGMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`min-h-10 rounded-full border px-3.5 text-sm ${
                        customerSegment === opt.value
                          ? "border-primary bg-accent font-semibold text-accent-foreground"
                          : "border-input bg-background hover:bg-muted"
                      }`}
                      onClick={() => setCustomerSegment(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Giá bán lấy theo tệp này. SĐT cũ sẽ gợi ý tệp đã lưu.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Ngày giao chai</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      className="min-h-11 min-w-0 flex-1"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                    <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0" onClick={() => setDeliveryDate(todayLocalIso())}>
                      Hôm nay
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Nhân viên giao</Label>
                  <Select value={deliveryStaffId} onValueChange={setDeliveryStaffId}>
                    <SelectTrigger className="min-h-11 bg-background">
                      <SelectValue placeholder="Chưa gán" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Chưa gán —</SelectItem>
                      {staffOptions.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Trạng thái giao</Label>
                  <Select value={deliveryStatus} onValueChange={(v) => setDeliveryStatus(v as "in_transit" | "completed")}>
                    <SelectTrigger className="min-h-11 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_transit">Đang giao</SelectItem>
                      <SelectItem value="completed">Hoàn thành</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Vỏ cho mượn</Label>
                  <Input
                    type="number"
                    min={0}
                    className="min-h-11"
                    value={borrowedShellUnits}
                    onChange={(e) => setBorrowedShellUnits(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Địa chỉ giao</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-h-11 min-w-[200px] flex-1"
                    value={customer.address}
                    onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                    placeholder="Số nhà, hẻm, phường…"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 shrink-0 gap-1"
                    disabled={addrGeocodeLoading}
                    onClick={() => void searchAddressOnMap()}
                  >
                    <MapPin className="h-4 w-4" aria-hidden />
                    {addrGeocodeLoading ? "Đang tìm…" : "Tìm trên bản đồ"}
                  </Button>
                  {addrMapPoint && (
                    <Button type="button" variant="secondary" className="min-h-11 shrink-0 gap-1" asChild>
                      <a href={googleDirectionsUrl(addrMapLabel ?? `${addrMapPoint.lat},${addrMapPoint.lng}`)} target="_blank" rel="noreferrer">
                        <Navigation className="h-4 w-4" aria-hidden />
                        Chỉ đường
                      </a>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="default"
                    className="min-h-11 shrink-0"
                    disabled={!addrMapLabel?.trim()}
                    onClick={applyPinnedAddressToField}
                  >
                    Dùng làm địa chỉ
                  </Button>
                </div>
                <div className="grid gap-1.5 rounded-md border border-dashed bg-background/80 p-2">
                  <Label className="text-xs font-medium text-muted-foreground">Dán từ Google Maps</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="min-h-11 min-w-[200px] flex-1 text-sm"
                      value={mapPasteRaw}
                      onChange={(e) => setMapPasteRaw(e.target.value)}
                      placeholder="maps.app.goo.gl / Plus Code / tọa độ"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 shrink-0 gap-1"
                      disabled={mapPasteLoading}
                      onClick={() => void applyMapPasteToOrderLocation()}
                    >
                      <ClipboardPaste className="h-4 w-4" aria-hidden />
                      {mapPasteLoading ? "Đang xử lý…" : "Áp dụng vị trí"}
                    </Button>
                  </div>
                </div>
                <Collapsible className="group rounded-md border border-dashed bg-muted/20 px-2 py-1">
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-9 w-full justify-between gap-2 px-2 text-xs text-muted-foreground hover:text-foreground">
                      Hẻm nhỏ không ra chữ — ghim tay rồi gợi ý địa chỉ
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1.5 pb-2 pt-1 text-xs text-muted-foreground">
                    <p>
                      Tìm kiếm dùng OpenStreetMap. Ở hẻm nhỏ, tìm chữ đôi khi không ra — vẫn ghim đúng chỗ rồi tra ngược địa chỉ.
                    </p>
                    <p>
                      Nếu có nhiều kết quả: chọn một dòng, rồi bấm Dùng làm địa chỉ.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
                {addrGeocodeHits.length > 0 && (
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-background p-2 text-xs">
                    {addrGeocodeHits.map((h) => (
                      <li key={h.place_id}>
                        <button
                          type="button"
                          className={`min-h-11 w-full rounded-md px-3 py-2 text-left outline-none ring-offset-background hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            addrMapPoint && addrMapPoint.lat === h.lat && addrMapPoint.lng === h.lng ? "bg-muted font-medium" : ""
                          }`}
                          onClick={() => pickAddrGeocodeHit(h)}
                        >
                          {h.display_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {addrMapLabel && (
                  <p className="text-xs text-muted-foreground">
                    Đang ghim: <span className="text-foreground">{addrMapLabel}</span>
                  </p>
                )}
                <OrderAddressPickMap
                  className="overflow-hidden rounded-md border"
                  visible={open}
                  marker={mapPickMarker}
                  fallbackCenter={defaultOrderMapCenter()}
                  onPick={onMapPickCoords}
                  compact
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    disabled={reverseGeocodeLoading || !mapPickMarker}
                    onClick={() => void reversePinToAddress()}
                  >
                    {reverseGeocodeLoading ? "Đang tra…" : "Gợi ý địa chỉ từ ghim"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={!mapPickMarker}
                    onClick={() => {
                      setPinLatStr("");
                      setPinLngStr("");
                      setAddrMapPoint(null);
                      setAddrMapLabel(null);
                      toast.message("Đã xóa ghim trên bản đồ");
                    }}
                  >
                    Xóa ghim
                  </Button>
                </div>
              </div>
            </div>

            <div className="min-h-0 space-y-4 overflow-y-auto p-4">
              <OrderSlip
                customerName={customer.name}
                phone={customer.phone}
                segmentLabel={isCustomerSegment(customerSegment) ? CUSTOMER_SEGMENT_LABEL[customerSegment] : ""}
                address={customer.address}
                deliveryDate={deliveryDate}
                goodsLabel={slipGoodsLabel}
                paymentLabel={paymentLabel}
                total={total}
                ready={liveLedgerGaps.length === 0}
              />

              <div className="grid gap-2">
                <Label>Mẫu thông tin chai</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="min-h-11 w-full bg-background">
                    <SelectValue placeholder="Không dùng mẫu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_TEMPLATE}>Không dùng mẫu</SelectItem>
                    {cylinderTemplates.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cylinderTemplates.length === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">Chưa có mẫu hoạt động — tạo mẫu trong &quot;Mẫu thông tin chai&quot;.</p>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                <Select value={pickProductId} onValueChange={setPickProductId}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue placeholder="Chọn sản phẩm..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.length === 0 && (
                      <div className="px-2 py-3 text-sm text-muted-foreground">Chưa có sản phẩm trong kho</div>
                    )}
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)} disabled={p.stock_quantity === 0}>
                        {p.name} — {formatVND(unitPriceForSegment(p, customerSegment || null))} {p.stock_quantity === 0 ? "(hết)" : `(còn ${p.stock_quantity})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} className="min-h-11" value={pickQty} onChange={(e) => setPickQty(Math.max(1, Number(e.target.value)))} />
                <Button type="button" className="min-h-11" onClick={addToCart}>
                  Thêm
                </Button>
              </div>

              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có chai. Chọn sản phẩm rồi bấm Thêm.</p>
              ) : (
                <div className="space-y-3">
                  {cart.map((i) => (
                    <div key={i.lineKey} className="rounded-lg border">
                      <div className="flex flex-wrap items-end gap-2 p-3">
                        <div className="min-w-[140px] flex-1">
                          <p className="text-sm font-medium">{i.name}</p>
                          <p className="text-xs text-muted-foreground">{formatVND(i.unit_price)} / bình</p>
                        </div>
                        <Input
                          className="h-9 w-20"
                          type="number"
                          min={1}
                          value={i.quantity}
                          onChange={(e) => updateLine(i.lineKey, { quantity: Number(e.target.value) })}
                          aria-label={`Số lượng ${i.name}`}
                        />
                        <div className="ml-auto font-medium">{formatVND(i.unit_price * i.quantity)}</div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i.lineKey)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <details className="rounded-lg border bg-muted/20 px-3 py-2" open={liveLedgerGaps.length > 0}>
                    <summary className="cursor-pointer py-1 font-semibold">Chi tiết sổ gas trên từng chai</summary>
                    <div className="mt-2 space-y-3">
                      {cart.map((i) => (
                        <div key={`${i.lineKey}-meta`} className="grid gap-2 sm:grid-cols-2">
                          <p className="sm:col-span-2 text-sm font-medium">{i.name}</p>
                          <div className="grid gap-1">
                            <Label className="text-xs">Chủ sở hữu</Label>
                            <Input
                              value={i.owner_name}
                              onChange={(e) => updateLine(i.lineKey, { owner_name: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Loại chai</Label>
                            <Input
                              value={i.cylinder_type}
                              onChange={(e) => updateLine(i.lineKey, { cylinder_type: e.target.value })}
                              placeholder="Tự điền từ tên SP"
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Số seri (tuỳ chọn)</Label>
                            <Input
                              value={i.cylinder_serial}
                              onChange={(e) => updateLine(i.lineKey, { cylinder_serial: e.target.value })}
                              placeholder="Không bắt buộc"
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Hạn kiểm định</Label>
                            <Input
                              type="date"
                              value={i.inspection_expiry}
                              onChange={(e) => updateLine(i.lineKey, { inspection_expiry: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-1 sm:col-span-2">
                            <Label className="text-xs">Nơi nhập chai chứa cho cửa hàng</Label>
                            <Input
                              value={i.import_source}
                              onChange={(e) => updateLine(i.lineKey, { import_source: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Ngày nhập</Label>
                            <Input
                              type="date"
                              value={i.import_date}
                              onChange={(e) => updateLine(i.lineKey, { import_date: e.target.value })}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              <div className="grid gap-1.5">
                <Label>Hình thức thu</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["cash", "Thanh toán đủ"],
                      ["partial", "Thu một phần"],
                      ["debt", "Ghi nợ"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={`min-h-10 rounded-full border px-3.5 text-sm ${
                        paymentMode === mode
                          ? "border-primary bg-accent font-semibold text-accent-foreground"
                          : "border-input bg-background hover:bg-muted"
                      }`}
                      onClick={() => setPaymentMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {paymentMode === "partial" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Đã thu trước (₫)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value || 0)))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Công nợ dự kiến (₫)</Label>
                    <Input readOnly value={String(outstandingPreview)} />
                  </div>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>Ghi chú giao</Label>
                <Textarea rows={2} value={customer.note} onChange={(e) => setCustomer({ ...customer, note: e.target.value })} placeholder="Gọi trước 10 phút, để cổng hẻm" />
              </div>
              <div className="grid gap-1.5">
                <Label>Thuế GTGT (%)</Label>
                <Input type="number" min={0} value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <DialogFooter className="relative z-10 shrink-0 gap-3 border-t bg-background px-5 py-3 sm:justify-between">
            <div className="grid text-left">
              <span className="text-xs text-muted-foreground">Tổng trên phiếu</span>
              <strong className="text-lg tabular-nums">{formatVND(total)}</strong>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Hủy
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? "Đang lưu..." : editingOrderId === null ? "Tạo đơn" : "Cập nhật"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
        </Dialog>
        </>
      )}
    </AppLayout>
  );
}
