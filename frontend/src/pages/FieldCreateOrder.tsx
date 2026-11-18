import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { OrderAddressPickMap } from "@/components/OrderAddressPickMap";
import { OrderSlip } from "@/components/order-composer/OrderSlip";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CUSTOMER_SEGMENT_LABEL, CUSTOMER_SEGMENT_OPTIONS, isCustomerSegment, type CustomerSegment } from "@/lib/customer-segment";
import type { CustomerDetailResponse, CustomerResponse } from "@/lib/customer";
import { defaultOrderMapCenter, deliveryDestination, openGoogleMapsDirections, type GeocodeHit } from "@/lib/geocode-map";
import { formatVND } from "@/lib/format";
import { unitPriceForSegment } from "@/lib/product-price";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

/** ``YYYY-MM-DD`` theo giờ máy (dùng cho ``<input type="date" />``). */
function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Chuỗi in phiếu / lưu ``store_contact`` — có thể override bằng ``VITE_DEFAULT_STORE_CONTACT``. */
const DEFAULT_STORE_CONTACT_LINE =
  typeof import.meta.env.VITE_DEFAULT_STORE_CONTACT === "string" && import.meta.env.VITE_DEFAULT_STORE_CONTACT.trim()
    ? import.meta.env.VITE_DEFAULT_STORE_CONTACT.trim()
    : "GAS Huy Hoàng - Thuận Tân, Truông Mít - 0984135227 | 0908868643";

const STEP_LABELS = ["Khách", "Điểm", "Chai", "Thu"] as const;

type Step = 0 | 1 | 2 | 3;
type PaymentMode = "cash" | "partial" | "debt";

interface Product {
  id: number;
  name: string;
  sell_price: number | string;
  wholesale_price?: number | string;
  restaurant_price?: number | string;
  stock_quantity: number;
}

interface CylinderTemplate {
  id: number;
  name: string;
  owner_name: string | null;
  import_source: string | null;
  inspection_expiry: string | null;
  import_date: string | null;
  is_active?: boolean;
}

interface StaffUserRow {
  id: number;
  username: string;
  role: "admin" | "user";
  is_active: boolean;
}

interface CartLine {
  lineKey: string;
  product_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  owner_name: string;
  cylinder_type: string;
  cylinder_serial: string;
  inspection_expiry: string;
  import_source: string;
  import_date: string;
}

interface OrderRow {
  id: number;
  order_code: string;
  address?: string | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
}

interface ContactPick {
  name?: string[];
  tel?: string[];
}

/** Chromium Contact Picker is not in lib.dom; no @types per field-webapp plan. */
type NavigatorWithContacts = Navigator & {
  contacts?: {
    select?: (properties: string[], options: { multiple: boolean }) => Promise<ContactPick[]>;
  };
};

/** True when Chrome Contact Picker API is available (typically Android Chrome). */
function deviceContactsSelect():
  | ((properties: string[], options: { multiple: boolean }) => Promise<ContactPick[]>)
  | undefined {
  const nav: NavigatorWithContacts = navigator;
  const contacts = nav.contacts;
  const select = contacts?.select;
  return typeof select === "function" ? select.bind(contacts) : undefined;
}

/**
 * Phone-first 4-step order form. Staff POST is self-assigned on the server.
 */
export default function FieldCreateOrder() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>(0);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [segment, setSegment] = useState<CustomerSegment | "">("");
  const [mapPoint, setMapPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [mapLabel, setMapLabel] = useState<string | null>(null);
  const [geocodeHits, setGeocodeHits] = useState<GeocodeHit[]>([]);
  const [deliveryDate, setDeliveryDate] = useState(todayLocalIso);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<CylinderTemplate[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffUserRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState("__none__");
  const [ownerName, setOwnerName] = useState("");
  const [cylinderType, setCylinderType] = useState("");
  const [cylinderSerial, setCylinderSerial] = useState("");
  const [inspectionExpiry, setInspectionExpiry] = useState("");
  const [importSource, setImportSource] = useState("");
  const [importDate, setImportDate] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [paidAmount, setPaidAmount] = useState(0);
  const [deliveryStaffId, setDeliveryStaffId] = useState("__none__");

  const prefillDone = useRef(false);
  const showDeviceContacts = typeof deviceContactsSelect() === "function";

  const total = useMemo(() => cart.reduce((s, l) => s + l.unit_price * l.quantity, 0), [cart]);
  const paymentLabel =
    paymentMode === "cash" ? "Thanh toán đủ" : paymentMode === "partial" ? "Thu một phần" : "Ghi nợ";
  const goodsLabel = cart.map((i) => `${i.name} × ${i.quantity}`).join(", ");
  const segmentLabel = isCustomerSegment(segment) ? CUSTOMER_SEGMENT_LABEL[segment] : "";
  const paidForPayload = paymentMode === "cash" ? total : paymentMode === "debt" ? 0 : Math.max(0, paidAmount);

  /** Fill empty name/address/segment from the customer directory; 404 is silent. */
  const lookupCustomerProfile = useCallback(async (phoneRaw: string) => {
    const key = phoneRaw.trim();
    if (!key) return;
    try {
      const profile = await apiGet<CustomerResponse>(`/api/customers/by-phone?phone=${encodeURIComponent(key)}`);
      setName((prev) => (prev.trim() ? prev : profile.name));
      setAddress((prev) => (prev.trim() ? prev : (profile.address ?? "")));
      setSegment((seg) => (seg ? seg : isCustomerSegment(profile.customer_segment) ? profile.customer_segment : ""));
      toast.success("Đã điền từ hồ sơ khách");
    } catch {
      /* staff cannot list orders as fallback; leave blanks */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await apiGet<Product[]>("/api/products");
        setProducts(rows ?? []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tải được sản phẩm");
      }
      try {
        const rows = await apiGet<CylinderTemplate[]>("/api/cylinder-templates");
        setTemplates((rows ?? []).filter((t) => t.is_active !== false));
      } catch {
        setTemplates([]);
      }
      if (user?.role === "admin") {
        try {
          const rows = await apiGet<StaffUserRow[]>("/api/users");
          setStaffOptions((rows ?? []).filter((u) => u.role === "user" && u.is_active));
        } catch {
          setStaffOptions([]);
        }
      }
    })();
  }, [user?.role]);

  useEffect(() => {
    if (prefillDone.current) return;
    const customerIdRaw = searchParams.get("customer_id");
    const phoneQ = searchParams.get("phone");
    if (customerIdRaw) {
      prefillDone.current = true;
      const id = Number(customerIdRaw);
      if (!Number.isFinite(id)) {
        toast.error("Không tìm thấy khách");
        return;
      }
      void (async () => {
        try {
          const data = await apiGet<CustomerDetailResponse>(`/api/customers/${id}`);
          const c = data.customer;
          setName(c.name);
          setPhone(c.phone);
          setAddress(c.address ?? "");
          if (isCustomerSegment(c.customer_segment)) setSegment(c.customer_segment);
          let pin: { lat: number; lng: number } | null = null;
          for (const o of data.recent_orders ?? []) {
            const lat = o.delivery_latitude;
            const lng = o.delivery_longitude;
            if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)) {
              pin = { lat, lng };
              break;
            }
          }
          setMapPoint(pin);
        } catch {
          toast.error("Không tìm thấy khách");
        }
      })();
      return;
    }
    if (phoneQ) {
      prefillDone.current = true;
      setPhone(phoneQ);
      void lookupCustomerProfile(phoneQ);
    }
  }, [lookupCustomerProfile, searchParams]);

  const pickDeviceContact = async () => {
    const select = deviceContactsSelect();
    if (typeof select !== "function") return;
    try {
      const picks = await select(["name", "tel"], { multiple: false });
      const c = picks?.[0];
      const tel = (c?.tel ?? []).map((t) => t.replace(/\D/g, "")).find((d) => d.length >= 9);
      const nm = (c?.name ?? [])[0]?.trim();
      if (tel) setPhone(tel);
      if (nm) setName((prev) => (prev.trim() ? prev : nm));
      if (tel) void lookupCustomerProfile(tel);
    } catch {
      toast.message("Không đọc được danh bạ máy — nhập SĐT");
    }
  };

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    if (id === "__none__") return;
    const t = templates.find((row) => String(row.id) === id);
    if (!t) return;
    setOwnerName(t.owner_name ?? "");
    setImportSource(t.import_source ?? "");
    setInspectionExpiry(t.inspection_expiry ?? "");
    setImportDate(t.import_date ?? "");
  };

  const addLine = () => {
    if (!isCustomerSegment(segment)) {
      toast.error("Chọn tệp khách ở bước Khách");
      return;
    }
    const product = products.find((p) => String(p.id) === selectedProductId);
    if (!product) {
      toast.error("Chọn sản phẩm");
      return;
    }
    const qty = Math.max(1, Math.floor(Number(quantity) || 0));
    if (qty < 1) {
      toast.error("Số lượng tối thiểu là 1");
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        lineKey: `${Date.now()}-${product.id}`,
        product_id: product.id,
        name: product.name,
        quantity: qty,
        unit_price: unitPriceForSegment(product, segment),
        owner_name: ownerName,
        cylinder_type: cylinderType,
        cylinder_serial: cylinderSerial,
        inspection_expiry: inspectionExpiry,
        import_source: importSource,
        import_date: importDate,
      },
    ]);
  };

  const goNext = () => {
    if (step === 0) {
      if (!phone.trim() || !name.trim()) {
        toast.error("Nhập tên và số điện thoại");
        return;
      }
    }
    if (step === 2 && cart.length === 0) {
      toast.error("Thêm ít nhất 1 sản phẩm");
      return;
    }
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  };

  const resetForm = () => {
    setName("");
    setPhone("");
    setAddress("");
    setNote("");
    setCart([]);
    setMapPoint(null);
    setMapLabel(null);
    setGeocodeHits([]);
    setSegment("");
    setPaymentMode("cash");
    setPaidAmount(0);
    setDeliveryDate(todayLocalIso());
    setStep(0);
    setDeliveryStaffId("__none__");
  };

  const searchMap = async () => {
    const q = address.trim();
    if (q.length < 2) {
      toast.error("Nhập địa chỉ trước khi tìm");
      return;
    }
    try {
      const data = await apiGet<{ items: GeocodeHit[] }>(`/api/geocode?q=${encodeURIComponent(q)}&limit=6`);
      const items = data.items ?? [];
      setGeocodeHits(items);
      if (items.length === 0) toast.message("Không tìm thấy vị trí");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tìm được vị trí");
    }
  };

  const reverseGeocode = async () => {
    if (!mapPoint) return;
    try {
      const hit = await apiGet<GeocodeHit>(`/api/geocode/reverse?lat=${mapPoint.lat}&lng=${mapPoint.lng}`);
      setAddress((prev) => (prev.trim() ? prev : hit.display_name));
      setMapLabel(hit.display_name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không gợi ý được địa chỉ");
    }
  };

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("Nhập tên và số điện thoại");
      return;
    }
    if (!isCustomerSegment(segment)) {
      toast.error("Chọn tệp khách ở bước Khách");
      return;
    }
    if (cart.length < 1) {
      toast.error("Thêm ít nhất 1 sản phẩm");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        customer_name: name.trim(),
        phone: phone.trim(),
        address: address.trim() || null,
        note: note.trim() || null,
        delivery_date: deliveryDate || null,
        store_contact: DEFAULT_STORE_CONTACT_LINE,
        vat_rate: 0,
        payment_mode: paymentMode,
        paid_amount: paidForPayload,
        delivery_latitude: mapPoint ? mapPoint.lat : null,
        delivery_longitude: mapPoint ? mapPoint.lng : null,
        customer_segment: segment,
        lines: cart.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          owner_name: i.owner_name.trim() || null,
          cylinder_type: i.cylinder_type.trim() || null,
          cylinder_serial: i.cylinder_serial.trim() || null,
          inspection_expiry: i.inspection_expiry || null,
          import_source: i.import_source.trim() || null,
          import_date: i.import_date || null,
        })),
      };
      if (isAdmin) {
        payload.assigned_to_user_id = deliveryStaffId === "__none__" ? null : Number(deliveryStaffId);
      }
      const created = await apiPost<OrderRow>("/api/orders", payload);
      toast.success(`Đã tạo đơn ${created.order_code}`);
      const dest = deliveryDestination(created);
      if (dest) {
        openGoogleMapsDirections(dest);
      } else {
        toast.message("Chưa có địa chỉ/GPS — không mở Maps");
      }
      if (!isAdmin && !dest) {
        navigate("/don-cua-toi");
      } else if (isAdmin) {
        resetForm();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được đơn");
    }
    setSaving(false);
  };

  return (
    <AppLayout title="Tạo đơn">
      <div className="mx-auto max-w-lg space-y-4">
        <nav className="flex gap-1" aria-label="Các bước tạo đơn">
          {STEP_LABELS.map((label, i) => {
            const active = step === i;
            return (
              <button
                key={label}
                type="button"
                className={`min-h-11 flex-1 rounded-full px-2 text-[11px] font-medium ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                onClick={() => setStep(i as Step)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <OrderSlip
          className="sticky top-14 z-10"
          customerName={name}
          phone={phone}
          segmentLabel={segmentLabel}
          address={address}
          deliveryDate={deliveryDate}
          goodsLabel={goodsLabel}
          paymentLabel={paymentLabel}
          total={total}
          ready={Boolean(name.trim() && phone.trim() && isCustomerSegment(segment) && cart.length > 0)}
        />

        {step === 0 && (
          <div className="space-y-3">
            {showDeviceContacts && (
              <Button type="button" variant="secondary" className="min-h-11 w-full" onClick={() => void pickDeviceContact()}>
                Chọn từ danh bạ máy
              </Button>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="field-phone">Số điện thoại</Label>
              <Input
                id="field-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => void lookupCustomerProfile(phone)}
                inputMode="tel"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="field-name">Tên khách</Label>
              <Input id="field-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tệp khách hàng</Label>
              <Select value={segment || "__none__"} onValueChange={(v) => setSegment(v === "__none__" ? "" : (v as CustomerSegment))}>
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Chọn tệp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Chưa chọn</SelectItem>
                  {CUSTOMER_SEGMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="field-note">Ghi chú</Label>
              <Textarea id="field-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <Link to="/khach-hang" className="inline-block text-sm text-primary underline-offset-2 hover:underline">
              Mở danh bạ cửa hàng
            </Link>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="field-address">Địa chỉ giao</Label>
              <Textarea id="field-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
            </div>
            <Button type="button" variant="secondary" className="min-h-11 w-full" onClick={() => void searchMap()}>
              Tìm trên bản đồ
            </Button>
            {geocodeHits.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
                {geocodeHits.map((h) => (
                  <li key={h.place_id}>
                    <button
                      type="button"
                      className="min-h-11 w-full rounded-md px-3 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        setMapPoint({ lat: h.lat, lng: h.lng });
                        setMapLabel(h.display_name);
                      }}
                    >
                      {h.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {mapLabel && <p className="text-xs text-muted-foreground">Đang ghim: {mapLabel}</p>}
            <OrderAddressPickMap
              visible={step === 1}
              compact
              fallbackCenter={defaultOrderMapCenter()}
              marker={mapPoint}
              onPick={(lat, lng) => setMapPoint({ lat, lng })}
            />
            <Button type="button" variant="outline" className="min-h-11 w-full" disabled={!mapPoint} onClick={() => void reverseGeocode()}>
              Gợi ý địa chỉ từ ghim
            </Button>
            <div className="grid gap-1.5">
              <Label htmlFor="field-date">Ngày giao</Label>
              <Input id="field-date" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>Sản phẩm</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Chọn chai" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} — {formatVND(unitPriceForSegment(p, segment || null))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="field-qty">Số lượng</Label>
              <Input
                id="field-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <Button type="button" className="min-h-11 w-full" onClick={addLine}>
              Thêm
            </Button>
            <ul className="space-y-2">
              {cart.map((line) => (
                <li key={line.lineKey} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                  <div>
                    <p className="font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.quantity} × {formatVND(line.unit_price)}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCart((prev) => prev.filter((x) => x.lineKey !== line.lineKey))}>
                    Xóa
                  </Button>
                </li>
              ))}
            </ul>
            <Collapsible className="rounded-md border border-dashed px-2 py-1">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="h-11 w-full justify-between text-sm">
                  Thông tin bình
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pb-2">
                {templates.length > 0 && (
                  <div className="grid gap-1.5">
                    <Label>Mẫu bình</Label>
                    <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                      <SelectTrigger className="min-h-11">
                        <SelectValue placeholder="Không dùng mẫu" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Không dùng mẫu</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>Chủ SH</Label>
                  <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Loại chai</Label>
                  <Input value={cylinderType} onChange={(e) => setCylinderType(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Số seri</Label>
                  <Input value={cylinderSerial} onChange={(e) => setCylinderSerial(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Hạn KĐ</Label>
                  <Input type="date" value={inspectionExpiry} onChange={(e) => setInspectionExpiry(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Nơi nhập</Label>
                  <Input value={importSource} onChange={(e) => setImportSource(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Ngày nhập</Label>
                  <Input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant={paymentMode === "cash" ? "default" : "outline"} className="min-h-11 text-xs" onClick={() => setPaymentMode("cash")}>
                Thanh toán đủ
              </Button>
              <Button type="button" variant={paymentMode === "partial" ? "default" : "outline"} className="min-h-11 text-xs" onClick={() => setPaymentMode("partial")}>
                Thu một phần
              </Button>
              <Button type="button" variant={paymentMode === "debt" ? "default" : "outline"} className="min-h-11 text-xs" onClick={() => setPaymentMode("debt")}>
                Ghi nợ
              </Button>
            </div>
            {paymentMode === "partial" && (
              <div className="grid gap-1.5">
                <Label htmlFor="field-paid">Số đã thu (VND)</Label>
                <Input
                  id="field-paid"
                  type="number"
                  min={0}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            )}
            {isAdmin && (
              <div className="grid gap-1.5">
                <Label>NV giao</Label>
                <Select value={deliveryStaffId} onValueChange={setDeliveryStaffId}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue placeholder="Không gán" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Không gán</SelectItem>
                    {staffOptions.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-sm font-semibold">Tổng: {formatVND(total)}</p>
          </div>
        )}

        <div className="flex gap-2 pb-2">
          {step > 0 && (
            <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}>
              Quay lại
            </Button>
          )}
          {step < 3 ? (
            <Button type="button" className="min-h-11 flex-1" onClick={goNext}>
              Tiếp
            </Button>
          ) : (
            <Button type="button" className="min-h-11 flex-1" disabled={saving} onClick={() => void submit()}>
              {saving ? "Đang tạo…" : "Tạo đơn + chỉ đường"}
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
