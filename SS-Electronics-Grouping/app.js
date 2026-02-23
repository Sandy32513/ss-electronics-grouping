(() => {
  "use strict";

  const CONFIG = {
    routes: ["#login", "#main", "#reprint", "#partial-close"],
    positions: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"],
    anoCount: 3,
    groupsPerAno: 6,
    rows: 4,
    traysPerRow: 10,
    cycleDelayMs: 4000,
    groupResetDelayMs: 1200
  };

  const dom = {
    pages: Array.from(document.querySelectorAll(".page")),
    routeButtons: Array.from(document.querySelectorAll("[data-route]")),
    floatButtons: Array.from(document.querySelectorAll(".float-up")),
    trayGrid: document.getElementById("tray-grid"),
    scanInput: document.getElementById("serial-scan-input"),
    statusMessage: document.getElementById("status-message"),
    scannedSerial: document.getElementById("scanned-serial"),
    liveTime: document.getElementById("live-time"),
    trayCount: document.getElementById("tray-count"),
    trayScanQty: document.getElementById("tray-scan-qty"),
    partScanCount: document.getElementById("part-scan-count"),
    partOkCount: document.getElementById("part-ok-count"),
    partNgCount: document.getElementById("part-ng-count"),
    positionCounter: document.getElementById("position-counter"),
    positionButtons: Array.from(document.querySelectorAll(".position-btn")),
    operatorChip: document.getElementById("operator-chip"),
    mainGroup: document.getElementById("main-group"),
    mainBlock: document.getElementById("main-block"),
    mainPrinterIp: document.getElementById("main-printer-ip"),
    carrierId: document.getElementById("carrier-id"),
    partialCarrierId: document.getElementById("partial-carrier-id"),
    reprintGroup: document.getElementById("reprint-group"),
    reprintOperator: document.getElementById("reprint-operator"),
    reprintBlock: document.getElementById("reprint-block"),
    reprintScanQty: document.getElementById("reprint-scan-qty"),
    partialOperator: document.getElementById("partial-operator"),
    partialBlock: document.getElementById("partial-block"),
    partialPrinterIp: document.getElementById("partial-printer-ip"),
    partialScanQty: document.getElementById("partial-scan-qty"),
    partialCloseSubmitBtn: document.getElementById("partial-close-submit-btn"),
    partialRefreshBtn: document.getElementById("partial-refresh-btn"),
    partialFeedback: document.getElementById("partial-feedback"),
    reprintScanCarrierInput: document.getElementById("reprint-scan-carrier-input"),
    reprintSubmitBtn: document.getElementById("reprint-submit-btn"),
    reprintRefreshBtn: document.getElementById("reprint-refresh-btn"),
    reprintFeedback: document.getElementById("reprint-feedback"),
    partialUsernameInput: document.getElementById("partial-username-input"),
    loginGroup: document.getElementById("login-group"),
    loginBlock: document.getElementById("login-block"),
    loginOperator: document.getElementById("login-operator"),
    loginPassword: document.getElementById("login-password"),
    passwordToggle: document.getElementById("password-toggle"),
    loginSelectFields: Array.from(document.querySelectorAll("#login .field.field-select")),
    loginSubmit: document.getElementById("login-submit"),
    loginFeedback: document.getElementById("login-feedback"),
    logoutBtn: document.getElementById("logoutBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    ungroupTrayBtn: document.getElementById("ungroupTrayBtn") || document.getElementById("ungroup-tray-btn"),
    ungroupPartBtn: document.getElementById("ungroupPartBtn") || document.getElementById("ungroup-part-btn")
  };

  const defaults = {
    operator: (dom.loginOperator?.value || "").trim(),
    group: (dom.loginGroup?.value || "").trim(),
    block: (dom.loginBlock?.value || "").trim(),
    printerIp: (dom.mainPrinterIp?.textContent || "").trim()
  };

  const state = {
    operatorId: "",
    block: "",
    group: "",
    ano: "",
    printerIp: "",
    carrierId: "",
    scannedBarcodes: new Set(),
    scanHistory: [],
    partScanCount: 0,
    positionIndex: 0,
    completedTrays: 0,
    rowIndex: 0
  };

  const runtime = {
    isAuthenticated: false,
    scanLocked: false,
    scanQueue: [],
    trayOrder: [],
    eventsBound: false,
    buttonLocks: new Map(),
    timers: {
      duplicate: null,
      cycle: null,
      group: null
    }
  };

  function getTotalTrays() {
    return CONFIG.rows * CONFIG.traysPerRow;
  }

  function getTraySize() {
    return CONFIG.positions.length;
  }

  function setText(element, value) {
    if (!element) return;
    element.textContent = String(value);
  }

  function setStatusMessage(text, color = "") {
    if (!dom.statusMessage) return;
    const normalized = String(text || "").toLowerCase();
    dom.statusMessage.textContent = text;

    dom.statusMessage.classList.remove("is-error", "is-success", "status-enter");

    const normalizedColor = String(color || "").toLowerCase();

    if (normalizedColor === "#e53935" || normalizedColor === "#c62828") {
      dom.statusMessage.classList.add("is-error");
    } else if (
      normalizedColor === "#2e7d32" ||
      normalized.includes("success") ||
      normalized.includes("completed")
    ) {
      dom.statusMessage.classList.add("is-success");
    }

    void dom.statusMessage.offsetWidth;
    dom.statusMessage.classList.add("status-enter");
  }

  function setLoginFeedback(text) {
    setText(dom.loginFeedback, text);
  }

  function setReprintFeedback(text, type = "") {
    if (!dom.reprintFeedback) return;

    dom.reprintFeedback.textContent = text || "";
    dom.reprintFeedback.classList.remove("success", "error", "is-visible");

    if (!text) return;

    if (type === "success" || type === "error") {
      dom.reprintFeedback.classList.add(type);
    }

    dom.reprintFeedback.classList.add("is-visible");
  }

  function setPartialFeedback(text, type = "") {
    if (!dom.partialFeedback) return;

    dom.partialFeedback.textContent = text || "";
    dom.partialFeedback.classList.remove("success", "error", "is-visible");

    if (!text) return;

    if (type === "success" || type === "error") {
      dom.partialFeedback.classList.add(type);
    }

    dom.partialFeedback.classList.add("is-visible");
  }

  function isButtonLocked(button) {
    return Boolean(button && runtime.buttonLocks.has(button));
  }

  function lockButton(button, durationMs = 800) {
    if (!button) return true;
    if (isButtonLocked(button)) return false;

    button.disabled = true;
    const safeDuration = Math.max(150, Number(durationMs) || 800);
    const timerId = setTimeout(() => {
      runtime.buttonLocks.delete(button);
      if (document.body.contains(button)) {
        button.disabled = false;
      }
      syncButtonStates();
    }, safeDuration);

    runtime.buttonLocks.set(button, timerId);
    return true;
  }

  function clearButtonLocks() {
    runtime.buttonLocks.forEach((timerId, button) => {
      clearTimeout(timerId);
      if (button && document.body.contains(button)) {
        button.disabled = false;
      }
    });
    runtime.buttonLocks.clear();
    syncButtonStates();
  }

  function updateReprintButtonState() {
    if (!dom.reprintSubmitBtn) return;
    const hasCarrierId = Boolean((dom.reprintScanCarrierInput?.value || "").trim());
    dom.reprintSubmitBtn.disabled = isButtonLocked(dom.reprintSubmitBtn) || !hasCarrierId;
  }

  function handleReprintSubmit() {
    if (!lockButton(dom.reprintSubmitBtn, 450)) return;

    const carrierId = (dom.reprintScanCarrierInput?.value || "").trim();
    if (!carrierId) {
      setReprintFeedback("Carrier ID is required for Re-Print.", "error");
      syncButtonStates();
      dom.reprintScanCarrierInput?.focus();
      return;
    }

    setReprintFeedback(`Re-Print request submitted for ${carrierId}.`, "success");
    syncButtonStates();
  }

  function hasPartialCarrierId() {
    const carrierId = (dom.partialCarrierId?.textContent || "").trim();
    return Boolean(carrierId && carrierId !== "- -" && carrierId !== "--");
  }

  function hasPartialUsername() {
    return Boolean((dom.partialUsernameInput?.value || "").trim());
  }

  function updatePartialCloseButtonState() {
    if (!dom.partialCloseSubmitBtn) return;
    dom.partialCloseSubmitBtn.disabled =
      isButtonLocked(dom.partialCloseSubmitBtn) || !hasPartialCarrierId() || !hasPartialUsername();
  }

  function syncButtonStates() {
    if (dom.refreshBtn) {
      dom.refreshBtn.disabled = runtime.scanLocked || isButtonLocked(dom.refreshBtn);
    }

    if (dom.ungroupTrayBtn) {
      dom.ungroupTrayBtn.disabled =
        runtime.scanLocked || state.completedTrays === 0 || isButtonLocked(dom.ungroupTrayBtn);
    }

    if (dom.ungroupPartBtn) {
      dom.ungroupPartBtn.disabled =
        runtime.scanLocked || state.scanHistory.length === 0 || isButtonLocked(dom.ungroupPartBtn);
    }

    if (dom.loginSubmit) {
      dom.loginSubmit.disabled = isButtonLocked(dom.loginSubmit);
    }

    if (dom.reprintRefreshBtn) {
      dom.reprintRefreshBtn.disabled = isButtonLocked(dom.reprintRefreshBtn);
    }

    if (dom.partialRefreshBtn) {
      dom.partialRefreshBtn.disabled = isButtonLocked(dom.partialRefreshBtn);
    }

    updateReprintButtonState();
    updatePartialCloseButtonState();
  }

  function handlePartialCloseSubmit() {
    if (!lockButton(dom.partialCloseSubmitBtn, 450)) return;

    if (!hasPartialCarrierId()) {
      setPartialFeedback("Carrier ID is not available for Partial-Close.", "error");
      syncButtonStates();
      return;
    }

    const username = (dom.partialUsernameInput?.value || "").trim();
    if (!username) {
      setPartialFeedback("Username is required for Partial-Close.", "error");
      syncButtonStates();
      dom.partialUsernameInput?.focus();
      return;
    }

    const carrierId = (dom.partialCarrierId?.textContent || "").trim();
    setPartialFeedback(`Partial-Close completed for ${carrierId}.`, "success");
    syncButtonStates();
  }

  function setScannedSerial(text) {
    setText(dom.scannedSerial, text);
  }

  function clearScanInputDecoration() {
    if (!dom.scanInput) return;
    dom.scanInput.classList.remove("scan-input-error");
  }

  function normalizeBarcode(rawBarcode) {
    return String(rawBarcode || "").trim().toUpperCase();
  }

  function enqueueScan(barcode) {
    runtime.scanQueue.push(barcode);
  }

  function clearScanQueue() {
    runtime.scanQueue.length = 0;
  }

  function getGroupsForAno(anoValue) {
    const normalizedAno = String(anoValue || "").trim().toUpperCase();
    const match = /^ANO-(\d+)$/.exec(normalizedAno);
    if (!match) return [];

    const anoIndex = Number(match[1]);
    if (!Number.isInteger(anoIndex) || anoIndex < 1 || anoIndex > CONFIG.anoCount) {
      return [];
    }

    const start = (anoIndex - 1) * CONFIG.groupsPerAno + 1;
    return Array.from({ length: CONFIG.groupsPerAno }, (_, offset) => {
      const number = start + offset;
      return `GROUP-${String(number).padStart(2, "0")}`;
    });
  }

  function populateGroupDropdown(anoValue, preferredGroup = "") {
    if (!dom.loginGroup) return;

    const groups = getGroupsForAno(anoValue);
    dom.loginGroup.innerHTML = "";

    groups.forEach((groupName) => {
      const option = document.createElement("option");
      option.value = groupName;
      option.textContent = groupName;
      dom.loginGroup.append(option);
    });

    if (groups.length === 0) return;

    const targetGroup = groups.includes(preferredGroup) ? preferredGroup : groups[0];
    dom.loginGroup.value = targetGroup;
  }

  function handleAnoChange(anoValue) {
    const currentGroup = dom.loginGroup?.value || "";
    populateGroupDropdown(anoValue, currentGroup);
  }

  function syncPasswordToggleState() {
    if (!dom.passwordToggle || !dom.loginPassword) return;

    const isVisible = dom.loginPassword.type === "text";
    dom.passwordToggle.classList.toggle("is-visible", isVisible);
    dom.passwordToggle.setAttribute("aria-pressed", String(isVisible));
    dom.passwordToggle.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
  }

  function initLoginUiEnhancements() {
    if (dom.passwordToggle && dom.loginPassword) {
      syncPasswordToggleState();

      dom.passwordToggle.addEventListener("click", () => {
        const showingPlainText = dom.loginPassword.type === "text";
        dom.loginPassword.type = showingPlainText ? "password" : "text";
        syncPasswordToggleState();

        dom.loginPassword.focus({ preventScroll: true });
        try {
          const end = dom.loginPassword.value.length;
          dom.loginPassword.setSelectionRange(end, end);
        } catch (_) {
          // Not all input modes allow setting selection range.
        }
      });
    }

    dom.loginSelectFields.forEach((field) => {
      const select = field.querySelector("select");
      if (!select) return;

      const setOpen = (isOpen) => field.classList.toggle("is-open", isOpen);

      select.addEventListener("focus", () => setOpen(true));
      select.addEventListener("blur", () => setOpen(false));
      select.addEventListener("pointerdown", () => setOpen(true));
      select.addEventListener("change", () => setOpen(false));
      select.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || event.key === "Tab" || event.key === "Enter") {
          setOpen(false);
        }
      });
    });
  }

  function initReprintUi() {
    updateReprintButtonState();

    if (dom.reprintScanCarrierInput) {
      dom.reprintScanCarrierInput.addEventListener("input", () => {
        updateReprintButtonState();
        setReprintFeedback("");
      });

      dom.reprintScanCarrierInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        handleReprintSubmit();
      });
    }

    if (dom.reprintSubmitBtn) {
      dom.reprintSubmitBtn.addEventListener("click", handleReprintSubmit);
    }

    if (dom.reprintRefreshBtn) {
      dom.reprintRefreshBtn.addEventListener("click", () => {
        if (!lockButton(dom.reprintRefreshBtn, 300)) return;
        setReprintFeedback("Printer list refreshed.", "success");
        syncButtonStates();
      });
    }
  }

  function initPartialCloseUi() {
    updatePartialCloseButtonState();

    if (dom.partialUsernameInput) {
      dom.partialUsernameInput.addEventListener("input", () => {
        setPartialFeedback("");
        updatePartialCloseButtonState();
      });
    }

    if (dom.partialCloseSubmitBtn) {
      dom.partialCloseSubmitBtn.addEventListener("click", handlePartialCloseSubmit);
    }

    if (dom.partialRefreshBtn) {
      dom.partialRefreshBtn.addEventListener("click", () => {
        if (!lockButton(dom.partialRefreshBtn, 300)) return;
        updatePartialCloseButtonState();
        setPartialFeedback("Partial-Close data refreshed.", "success");
        syncButtonStates();
      });
    }
  }

  function clearTimer(name) {
    const timerId = runtime.timers[name];
    if (!timerId) return;
    clearTimeout(timerId);
    runtime.timers[name] = null;
  }

  function clearAllTimers() {
    clearTimer("duplicate");
    clearTimer("cycle");
    clearTimer("group");
  }

  function focusScanInput() {
    if (!dom.scanInput || !runtime.isAuthenticated) return;
    setTimeout(() => dom.scanInput.focus(), 0);
  }

  function parseTrayTag(value) {
    const match = /row(\d+)-tray(\d+)/.exec(value || "");
    if (!match) return { row: Number.MAX_SAFE_INTEGER, tray: Number.MAX_SAFE_INTEGER };

    return {
      row: Number(match[1]),
      tray: Number(match[2])
    };
  }

  function getSortedTrayOrder() {
    return Array.from(document.querySelectorAll(".tray-btn")).sort((a, b) => {
      const trayA = parseTrayTag(a.dataset.tray);
      const trayB = parseTrayTag(b.dataset.tray);

      if (trayA.row !== trayB.row) return trayA.row - trayB.row;
      return trayA.tray - trayB.tray;
    });
  }

  function createTrayMatrix() {
    if (!dom.trayGrid) return;

    dom.trayGrid.innerHTML = "";

    for (let tray = CONFIG.traysPerRow; tray >= 1; tray -= 1) {
      for (let row = 1; row <= CONFIG.rows; row += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tray-btn inactive";
        button.dataset.tray = `row${row}-tray${tray}`;
        button.textContent = `Tray-${tray}`;
        dom.trayGrid.append(button);
      }
    }

    runtime.trayOrder = getSortedTrayOrder();
  }

  function renderTrayMatrix() {
    runtime.trayOrder.forEach((trayButton, index) => {
      const isActive = index < state.completedTrays;
      trayButton.classList.toggle("active", isActive);
      trayButton.classList.toggle("inactive", !isActive);
    });
  }

  function activateTray() {
    const trayButton = runtime.trayOrder[state.completedTrays];
    if (!trayButton) return;
    trayButton.classList.remove("inactive");
    trayButton.classList.add("active");
  }

  function deactivateTrayByIndex(index) {
    const trayButton = runtime.trayOrder[index];
    if (!trayButton) return;
    trayButton.classList.remove("active");
    trayButton.classList.add("inactive");
  }

  function updatePositionUI() {
    dom.positionButtons.forEach((button) => {
      button.classList.remove("green");
      button.classList.add("red");
    });

    for (let index = 0; index < state.positionIndex; index += 1) {
      const positionCode = CONFIG.positions[index];
      const button = dom.positionButtons.find((item) => item.dataset.position === positionCode);
      if (!button) continue;
      button.classList.remove("red");
      button.classList.add("green");
    }
  }

  function updateCounters() {
    const trayScanQuantity = state.completedTrays * getTraySize();

    setText(dom.trayCount, state.completedTrays);
    setText(dom.trayScanQty, trayScanQuantity);
    setText(dom.partScanCount, state.partScanCount);
    setText(dom.partOkCount, state.partScanCount);
    setText(dom.partNgCount, 0);
    setText(dom.positionCounter, state.positionIndex);
    setText(dom.reprintScanQty, trayScanQuantity);
    setText(dom.partialScanQty, trayScanQuantity);
    syncButtonStates();
  }

  function updateSessionUI() {
    setText(dom.operatorChip, state.operatorId ? `ID ${state.operatorId}` : "ID");
    setText(dom.mainGroup, state.group);
    setText(dom.mainBlock, state.block);
    setText(dom.reprintGroup, state.group);
    setText(dom.reprintOperator, state.operatorId);
    setText(dom.reprintBlock, state.block);
    setText(dom.partialOperator, state.operatorId);
    setText(dom.partialBlock, state.block);
    setText(dom.mainPrinterIp, state.printerIp);
    setText(dom.partialPrinterIp, state.printerIp);
  }

  function setCarrierId(value) {
    state.carrierId = value;
    setText(dom.carrierId, value);
    setText(dom.partialCarrierId, value);
    setPartialFeedback("");
    updatePartialCloseButtonState();
  }

  function generateCarrierId() {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0")
    ].join("");

    return `AG-${state.block}-${state.group}-${stamp}`;
  }

  function clearScanCollections() {
    state.scannedBarcodes.clear();
    state.scanHistory.length = 0;
  }

  function resetProgressState() {
    state.partScanCount = 0;
    state.positionIndex = 0;
    state.completedTrays = 0;
    state.rowIndex = 0;
  }

  function resetSessionState() {
    state.operatorId = "";
    state.block = "";
    state.group = "";
    state.ano = "";
    state.printerIp = "";
    state.carrierId = "";
  }

  function resetVisualState() {
    updatePositionUI();
    renderTrayMatrix();
    updateCounters();
    setScannedSerial("- -");
    clearScanInputDecoration();
    if (dom.scanInput) dom.scanInput.value = "";
  }

  function resetProduction({ renewCarrier }) {
    resetProgressState();
    resetVisualState();

    if (renewCarrier) {
      setCarrierId(generateCarrierId());
    }
  }

  function showDuplicateError() {
    setStatusMessage("Duplicate Barcode - Already Scanned", "#e53935");

    if (dom.scanInput) {
      dom.scanInput.classList.add("scan-input-error");
    }

    clearTimer("duplicate");
    runtime.timers.duplicate = setTimeout(() => {
      clearScanInputDecoration();
      if (!runtime.scanLocked) {
        setStatusMessage("Ready for scanning");
      } else {
        setStatusMessage(dom.statusMessage?.textContent || "");
      }
      runtime.timers.duplicate = null;
    }, 2000);
  }

  function completeGroup() {
    runtime.scanLocked = true;
    setStatusMessage("Group Completed Successfully");
    syncButtonStates();

    clearTimer("group");
    const groupTimerId = setTimeout(() => {
      clearScanCollections();
      resetProduction({ renewCarrier: true });
      runtime.scanLocked = false;
      setStatusMessage("Ready for scanning");
      syncButtonStates();
      processQueuedScans();
      focusScanInput();
      if (runtime.timers.group === groupTimerId) {
        runtime.timers.group = null;
      }
    }, CONFIG.groupResetDelayMs);
    runtime.timers.group = groupTimerId;
  }

  function completeTrayCycle() {
    runtime.scanLocked = true;
    setStatusMessage("Tray Completed. Preparing next tray...");
    syncButtonStates();
    clearTimer("cycle");
    const cycleTimerId = setTimeout(() => {
      activateTray();
      state.completedTrays += 1;
      state.rowIndex = Math.floor(state.completedTrays / CONFIG.traysPerRow);
      updateCounters();

      if (state.completedTrays >= getTotalTrays()) {
        if (runtime.timers.cycle === cycleTimerId) {
          runtime.timers.cycle = null;
        }
        completeGroup();
        return;
      }

      state.positionIndex = 0;
      updatePositionUI();
      updateCounters();
      runtime.scanLocked = false;
      setStatusMessage("Ready for scanning");
      syncButtonStates();
      processQueuedScans();
      focusScanInput();
      if (runtime.timers.cycle === cycleTimerId) {
        runtime.timers.cycle = null;
      }
    }, CONFIG.cycleDelayMs);
    runtime.timers.cycle = cycleTimerId;
  }

  function processScan(barcode) {
    if (state.scannedBarcodes.has(barcode)) {
      showDuplicateError();
      return false;
    }

    state.scannedBarcodes.add(barcode);
    state.scanHistory.push(barcode);

    state.partScanCount += 1;
    state.positionIndex += 1;

    setScannedSerial(barcode);
    updatePositionUI();
    updateCounters();

    if (state.positionIndex === getTraySize()) {
      completeTrayCycle();
    }

    return true;
  }

  function processQueuedScans() {
    if (!runtime.isAuthenticated || runtime.scanLocked) return;

    while (runtime.scanQueue.length > 0 && !runtime.scanLocked) {
      const nextBarcode = runtime.scanQueue.shift();
      processScan(nextBarcode);
    }
  }

  function handleScan(rawBarcode) {
    if (!runtime.isAuthenticated) return;

    const barcode = normalizeBarcode(rawBarcode);
    if (!barcode) {
      setStatusMessage("Scan value is required.", "#c62828");
      return;
    }

    if (runtime.scanLocked) {
      enqueueScan(barcode);
      return;
    }

    processScan(barcode);
  }

  function ungroupTray() {
    if (!runtime.isAuthenticated) return;

    const confirmed = window.confirm("Are you sure you want to ungroup the tray?");
    if (!confirmed) return;

    if (state.completedTrays === 0) {
      setStatusMessage("At least one completed tray is required to ungroup.", "#c62828");
      return;
    }

    if (!lockButton(dom.ungroupTrayBtn, 450)) return;

    const traySize = getTraySize();
    const lastTrayEnd = state.completedTrays * traySize;
    const lastTrayStart = lastTrayEnd - traySize;

    if (lastTrayStart < 0 || state.scanHistory.length < lastTrayEnd) {
      setStatusMessage("Tray boundary error. Unable to ungroup tray.", "#c62828");
      syncButtonStates();
      return;
    }

    clearAllTimers();
    runtime.scanLocked = false;
    const removedBarcodes = state.scanHistory.splice(lastTrayStart, traySize);
    removedBarcodes.forEach((barcode) => state.scannedBarcodes.delete(barcode));

    state.partScanCount = Math.max(0, state.scanHistory.length);
    state.completedTrays = Math.floor(state.partScanCount / traySize);
    state.positionIndex = state.partScanCount % getTraySize();
    state.rowIndex = Math.floor(state.completedTrays / CONFIG.traysPerRow);

    renderTrayMatrix();
    updatePositionUI();
    updateCounters();
    setScannedSerial(state.scanHistory[state.scanHistory.length - 1] || "- -");
    setStatusMessage("Tray Ungrouped Successfully");
    focusScanInput();
  }

  function handleRefresh() {
    if (!runtime.isAuthenticated) return;
    if (!lockButton(dom.refreshBtn, 450)) return;

    clearAllTimers();
    runtime.scanLocked = false;

    clearScanQueue();
    clearScanCollections();
    resetProgressState();
    resetVisualState();

    setStatusMessage("Session Refreshed Successfully", "#2e7d32");
    setReprintFeedback("");
    setPartialFeedback("");
    updateReprintButtonState();
    updatePartialCloseButtonState();
    focusScanInput();
  }

  function ungroupPart() {
    if (!runtime.isAuthenticated) return;

    const confirmed = window.confirm("Are you sure you want to ungroup the part?");
    if (!confirmed) return;

    if (state.scanHistory.length === 0 || state.partScanCount === 0) {
      setStatusMessage("No scanned part to ungroup.", "#c62828");
      return;
    }

    if (!lockButton(dom.ungroupPartBtn, 450)) return;

    clearAllTimers();
    runtime.scanLocked = false;

    const lastBarcode = state.scanHistory.pop();
    if (lastBarcode) {
      state.scannedBarcodes.delete(lastBarcode);
    }

    const previousCompletedTrays = state.completedTrays;

    state.partScanCount = Math.max(0, state.scanHistory.length);
    state.completedTrays = Math.floor(state.partScanCount / getTraySize());
    state.positionIndex = state.partScanCount % getTraySize();
    state.rowIndex = Math.floor(state.completedTrays / CONFIG.traysPerRow);

    if (state.completedTrays < previousCompletedTrays) {
      deactivateTrayByIndex(previousCompletedTrays - 1);
    }

    renderTrayMatrix();
    updatePositionUI();
    updateCounters();

    const latest = state.scanHistory[state.scanHistory.length - 1] || "- -";
    setScannedSerial(latest);
    setStatusMessage("Part Ungrouped Successfully");
    focusScanInput();
  }

  function clearInputFields() {
    if (dom.scanInput) {
      dom.scanInput.value = "";
    }
    if (dom.reprintScanCarrierInput) {
      dom.reprintScanCarrierInput.value = "";
      updateReprintButtonState();
      setReprintFeedback("");
    }
    if (dom.partialUsernameInput) {
      dom.partialUsernameInput.value = "";
    }
    setPartialFeedback("");
    if (dom.loginPassword) {
      dom.loginPassword.value = "";
      dom.loginPassword.type = "password";
      syncPasswordToggleState();
    }
    if (dom.loginOperator) {
      dom.loginOperator.value = "";
    }
    if (dom.loginBlock) {
      dom.loginBlock.selectedIndex = 0;
      populateGroupDropdown(dom.loginBlock.value);
    } else if (dom.loginGroup) {
      dom.loginGroup.selectedIndex = 0;
    }
    updatePartialCloseButtonState();
    clearScanInputDecoration();
  }

  function logout() {
    clearAllTimers();
    clearButtonLocks();
    runtime.isAuthenticated = false;
    runtime.scanLocked = false;

    clearScanQueue();
    clearScanCollections();
    resetProgressState();
    resetSessionState();
    clearInputFields();
    setLoginFeedback("");
    setCarrierId("");
    resetVisualState();
    updateSessionUI();
    setStatusMessage("Ready for scanning");

    window.location.hash = "#login";
    window.history.replaceState(null, null, "#login");
    applyRouteGuard();
  }

  function validateLogin() {
    const operator = (dom.loginOperator?.value || "").trim();
    const password = (dom.loginPassword?.value || "").trim();
    const group = (dom.loginGroup?.value || "").trim();
    const block = (dom.loginBlock?.value || "").trim();

    if (!group || !block) return "Select group and block.";
    if (!/^\d{3,10}$/.test(operator)) return "Operator ID must be 3-10 digits.";
    if (password.length < 3) return "Password must be at least 3 characters.";

    return "";
  }

  function applyLoginContext() {
    state.operatorId = (dom.loginOperator?.value || defaults.operator).trim();
    state.group = (dom.loginGroup?.value || defaults.group).trim();
    state.block = (dom.loginBlock?.value || defaults.block).trim();
    state.ano = (state.block.split("-")[0] || state.block).trim();
    state.printerIp = defaults.printerIp;
  }

  function handleLogin() {
    const validationError = validateLogin();
    if (validationError) {
      setLoginFeedback(validationError);
      return;
    }

    if (!lockButton(dom.loginSubmit, 900)) return;
    setLoginFeedback("Authenticating...");

    setTimeout(() => {
      clearAllTimers();
      runtime.isAuthenticated = true;
      runtime.scanLocked = false;
      applyLoginContext();
      updateSessionUI();

      clearScanCollections();
      resetProduction({ renewCarrier: true });

      setLoginFeedback("");
      setStatusMessage("Ready for scanning");
      syncButtonStates();

      window.location.hash = "#main";
      applyRouteGuard();
    }, 200);
  }

  function applyRouteGuard() {
    const currentHash = window.location.hash || "#login";
    const validHash = CONFIG.routes.includes(currentHash) ? currentHash : "#login";
    const targetHash = runtime.isAuthenticated
      ? (validHash === "#login" && window.location.hash !== "#login" ? "#main" : validHash)
      : "#login";

    if (targetHash !== currentHash) {
      window.location.hash = targetHash;
      return;
    }

    dom.pages.forEach((page) => {
      page.classList.toggle("is-active", `#${page.id}` === targetHash);
    });

    if (targetHash === "#main") {
      focusScanInput();
    }

    syncButtonStates();
  }

  function bindEvents() {
    if (runtime.eventsBound) return;
    runtime.eventsBound = true;

    dom.routeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const route = button.getAttribute("data-route");
        if (!route) return;
        window.location.hash = route;
      });
    });

    dom.floatButtons.forEach((button) => {
      button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    });

    if (dom.scanInput) {
      dom.scanInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        handleScan(dom.scanInput.value);
        dom.scanInput.value = "";
      });
    }

    if (dom.loginSubmit) {
      dom.loginSubmit.addEventListener("click", handleLogin);
    }

    if (dom.loginPassword) {
      dom.loginPassword.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        handleLogin();
      });
    }

    if (dom.loginBlock) {
      dom.loginBlock.addEventListener("change", (event) => {
        handleAnoChange(event.target.value);
      });
    }

    if (dom.logoutBtn) {
      dom.logoutBtn.addEventListener("click", logout);
    }

    if (dom.refreshBtn) {
      dom.refreshBtn.addEventListener("click", handleRefresh);
    }

    const ungroupTrayButton = document.getElementById("ungroupTrayBtn") || dom.ungroupTrayBtn;
    const ungroupPartButton = document.getElementById("ungroupPartBtn") || dom.ungroupPartBtn;

    if (ungroupTrayButton) {
      ungroupTrayButton.addEventListener("click", ungroupTray);
    }

    if (ungroupPartButton) {
      ungroupPartButton.addEventListener("click", ungroupPart);
    }

    initLoginUiEnhancements();
    initReprintUi();
    initPartialCloseUi();
    window.addEventListener("hashchange", applyRouteGuard);
  }

  function updateClock() {
    if (!dom.liveTime) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    dom.liveTime.textContent = `${hh}:${mm}:${ss}`;
  }

  function init() {
    if (dom.loginBlock) {
      populateGroupDropdown(dom.loginBlock.value || "ANO-1", dom.loginGroup?.value || "");
    }

    createTrayMatrix();
    resetProgressState();
    updatePositionUI();
    renderTrayMatrix();
    updateCounters();
    setScannedSerial("- -");
    setStatusMessage("Ready for scanning");
    updateClock();
    setInterval(updateClock, 1000);
    bindEvents();
    syncButtonStates();
    applyRouteGuard();
  }

  init();
})();
