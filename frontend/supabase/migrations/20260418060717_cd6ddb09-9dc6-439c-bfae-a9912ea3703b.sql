-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  description TEXT,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  sell_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Public insert products" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update products" ON public.products FOR UPDATE USING (true);
CREATE POLICY "Public delete products" ON public.products FOR DELETE USING (true);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE DEFAULT ('DH' || to_char(now(),'YYMMDDHH24MISSMS')),
  customer_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  note TEXT,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 10,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Public insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update orders" ON public.orders FOR UPDATE USING (true);
CREATE POLICY "Public delete orders" ON public.orders FOR DELETE USING (true);

-- Order items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read order_items" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "Public insert order_items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update order_items" ON public.order_items FOR UPDATE USING (true);
CREATE POLICY "Public delete order_items" ON public.order_items FOR DELETE USING (true);

-- Trigger giảm tồn kho khi insert order item, hoàn lại khi xóa
CREATE OR REPLACE FUNCTION public.adjust_stock_on_item()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.product_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.products SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.product_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_order_items_stock
  AFTER INSERT OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.adjust_stock_on_item();

-- Indexes
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_product ON public.order_items(product_id);