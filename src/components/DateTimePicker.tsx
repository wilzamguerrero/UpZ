import React, { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, X, Check, CalendarDays, ArrowRight } from "lucide-react";

interface DateTimePickerProps {
  value: string; // "YYYY-MM-DDTHH:mm" or ""
  onChange: (val: string) => void;
  placeholder?: string;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function DateTimePicker({ value, onChange, placeholder = "Sin límite de fecha" }: DateTimePickerProps) {
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
    if (!value || selectedDay === null) return placeholder;
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

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button Field styled exactly as requested */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#0d0d0d] border border-white/10 hover:border-white/20 hover:bg-white/[0.02] rounded-xl text-left text-xs text-white transition-all cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {selectedDay !== null ? (
            <CalendarDays className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <CalendarIcon className="w-4 h-4 text-white/30 shrink-0" />
          )}
          <span className={`truncate font-medium ${selectedDay !== null ? "text-white font-semibold" : "text-white/40"}`}>
            {getReadableValue()}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-white/30 hover:text-white/60 pl-2">
          {selectedDay !== null && (
            <span 
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-1 hover:bg-white/10 rounded-md transition-colors text-red-400/70 hover:text-red-400"
              title="Quitar límite de fecha"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <span className="text-[10px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white/40 font-mono">
            {selectedDay !== null ? "CAMBIAR" : "ABRIR CALENDARIO"}
          </span>
        </div>
      </button>

      {/* Graphical Calendar Popover Panel matching our high-end interface */}
      {isOpen && (
        <div className="absolute left-0 right-0 lg:right-auto lg:w-[350px] mt-2 bg-[#050505] border border-white/15 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-50 overflow-hidden animate-fade-in divide-y divide-white/5 font-sans">
          
          {/* Section: Month and Year selectors header */}
          <div className="p-3 bg-[#0d0d0d] flex items-center justify-between">
            <div className="flex items-center gap-1">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs font-bold text-white border-0 py-0.5 px-1 pr-5 focus:ring-0 cursor-pointer text-left"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx} className="bg-[#050505] text-white py-1">{m}</option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs text-white/55 border-0 py-0.5 px-1 pr-5 focus:ring-0 cursor-pointer"
              >
                {yearsRange.map(yr => (
                  <option key={yr} value={yr} className="bg-[#050505] text-white py-1">{yr}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-white/5 text-white/60 hover:text-white border border-white/5 hover:border-white/10 rounded-lg transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-white/5 text-white/60 hover:text-white border border-white/5 hover:border-white/10 rounded-lg transition-all cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Section: Days of the Week headers */}
          <div className="p-3">
            <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[10px] font-bold text-white/30 uppercase tracking-widest leading-none">
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
                    className={`aspect-square p-0 rounded-lg text-xs transition-all relative font-medium cursor-pointer flex items-center justify-center ${
                      !cell.isCurrentMonth 
                        ? "text-white/20 hover:text-white/40 hover:bg-white/[0.02]" 
                        : cellIsSelected
                          ? "bg-white text-black font-bold shadow-lg shadow-white/10" 
                          : cellIsToday 
                            ? "bg-white/10 text-white border border-emerald-500/40 font-bold" 
                            : "text-white/80 hover:bg-[#111111] hover:text-white"
                    }`}
                  >
                    <span>{cell.day}</span>
                    {cellIsToday && !cellIsSelected && (
                      <span className="absolute bottom-1 w-1 h-0.5 rounded-full bg-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Quick Presets */}
          <div className="p-2.5 bg-white/[0.01] flex flex-wrap items-center gap-1.5 justify-center">
            <button
              type="button"
              onClick={() => applyPresetDays(0)}
              className="px-2 py-1 bg-white/5 hover:bg-white/10 text-[9px] font-semibold text-white/70 hover:text-white rounded-md transition-all cursor-pointer uppercase tracking-wider"
            >
              Hoy (Fin del día)
            </button>
            <button
              type="button"
              onClick={() => applyPresetDays(1)}
              className="px-2 py-1 bg-white/5 hover:bg-white/10 text-[9px] font-semibold text-white/70 hover:text-white rounded-md transition-all cursor-pointer uppercase tracking-wider"
            >
              Mañana
            </button>
            <button
              type="button"
              onClick={() => applyPresetDays(7)}
              className="px-2 py-1 bg-white/5 hover:bg-white/10 text-[9px] font-semibold text-white/70 hover:text-white rounded-md transition-all cursor-pointer uppercase tracking-wider"
            >
              En 1 Semana
            </button>
          </div>

          {/* Section: Time custom dial configuration */}
          <div className="p-3 bg-white/[0.02] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white/40">
                <Clock className="w-3.5 h-3.5 text-white/50" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Hora Límite (24H)</span>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {String(selectedHours).padStart(2, "0")}:{String(selectedMinutes).padStart(2, "0")}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Hour Scroll/Slider Dial */}
              <div className="flex-1 flex flex-col gap-1 bg-[#0a0a0a] border border-white/5 rounded-xl p-1.5 text-center">
                <span className="text-[9px] text-white/30 uppercase font-semibold">Hora</span>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleHourChange(selectedHours - 1 < 0 ? 23 : selectedHours - 1)}
                    className="w-6 h-6 hover:bg-white/5 text-white/40 hover:text-white rounded-lg transition-all font-bold text-xs select-none cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={selectedHours}
                    onChange={(e) => handleHourChange(parseInt(e.target.value, 10) || 0)}
                    className="w-10 bg-transparent text-center text-xs font-mono font-bold focus:outline-none border-0 p-0 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleHourChange((selectedHours + 1) % 24)}
                    className="w-6 h-6 hover:bg-white/5 text-white/40 hover:text-white rounded-lg transition-all font-bold text-xs select-none cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Minute Scroll/Slider Dial */}
              <div className="flex-1 flex flex-col gap-1 bg-[#0a0a0a] border border-white/5 rounded-xl p-1.5 text-center">
                <span className="text-[9px] text-white/30 uppercase font-semibold">Minutos</span>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleMinuteChange(selectedMinutes - 5 < 0 ? 55 : selectedMinutes - 5)}
                    className="w-6 h-6 hover:bg-white/5 text-white/40 hover:text-white rounded-lg transition-all font-bold text-xs select-none cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={selectedMinutes}
                    onChange={(e) => handleMinuteChange(parseInt(e.target.value, 10) || 0)}
                    className="w-10 bg-transparent text-center text-xs font-mono font-bold focus:outline-none border-0 p-0 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleMinuteChange((selectedMinutes + 5) % 60)}
                    className="w-6 h-6 hover:bg-white/5 text-white/40 hover:text-white rounded-lg transition-all font-bold text-xs select-none cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="p-3 bg-[#0a0a0a] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 py-2 px-3 text-red-400 hover:text-red-350 bg-red-950/20 border border-red-900/10 hover:border-red-900/30 rounded-xl text-xs font-semibold hover:bg-red-950/30 transition-all cursor-pointer"
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
              className="flex-1 py-2 px-3 bg-white hover:bg-white/90 text-black rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-black stroke-[3px]" />
              <span>Confirmar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
