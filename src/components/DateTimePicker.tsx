import React, { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, X, Check, CalendarDays, ArrowRight } from "lucide-react";

interface DateTimePickerProps {
  value: string; // "YYYY-MM-DDTHH:mm" or ""
  onChange: (val: string) => void;
  placeholder?: string;
  surfaceColor?: string;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const normalizeHexColor = (color?: string): string | null => {
  if (!color) return null;
  const raw = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const normalized = raw.length === 3
    ? raw.split("").map((char) => char + char).join("")
    : raw;
  return `#${normalized.toLowerCase()}`;
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const raw = normalized.slice(1);
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
};

const mixHexColors = (base: string, target: string, ratio: number) => {
  const baseRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);
  if (!baseRgb || !targetRgb) return base;
  const weight = Math.max(0, Math.min(1, ratio));
  const mixChannel = (from: number, to: number) => Math.round(from + (to - from) * weight);
  return `#${[mixChannel(baseRgb.r, targetRgb.r), mixChannel(baseRgb.g, targetRgb.g), mixChannel(baseRgb.b, targetRgb.b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
};

const getColorLuminance = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const toLinear = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export default function DateTimePicker({ value, onChange, placeholder = "Sin límite de fecha", surfaceColor }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Parse initial or current value
  const getParsedDateState = (valStr: string) => {
    const now = new Date();
    if (!valStr) {
      return {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate(),
        hours: 23,
        minutes: 59,
        hasValue: false,
      };
    }
    
    try {
      // Expected format: YYYY-MM-DDTHH:mm or YYYY-MM-DD
      const parts = valStr.split("T");
      const dateParts = parts[0].split("-");
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1; // 0-indexed
      const day = parseInt(dateParts[2], 10);
      
      let hours = 23;
      let minutes = 59;
      if (parts[1]) {
        const timeParts = parts[1].split(":");
        hours = parseInt(timeParts[0], 10);
        minutes = parseInt(timeParts[1], 10);
      }
      
      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
        return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate(), hours: 23, minutes: 59, hasValue: false };
      }
      return { year, month, day, hours, minutes, hasValue: true };
    } catch (e) {
      return {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate(),
        hours: 23,
        minutes: 59,
        hasValue: false,
      };
    }
  };

  const currentParsedState = getParsedDateState(value);

  // States for viewing/browsing the calendar (independent of the exact saved value if no value exists)
  const [viewYear, setViewYear] = useState(currentParsedState.year);
  const [viewMonth, setViewMonth] = useState(currentParsedState.month);
  
  // Temporary states for selections before confirming or auto-applying
  const [selectedDay, setSelectedDay] = useState<number | null>(currentParsedState.hasValue ? currentParsedState.day : null);
  const [selectedYear, setSelectedYear] = useState<number>(currentParsedState.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentParsedState.month);
  const [selectedHours, setSelectedHours] = useState<number>(currentParsedState.hours);
  const [selectedMinutes, setSelectedMinutes] = useState<number>(currentParsedState.minutes);

  const containerRef = useRef<HTMLDivElement>(null);

  // Update selection states when input value prop changes
  useEffect(() => {
    const s = getParsedDateState(value);
    setSelectedYear(s.year);
    setSelectedMonth(s.month);
    setSelectedDay(s.hasValue ? s.day : null);
    setSelectedHours(s.hours);
    setSelectedMinutes(s.minutes);
    
    // Also align the calendar view to parsed state if there is a value
    if (s.hasValue) {
      setViewYear(s.year);
      setViewMonth(s.month);
    }
  }, [value]);

  // Click outside listener to close the calendar picker
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Format state to standard datetime-local string format
  const formatValue = (yr: number, mo: number, dy: number, hr: number, mn: number): string => {
    const yearStr = String(yr).padStart(4, "0");
    const monthStr = String(mo + 1).padStart(2, "0");
    const dayStr = String(dy).padStart(2, "0");
    const hourStr = String(hr).padStart(2, "0");
    const minuteStr = String(mn).padStart(2, "0");
    return `${yearStr}-${monthStr}-${dayStr}T${hourStr}:${minuteStr}`;
  };

  // Switch month
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  // Build the 6-row 7-col calendar layout
  const getCalendarCells = () => {
    const cells: Array<{ day: number; isCurrentMonth: boolean; month: number; year: number }> = [];
    
    // First day of current view month
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    // Adjust so Monday = 0, Sunday = 6
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    
    // Previous month details
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    
    // Next month details
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;

    // 1. Fill previous month's trailing days
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        month: prevMonth,
        year: prevYear
      });
    }

    // 2. Fill current month's days
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({
        day: i,
        isCurrentMonth: true,
        month: viewMonth,
        year: viewYear
      });
    }

    // 3. Fill next month's leading days to complete grid cells (total 42 cells)
    const remainingCount = 42 - cells.length;
    for (let i = 1; i <= remainingCount; i++) {
      cells.push({
        day: i,
        isCurrentMonth: false,
        month: nextMonth,
        year: nextYear
      });
    }

    return cells;
  };

  // Handle day click
  const handleDaySelect = (dayNum: number, mOffset: number, yOffset: number) => {
    setSelectedDay(dayNum);
    setSelectedMonth(mOffset);
    setSelectedYear(yOffset);
    
    // Keep browsing in the clicked month
    setViewMonth(mOffset);
    setViewYear(yOffset);

    // Auto-apply selection with currently chosen hours/minutes
    const newVal = formatValue(yOffset, mOffset, dayNum, selectedHours, selectedMinutes);
    onChange(newVal);
  };

  // Handle Hour shift
  const handleHourChange = (hr: number) => {
    const h = Math.max(0, Math.min(23, hr));
    setSelectedHours(h);
    if (selectedDay !== null) {
      const newVal = formatValue(selectedYear, selectedMonth, selectedDay, h, selectedMinutes);
      onChange(newVal);
    }
  };

  // Handle Minute shift
  const handleMinuteChange = (mn: number) => {
    const m = Math.max(0, Math.min(59, mn));
    setSelectedMinutes(m);
    if (selectedDay !== null) {
      const newVal = formatValue(selectedYear, selectedMonth, selectedDay, selectedHours, m);
      onChange(newVal);
    }
  };

  // Clear limit date
  const handleClear = () => {
    setSelectedDay(null);
    onChange("");
    setIsOpen(false);
  };

  // Quick preset helper
  const applyPresetDays = (daysFromNow: number) => {
    const target = new Date();
    target.setDate(target.getDate() + daysFromNow);
    target.setHours(23, 59, 0, 0);
    
    const yr = target.getFullYear();
    const mo = target.getMonth();
    const dy = target.getDate();
    const hr = 23;
    const mn = 59;
    
    setSelectedYear(yr);
    setSelectedMonth(mo);
    setSelectedDay(dy);
    setSelectedHours(hr);
    setSelectedMinutes(mn);
    
    setViewYear(yr);
    setViewMonth(mo);
    
    onChange(formatValue(yr, mo, dy, hr, mn));
  };

  // Format date readable for Spanish
  const getReadableValue = () => {
    if (!value || selectedDay === null || isNaN(selectedDay) || isNaN(selectedMonth) || isNaN(selectedYear)) return placeholder;
    try {
      const d = new Date(selectedYear, selectedMonth, selectedDay, selectedHours, selectedMinutes);
      const dayName = d.toLocaleDateString("es-ES", { weekday: "short" });
      const monthName = MONTH_NAMES[selectedMonth];
      const hrsStr = String(selectedHours).padStart(2, "0");
      const minsStr = String(selectedMinutes).padStart(2, "0");
      return `${selectedDay} de ${monthName}, ${selectedYear} a las ${hrsStr}:${minsStr} (${dayName})`;
    } catch (e) {
      return value;
    }
  };

  const isToday = (dy: number, mo: number, yr: number) => {
    const today = new Date();
    return today.getDate() === dy && today.getMonth() === mo && today.getFullYear() === yr;
  };

  const isSelected = (dy: number, mo: number, yr: number) => {
    return selectedDay === dy && selectedMonth === mo && selectedYear === yr;
  };

  const yearsRange = [];
  const currentYr = new Date().getFullYear();
  for (let y = currentYr; y <= currentYr + 10; y++) {
    yearsRange.push(y);
  }

  const resolvedSurfaceColor = normalizeHexColor(surfaceColor);
  const isSurfaceLight = resolvedSurfaceColor ? getColorLuminance(resolvedSurfaceColor) > 0.58 : false;
  const panelBg = resolvedSurfaceColor ?? "#050505";
  const triggerBg = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#000000" : "#ffffff", isSurfaceLight ? 0.08 : 0.06)
    : "#0d0d0d";
  const headerBg = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#000000" : "#ffffff", isSurfaceLight ? 0.08 : 0.05)
    : "#0d0d0d";
  const sectionBg = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#000000" : "#ffffff", isSurfaceLight ? 0.05 : 0.03)
    : "rgba(255,255,255,0.01)";
  const cardBg = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#000000" : "#ffffff", isSurfaceLight ? 0.12 : 0.08)
    : "#0a0a0a";
  const borderColor = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#000000" : "#ffffff", isSurfaceLight ? 0.22 : 0.16)
    : "rgba(255,255,255,0.15)";
  const subtleBorder = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#000000" : "#ffffff", isSurfaceLight ? 0.18 : 0.12)
    : "rgba(255,255,255,0.10)";
  const faintBorder = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#000000" : "#ffffff", isSurfaceLight ? 0.12 : 0.08)
    : "rgba(255,255,255,0.05)";
  const textPrimary = resolvedSurfaceColor ? (isSurfaceLight ? "#111111" : "#ffffff") : "#ffffff";
  const textSoft = resolvedSurfaceColor ? (isSurfaceLight ? "rgba(17,17,17,0.78)" : "rgba(255,255,255,0.78)") : "rgba(255,255,255,0.78)";
  const textMuted = resolvedSurfaceColor ? (isSurfaceLight ? "rgba(17,17,17,0.52)" : "rgba(255,255,255,0.42)") : "rgba(255,255,255,0.40)";
  const textFaint = resolvedSurfaceColor ? (isSurfaceLight ? "rgba(17,17,17,0.28)" : "rgba(255,255,255,0.22)") : "rgba(255,255,255,0.20)";
  const todayBorder = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#000000" : "#ffffff", isSurfaceLight ? 0.35 : 0.5)
    : "rgba(255,255,255,0.40)";
  const destructiveBg = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#dc2626" : "#7f1d1d", isSurfaceLight ? 0.12 : 0.18)
    : undefined;
  const destructiveBorder = resolvedSurfaceColor
    ? mixHexColors(panelBg, isSurfaceLight ? "#991b1b" : "#fca5a5", isSurfaceLight ? 0.20 : 0.24)
    : undefined;
  const destructiveText = resolvedSurfaceColor ? (isSurfaceLight ? "#7f1d1d" : "#fecaca") : undefined;
  const buttonAccent = resolvedSurfaceColor
    ? (isSurfaceLight ? panelBg : mixHexColors(panelBg, "#ffffff", 0.45))
    : "var(--accent, #f5f011)";
  const selectedCellBg = "#000000";
  const selectedCellAccent = buttonAccent;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button Field styled exactly as requested */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer select-none"
        style={{
          backgroundColor: triggerBg,
          border: `1px solid ${subtleBorder}`,
          color: textPrimary,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {selectedDay !== null ? (
            <CalendarDays className="w-4 h-4 shrink-0" style={{ color: textPrimary }} />
          ) : (
            <CalendarIcon className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
          )}
          <span
            className={`truncate font-medium ${selectedDay !== null ? "font-semibold" : ""}`}
            style={{ color: selectedDay !== null ? textPrimary : textMuted }}
          >
            {getReadableValue()}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 pl-2" style={{ color: textMuted }}>
          {selectedDay !== null && (
            <span 
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-1 rounded-md transition-colors"
              style={{ color: destructiveText || "rgba(248,113,113,0.7)" }}
              title="Quitar límite de fecha"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={{
              backgroundColor: sectionBg,
              border: `1px solid ${faintBorder}`,
              color: textMuted,
            }}
          >
            {selectedDay !== null ? "CAMBIAR" : "ABRIR CALENDARIO"}
          </span>
        </div>
      </button>

      {/* Graphical Calendar Popover Panel matching our high-end interface */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 lg:right-auto lg:w-[350px] mt-2 rounded-2xl z-50 overflow-hidden animate-fade-in divide-y divide-white/5 font-sans"
          style={{
            backgroundColor: panelBg,
            border: `1px solid ${borderColor}`,
            boxShadow: isSurfaceLight ? "0 20px 50px rgba(0,0,0,0.28)" : "0 20px 50px rgba(0,0,0,0.8)",
            color: textPrimary,
          }}
        >
          
          {/* Section: Month and Year selectors header */}
          <div className="p-3 flex items-center justify-between" style={{ backgroundColor: headerBg }}>
            <div className="flex items-center gap-1">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs font-bold border-0 py-0.5 px-1 pr-5 focus:ring-0 cursor-pointer text-left"
                style={{ color: textPrimary }}
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx} className="py-1">{m}</option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs border-0 py-0.5 px-1 pr-5 focus:ring-0 cursor-pointer"
                style={{ color: textMuted }}
              >
                {yearsRange.map(yr => (
                  <option key={yr} value={yr} className="py-1">{yr}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg transition-all cursor-pointer"
                style={{
                  backgroundColor: sectionBg,
                  color: textSoft,
                  border: `1px solid ${faintBorder}`,
                }}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg transition-all cursor-pointer"
                style={{
                  backgroundColor: sectionBg,
                  color: textSoft,
                  border: `1px solid ${faintBorder}`,
                }}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Section: Days of the Week headers */}
          <div className="p-3">
            <div
              className="grid grid-cols-7 gap-1 text-center mb-1 text-[10px] font-bold uppercase tracking-widest leading-none"
              style={{ color: textMuted }}
            >
              {WEEK_DAYS.map(day => (
                <div key={day} className="py-1">{day}</div>
              ))}
            </div>

            {/* Section: 6-row Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {getCalendarCells().map((cell, idx) => {
                const cellIsSelected = isSelected(cell.day, cell.month, cell.year);
                const cellIsToday = isToday(cell.day, cell.month, cell.year);
                
                return (
                  <button
                    key={`${cell.year}-${cell.month}-${cell.day}-${idx}`}
                    type="button"
                    onClick={() => handleDaySelect(cell.day, cell.month, cell.year)}
                    className="aspect-square p-0 rounded-lg text-xs transition-all relative cursor-pointer flex items-center justify-center hover:brightness-95"
                    style={{
                      color: !cell.isCurrentMonth
                        ? textFaint
                        : cellIsSelected
                          ? selectedCellAccent
                          : cellIsToday
                            ? textPrimary
                            : textSoft,
                      backgroundColor: cellIsSelected
                        ? selectedCellBg
                        : cellIsToday
                          ? cardBg
                          : "transparent",
                      backgroundImage: cellIsSelected
                        ? `repeating-linear-gradient(119deg, ${selectedCellAccent} 0px, ${selectedCellAccent} 1px, transparent 1px, transparent 8px)`
                        : undefined,
                      border: cellIsSelected
                        ? `1px solid ${selectedCellAccent}`
                        : cellIsToday && !cellIsSelected
                          ? `1px solid ${todayBorder}`
                          : "1px solid transparent",
                      boxShadow: cellIsSelected
                        ? (isSurfaceLight ? "0 8px 18px rgba(0,0,0,0.18)" : "0 8px 18px rgba(0,0,0,0.42)")
                        : undefined,
                      fontWeight: cellIsSelected ? 800 : 500,
                    }}
                  >
                    <div style={{ color: "inherit" }}>{cell.day}</div>
                    {cellIsToday && !cellIsSelected && (
                      <span className="absolute bottom-1 w-1 h-0.5 rounded-full" style={{ backgroundColor: textPrimary }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Quick Presets */}
          <div className="p-2.5 flex flex-wrap items-center gap-1.5 justify-center" style={{ backgroundColor: sectionBg }}>
            <button
              type="button"
              onClick={() => applyPresetDays(0)}
              className="px-2 py-1 text-[9px] font-semibold rounded-md transition-all cursor-pointer uppercase tracking-wider"
              style={{
                backgroundColor: cardBg,
                border: `1px solid ${faintBorder}`,
                color: textSoft,
              }}
            >
              Hoy (Fin del día)
            </button>
            <button
              type="button"
              onClick={() => applyPresetDays(1)}
              className="px-2 py-1 text-[9px] font-semibold rounded-md transition-all cursor-pointer uppercase tracking-wider"
              style={{
                backgroundColor: cardBg,
                border: `1px solid ${faintBorder}`,
                color: textSoft,
              }}
            >
              Mañana
            </button>
            <button
              type="button"
              onClick={() => applyPresetDays(7)}
              className="px-2 py-1 text-[9px] font-semibold rounded-md transition-all cursor-pointer uppercase tracking-wider"
              style={{
                backgroundColor: cardBg,
                border: `1px solid ${faintBorder}`,
                color: textSoft,
              }}
            >
              En 1 Semana
            </button>
          </div>

          {/* Section: Time custom dial configuration */}
          <div className="p-3 space-y-2" style={{ backgroundColor: sectionBg }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5" style={{ color: textMuted }}>
                <Clock className="w-3.5 h-3.5" style={{ color: textMuted }} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Hora Límite (24H)</span>
              </div>
              <span className="text-xs font-mono font-bold" style={{ color: textPrimary }}>
                {String(selectedHours).padStart(2, "0")}:{String(selectedMinutes).padStart(2, "0")}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Hour Scroll/Slider Dial */}
              <div
                className="flex-1 flex flex-col gap-1 rounded-xl p-1.5 text-center"
                style={{ backgroundColor: cardBg, border: `1px solid ${faintBorder}` }}
              >
                <span className="text-[9px] uppercase font-semibold" style={{ color: textMuted }}>Hora</span>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleHourChange(selectedHours - 1 < 0 ? 23 : selectedHours - 1)}
                    className="w-6 h-6 rounded-lg transition-all font-bold text-xs select-none cursor-pointer"
                    style={{ color: textMuted }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={selectedHours}
                    onChange={(e) => handleHourChange(parseInt(e.target.value, 10) || 0)}
                    className="w-10 bg-transparent text-center text-xs font-mono font-bold focus:outline-none border-0 p-0"
                    style={{ color: textPrimary }}
                  />
                  <button
                    type="button"
                    onClick={() => handleHourChange((selectedHours + 1) % 24)}
                    className="w-6 h-6 rounded-lg transition-all font-bold text-xs select-none cursor-pointer"
                    style={{ color: textMuted }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Minute Scroll/Slider Dial */}
              <div
                className="flex-1 flex flex-col gap-1 rounded-xl p-1.5 text-center"
                style={{ backgroundColor: cardBg, border: `1px solid ${faintBorder}` }}
              >
                <span className="text-[9px] uppercase font-semibold" style={{ color: textMuted }}>Minutos</span>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleMinuteChange(selectedMinutes - 5 < 0 ? 55 : selectedMinutes - 5)}
                    className="w-6 h-6 rounded-lg transition-all font-bold text-xs select-none cursor-pointer"
                    style={{ color: textMuted }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={selectedMinutes}
                    onChange={(e) => handleMinuteChange(parseInt(e.target.value, 10) || 0)}
                    className="w-10 bg-transparent text-center text-xs font-mono font-bold focus:outline-none border-0 p-0"
                    style={{ color: textPrimary }}
                  />
                  <button
                    type="button"
                    onClick={() => handleMinuteChange((selectedMinutes + 5) % 60)}
                    className="w-6 h-6 rounded-lg transition-all font-bold text-xs select-none cursor-pointer"
                    style={{ color: textMuted }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="p-3 flex items-center justify-between gap-2" style={{ backgroundColor: headerBg }}>
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              style={resolvedSurfaceColor ? {
                backgroundColor: destructiveBg,
                border: `1px solid ${destructiveBorder}`,
                color: destructiveText,
              } : undefined}
            >
              Quitar Límite
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedDay === null) {
                  // If closing without selected day, select today
                  const t = new Date();
                  handleDaySelect(t.getDate(), t.getMonth(), t.getFullYear());
                }
                setIsOpen(false);
              }}
              className="flex-1 h-[38px] font-mono tracking-widest text-[11px] uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden"
              style={{
                '--btn-color': buttonAccent,
              } as React.CSSProperties}
            >
              <div className="absolute inset-0 bg-[#000000] border border-black group-hover:bg-transparent group-hover:border-transparent transition-all duration-300 rounded-[4px] pointer-events-none" />
              <div
                className="absolute inset-[1px] bg-[#000000] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px] stripes-overlay"
                style={{
                  backgroundImage: "repeating-linear-gradient(119deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 10px)",
                }}
              />
              <span className="btn-motion-corner btn-motion-corner-tl" />
              <span className="btn-motion-corner btn-motion-corner-tr" />
              <span className="btn-motion-corner btn-motion-corner-bl" />
              <span className="btn-motion-corner btn-motion-corner-br" />

              <span className="relative z-10 flex items-center justify-center gap-1.5 font-extrabold transition-colors duration-300 font-mono hover-text-adaptive btn-text-content">
                <Check className="w-3.5 h-3.5 stroke-[3px]" />
                <span>Confirmar</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
