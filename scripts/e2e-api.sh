#!/usr/bin/env bash
#
# End-to-end smoke test against a running API (local uvicorn or Docker).
# Usage:
#   ./scripts/e2e-api.sh
#   BASE_URL=http://127.0.0.1:8001 ./scripts/e2e-api.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
PREFIX="${BASE_URL}/api"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
COOKIE_JAR="/tmp/e2e_cookie.jar"

fail() {
  echo "e2e failed: $*" >&2
  exit 1
}

http_code() {
  curl -sS -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -o /tmp/e2e_body.out -w "%{http_code}" "$@"
}

need_json() {
  command -v jq >/dev/null 2>&1 || fail "install jq for JSON assertions (brew install jq)"
}

echo "e2e: BASE_URL=${BASE_URL}"
rm -f "${COOKIE_JAR}"

code=$(http_code -X POST "${PREFIX}/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}")
[[ "${code}" == "200" ]] || fail "POST /api/auth/login expected 200 got ${code}: $(cat /tmp/e2e_body.out)"

code=$(http_code "${PREFIX}/products")
[[ "${code}" == "200" ]] || fail "GET /api/products expected 200 got ${code}: $(cat /tmp/e2e_body.out)"

code=$(http_code "${PREFIX}/products-export.csv")
[[ "${code}" == "200" ]] || fail "GET /api/products-export.csv expected 200 got ${code}"
head -1 /tmp/e2e_body.out | grep -q "id" || fail "products CSV missing header"

SKU="e2e-$(date +%s)"
payload=$(jq -nc --arg sku "${SKU}" '{name:"E2E Item",sku:$sku,sell_price:99000,cost_price:80000,stock_quantity:50,low_stock_threshold:10,description:null}')
code=$(http_code -X POST "${PREFIX}/products" -H "Content-Type: application/json" -d "${payload}")
[[ "${code}" == "200" ]] || fail "POST /api/products expected 200 got ${code}: $(cat /tmp/e2e_body.out)"

need_json
ITEM_ID=$(jq -r '.id' /tmp/e2e_body.out)
[[ "${ITEM_ID}" =~ ^[0-9]+$ ]] || fail "missing product id"

patch='{"sell_price":"100000"}'
code=$(http_code -X PATCH "${PREFIX}/products/${ITEM_ID}" -H "Content-Type: application/json" -d "${patch}")
[[ "${code}" == "200" ]] || fail "PATCH /api/products/:id expected 200 got ${code}"

order_payload=$(jq -nc --argjson id "${ITEM_ID}" '{customer_name:"E2E",phone:"0999",address:null,note:null,vat_rate:10,lines:[{product_id:$id,quantity:1}]}')
code=$(http_code -X POST "${PREFIX}/orders" -H "Content-Type: application/json" -d "${order_payload}")
[[ "${code}" == "200" ]] || fail "POST /api/orders expected 200 got ${code}: $(cat /tmp/e2e_body.out)"

need_json
ORDER_ID=$(jq -r '.id' /tmp/e2e_body.out)
[[ "${ORDER_ID}" =~ ^[0-9]+$ ]] || fail "missing order id"

code=$(http_code "${PREFIX}/orders")
[[ "${code}" == "200" ]] || fail "GET /api/orders expected 200 got ${code}"

code=$(http_code "${PREFIX}/orders/${ORDER_ID}")
[[ "${code}" == "200" ]] || fail "GET /api/orders/:id expected 200 got ${code}"

code=$(http_code "${PREFIX}/orders/${ORDER_ID}/delivery-slip.html")
[[ "${code}" == "200" ]] || fail "GET delivery-slip.html expected 200 got ${code}"
grep -q "<!DOCTYPE html" /tmp/e2e_body.out || fail "HTML slip missing doctype"

code=$(http_code "${PREFIX}/orders/${ORDER_ID}/gas-export.csv")
[[ "${code}" == "200" ]] || fail "GET order gas-export.csv expected 200 got ${code}"
head -1 /tmp/e2e_body.out | grep -q "chủ sở hữu" || fail "order gas CSV missing header"

code=$(http_code "${PREFIX}/dashboard")
[[ "${code}" == "200" ]] || fail "GET /api/dashboard expected 200 got ${code}"

code=$(http_code "${PREFIX}/orders/tax-report?from=2020-01-01&to=2030-12-31")
[[ "${code}" == "200" ]] || fail "GET /api/orders/tax-report expected 200 got ${code}"

code=$(http_code "${PREFIX}/tax-export.csv")
[[ "${code}" == "200" ]] || fail "GET /tax-export.csv expected 200 got ${code}"
head -1 /tmp/e2e_body.out | grep -q order_id || fail "tax CSV missing header"
head -1 /tmp/e2e_body.out | grep -q delivery_date || fail "tax CSV missing gas columns"

code=$(http_code "${PREFIX}/gas-ledger")
[[ "${code}" == "200" ]] || fail "GET /api/gas-ledger expected 200 got ${code}"

code=$(http_code "${PREFIX}/gas-ledger.csv")
[[ "${code}" == "200" ]] || fail "GET /gas-ledger.csv expected 200 got ${code}"
head -1 /tmp/e2e_body.out | grep -q "chủ sở hữu" || fail "gas ledger CSV missing header"

code=$(http_code "${PREFIX}/sales-gas-export.csv")
[[ "${code}" == "200" ]] || fail "GET /sales-gas-export.csv expected 200 got ${code}"
head -1 /tmp/e2e_body.out | grep -q order_id || fail "sales-gas CSV missing header"

echo "e2e: ok"
