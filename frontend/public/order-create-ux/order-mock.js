/**
 * Shared mock state for order-create HTML prototypes.
 * Updates the phiếu as fields change. No API.
 */
(function () {
  const PRODUCTS = {
    "12": { name: "Gas 12kg", price: 420000, type: "12kg" },
    "45": { name: "Gas 45kg", price: 1450000, type: "45kg" },
  };

  const SEGMENTS = {
    wholesale: "Đại lý sỉ",
    restaurant: "Quán ăn",
    retail: "Khách lẻ",
  };

  const PAY = {
    cash: "Thanh toán đủ",
    partial: "Thu một phần",
    debt: "Ghi nợ",
  };

  function vnd(n) {
    return new Intl.NumberFormat("vi-VN").format(n) + "\u00a0đ";
  }

  /** `YYYY-MM-DD` from `<input type="date">` → `DD/MM/YYYY` on the phiếu. */
  function displayDate(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return m[3] + "/" + m[2] + "/" + m[1];
    return value || "";
  }

  let skipCartRender = false;

  function blank() {
    return {
      name: "",
      phone: "",
      segment: "",
      date: "16/09/2026",
      staff: "",
      address: "",
      pinned: false,
      lines: [],
      payment: "cash",
      paid: 0,
      vat: 0,
      note: "",
      shells: 0,
    };
  }

  const state = blank();

  function subtotal() {
    return state.lines.reduce((s, l) => s + l.price * l.qty, 0);
  }

  function total() {
    const sub = subtotal();
    return sub + Math.round((sub * Number(state.vat || 0)) / 100);
  }

  function gaps() {
    const out = [];
    if (!state.name.trim()) out.push("tên");
    if (!state.phone.trim()) out.push("SĐT");
    if (!state.segment) out.push("tệp khách");
    if (!state.address.trim()) out.push("địa chỉ");
    if (!state.date.trim()) out.push("ngày giao");
    if (state.lines.length === 0) out.push("hàng");
    state.lines.forEach((l) => {
      if (!l.owner) out.push("chủ sở hữu chai");
    });
    return out;
  }

  function fill(el, value, emptyText) {
    if (!el) return;
    const text = (value || "").toString().trim();
    el.textContent = text || emptyText;
    el.classList.toggle("is-empty", !text);
  }

  function renderSlip() {
    document.querySelectorAll("[data-slip-name]").forEach((el) => fill(el, state.name, "Chưa ghi tên"));
    document.querySelectorAll("[data-slip-phone]").forEach((el) => fill(el, state.phone, "Chưa có SĐT"));
    document.querySelectorAll("[data-slip-segment]").forEach((el) =>
      fill(el, SEGMENTS[state.segment] || "", "Chưa chọn tệp")
    );
    document.querySelectorAll("[data-slip-place]").forEach((el) =>
      fill(el, state.address, "Chưa ghim điểm giao")
    );
    document.querySelectorAll("[data-slip-date]").forEach((el) => fill(el, displayDate(state.date), "Chưa chọn ngày"));
    document.querySelectorAll("[data-slip-pay]").forEach((el) => fill(el, PAY[state.payment], ""));

    const goods = state.lines.length
      ? state.lines.map((l) => l.name + " × " + l.qty).join(", ")
      : "";
    document.querySelectorAll("[data-slip-goods]").forEach((el) => fill(el, goods, "Chưa thêm chai"));
    document.querySelectorAll("[data-slip-total]").forEach((el) => {
      el.textContent = vnd(total());
    });
    document.querySelectorAll("[data-foot-total]").forEach((el) => {
      el.textContent = vnd(total());
    });

    const missing = gaps();
    const ready = missing.length === 0;
    document.querySelectorAll("[data-slip-stamp]").forEach((el) => {
      el.textContent = ready ? "Đủ sổ gas" : "Thiếu sổ gas";
      el.classList.toggle("is-ready", ready);
    });
    document.querySelectorAll("[data-slip-gap]").forEach((el) => {
      el.textContent = ready ? "Đủ để vào sổ" : "Thiếu " + missing[0];
      el.classList.toggle("is-empty", !ready);
    });

    const list = document.querySelector("[data-cart]");
    if (list && !skipCartRender) {
      if (state.lines.length === 0) {
        list.innerHTML = '<p class="hint">Chưa có chai. Chọn sản phẩm rồi bấm Thêm.</p>';
      } else {
        list.innerHTML = state.lines
          .map((l, i) => {
            const meta = list.dataset.compact === "1"
              ? ""
              : `<div class="line-meta">
                  <div class="field"><label>Chủ sở hữu</label><input class="input" data-owner="${i}" value="${l.owner}"></div>
                  <div class="field"><label>Số seri</label><input class="input" data-serial="${i}" value="${l.serial}" placeholder="Không bắt buộc"></div>
                  <div class="field"><label>Hạn kiểm định</label><input class="input" value="2027-03-12"></div>
                  <div class="field"><label>Nơi nhập</label><input class="input" value="Kho Gas Hoàng Ân"></div>
                </div>`;
            return `<article class="line">
              <div class="line-head">
                <p>${l.name} <span class="muted">${vnd(l.price)} / bình</span></p>
                <input class="input" style="width:72px" type="number" min="1" value="${l.qty}" data-qty="${i}">
                <span>${vnd(l.price * l.qty)}</span>
                <button class="btn btn-quiet" type="button" data-remove="${i}">Xóa</button>
              </div>
              ${meta}
            </article>`;
          })
          .join("");
      }
    }
  }

  function setField(name, value) {
    state[name] = value;
    renderSlip();
  }

  function showToast(msg) {
    const t = document.querySelector("[data-toast]");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    window.clearTimeout(showToast._id);
    showToast._id = window.setTimeout(() => {
      t.hidden = true;
    }, 2400);
  }

  function goStep(id) {
    document.querySelectorAll("[data-panel]").forEach((p) => {
      p.hidden = p.getAttribute("data-panel") !== id;
    });
    document.querySelectorAll("[data-step]").forEach((b) => {
      b.classList.toggle("is-on", b.getAttribute("data-step") === id);
    });
    const title = document.querySelector("[data-step-title]");
    const map = {
      customer: "Khách nhận hàng",
      place: "Điểm giao",
      goods: "Chai trên phiếu",
      pay: "Thu tiền",
    };
    if (title && map[id]) title.textContent = map[id];
    document.querySelectorAll("[data-next]").forEach((b) => {
      b.hidden = id === "pay";
    });
    document.querySelectorAll("[data-create]").forEach((b) => {
      b.hidden = id !== "pay";
    });
    document.querySelectorAll("[data-prev]").forEach((b) => {
      b.disabled = id === "customer";
    });
  }

  function nextStep() {
    const order = ["customer", "place", "goods", "pay"];
    const current = document.querySelector("[data-panel]:not([hidden])");
    const id = current ? current.getAttribute("data-panel") : "customer";
    const i = order.indexOf(id);
    goStep(order[Math.min(i + 1, order.length - 1)]);
  }

  function prevStep() {
    const order = ["customer", "place", "goods", "pay"];
    const current = document.querySelector("[data-panel]:not([hidden])");
    const id = current ? current.getAttribute("data-panel") : "customer";
    const i = order.indexOf(id);
    goStep(order[Math.max(i - 1, 0)]);
  }

  function addLine(sku) {
    const p = PRODUCTS[sku];
    if (!p) {
      showToast("Chọn sản phẩm trước khi thêm");
      return;
    }
    const existing = state.lines.find((l) => l.sku === sku);
    if (existing) {
      existing.qty += 1;
    } else {
      state.lines.push({
        sku,
        name: p.name,
        price: p.price,
        qty: 1,
        owner: "Gas Hoàng Ân",
        serial: "",
        type: p.type,
      });
    }
    renderSlip();
  }

  function bind() {
    document.querySelectorAll("[data-field]").forEach((el) => {
      const name = el.getAttribute("data-field");
      const apply = () => setField(name, el.value);
      el.addEventListener("input", apply);
      el.addEventListener("change", apply);
      if (el.value) state[name] = el.value;
    });

    document.querySelectorAll("[data-segment]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.segment = btn.getAttribute("data-segment");
        document.querySelectorAll("[data-segment]").forEach((b) => b.classList.toggle("is-on", b === btn));
        renderSlip();
      });
    });

    document.querySelectorAll("[data-pay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.payment = btn.getAttribute("data-pay");
        document.querySelectorAll("[data-pay]").forEach((b) => b.classList.toggle("is-on", b === btn));
        renderSlip();
      });
    });

    document.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sel = document.querySelector("[data-product]");
        addLine(sel ? sel.value : btn.getAttribute("data-add"));
      });
    });

    document.querySelectorAll("[data-step]").forEach((btn) => {
      btn.addEventListener("click", () => goStep(btn.getAttribute("data-step")));
    });
    document.querySelectorAll("[data-next]").forEach((btn) => btn.addEventListener("click", nextStep));
    document.querySelectorAll("[data-prev]").forEach((btn) => btn.addEventListener("click", prevStep));
    document.querySelectorAll("[data-create]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const missing = gaps();
        if (missing.length) {
          showToast("Chưa đủ: " + missing[0]);
          return;
        }
        showToast("Đã tạo đơn DH-2409-184");
      });
    });

    document.querySelectorAll("[data-pin]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.pinned = true;
        state.address = state.address.trim() || "12 hẻm 45, P. Tân Phú, Q. Tân Phú";
        const addr = document.querySelector("[data-field='address']");
        if (addr) addr.value = state.address;
        document.querySelectorAll(".map-pin").forEach((p) => p.classList.remove("is-off"));
        renderSlip();
      });
    });

    document.querySelectorAll("[data-geo-hit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.address = btn.getAttribute("data-geo-hit");
        state.pinned = true;
        const addr = document.querySelector("[data-field='address']");
        if (addr) addr.value = state.address;
        document.querySelectorAll(".map-pin").forEach((p) => p.classList.remove("is-off"));
        document.querySelectorAll("[data-geo-hit]").forEach((b) => b.classList.toggle("is-on", b === btn));
        renderSlip();
      });
    });

    document.querySelectorAll("[data-paste]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.address = "12 hẻm 45, P. Tân Phú (từ Google Maps)";
        state.pinned = true;
        const addr = document.querySelector("[data-field='address']");
        if (addr) addr.value = state.address;
        document.querySelectorAll(".map-pin").forEach((p) => p.classList.remove("is-off"));
        showToast("Đã áp dụng vị trí từ Maps");
        renderSlip();
      });
    });

    const cart = document.querySelector("[data-cart]");
    if (cart) {
      cart.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-remove]");
        if (!rm) return;
        state.lines.splice(Number(rm.getAttribute("data-remove")), 1);
        renderSlip();
      });
      cart.addEventListener("input", (e) => {
        const q = e.target.closest("[data-qty]");
        if (q) {
          const i = Number(q.getAttribute("data-qty"));
          state.lines[i].qty = Math.max(1, Number(q.value) || 1);
          renderSlip();
        }
        const o = e.target.closest("[data-owner]");
        if (o) {
          state.lines[Number(o.getAttribute("data-owner"))].owner = o.value;
          skipCartRender = true;
          renderSlip();
          skipCartRender = false;
        }
      });
    }

    const mobileStep = document.querySelector("[data-mobile-step]");
    document.querySelectorAll("[data-mobile-next]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (mobileStep) mobileStep.hidden = false;
        document.querySelectorAll("[data-mobile-one]").forEach((p) => {
          p.hidden = true;
        });
        document.querySelectorAll("[data-mobile-next]").forEach((b) => {
          b.hidden = true;
        });
        document.querySelectorAll("[data-create]").forEach((b) => {
          b.hidden = false;
        });
        document.querySelectorAll("[data-mobile-back]").forEach((b) => {
          b.hidden = false;
        });
        const lab = document.querySelector("[data-mobile-label]");
        if (lab) lab.textContent = "Hàng & thu tiền";
      });
    });
    document.querySelectorAll("[data-mobile-back]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (mobileStep) mobileStep.hidden = true;
        document.querySelectorAll("[data-mobile-one]").forEach((p) => {
          p.hidden = false;
        });
        document.querySelectorAll("[data-mobile-next]").forEach((b) => {
          b.hidden = false;
        });
        document.querySelectorAll("[data-create]").forEach((b) => {
          b.hidden = true;
        });
        document.querySelectorAll("[data-mobile-back]").forEach((b) => {
          b.hidden = true;
        });
        const lab = document.querySelector("[data-mobile-label]");
        if (lab) lab.textContent = "Khách & giao";
      });
    });

    if (document.querySelector("[data-panel]")) goStep("customer");
    renderSlip();
  }

  window.OrderMock = { state, bind, renderSlip, goStep, vnd, gaps };
  document.addEventListener("DOMContentLoaded", bind);
})();
