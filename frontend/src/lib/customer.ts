/**
 * Customer directory types shared by the customers page and order form lookup.
 */

import type { CustomerSegment } from "@/lib/customer-segment";

export type CustomerGroup = "loyal" | "at_risk" | "active";

export interface CustomerResponse {
  id: number;
  name: string;
  phone: string;
  address: string | null;
  hamlet: string | null;
  notes: string | null;
  customer_segment: CustomerSegment | null;
  assigned_to_user_id: number | null;
  last_order_at: string | null;
  order_count: number;
  outstanding: number | string;
  computed_group: CustomerGroup;
  typical_product_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerListResponse {
  items: CustomerResponse[];
  total: number;
}

export interface CustomerDetailResponse {
  customer: CustomerResponse;
  recent_orders: Array<{
    id: number;
    order_code: string;
    customer_name: string;
    total: number | string;
    created_at: string;
    outstanding_amount?: number | string;
    address?: string | null;
    delivery_latitude?: number | null;
    delivery_longitude?: number | null;
  }>;
}

export interface CustomerWritePayload {
  name: string;
  phone: string;
  address: string | null;
  hamlet: string | null;
  notes: string | null;
  customer_segment: CustomerSegment | null;
  assigned_to_user_id: number | null;
}

export const CUSTOMER_GROUP_LABEL: Record<CustomerGroup, string> = {
  loyal: "Loyal",
  at_risk: "Lâu không mua",
  active: "Đang mua",
};
