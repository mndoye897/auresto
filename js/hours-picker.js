const DAYS = [
  { key: 'lun', label: 'Lundi' },
  { key: 'mar', label: 'Mardi' },
  { key: 'mer', label: 'Mercredi' },
  { key: 'jeu', label: 'Jeudi' },
  { key: 'ven', label: 'Vendredi' },
  { key: 'sam', label: 'Samedi' },
  { key: 'dim', label: 'Dimanche' }
];

const PRESETS = {
  everyday: { days: DAYS.map(d => d.key), from: '11:00', to: '23:00' },
  weekdays: { days: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'], from: '11:00', to: '23:00' },
  lunch: { days: DAYS.map(d => d.key), from: '11:30', to: '15:00' },
  dinner: { days: DAYS.map(d => d.key), from: '18:00', to: '23:00' }
};

const HoursPicker = {
  schedule: {},
  container: null,
  summaryEl: null,
  onChange: null,

  defaultSchedule() {
    const s = {};
    DAYS.forEach(d => { s[d.key] = { open: true, from: '11:00', to: '23:00' }; });
    return s;
  },

  init(containerId, summaryId, onChange) {
    this.container = document.getElementById(containerId);
    this.summaryEl = document.getElementById(summaryId);
    this.onChange = onChange;
    if (!this.schedule || !Object.keys(this.schedule).length) {
      this.schedule = this.defaultSchedule();
    }
    this.render();
    this.bindPresets();
    this.updateSummary();
  },

  load(schedule) {
    this.schedule = schedule && Object.keys(schedule).length
      ? { ...this.defaultSchedule(), ...schedule }
      : this.defaultSchedule();
    if (this.container) this.render();
    this.updateSummary();
  },

  render() {
    if (!this.container) return;
    this.container.innerHTML = DAYS.map(day => {
      const s = this.schedule[day.key];
      return `
        <div class="hours-row" data-day="${day.key}">
          <label class="hours-day-toggle">
            <input type="checkbox" data-day-open="${day.key}" ${s.open ? 'checked' : ''} />
            <span>${day.label}</span>
          </label>
          <input type="time" class="hours-time" data-day-from="${day.key}" value="${s.from}" min="06:00" max="23:30" step="1800" ${s.open ? '' : 'disabled'} />
          <span class="hours-sep">→</span>
          <input type="time" class="hours-time" data-day-to="${day.key}" value="${s.to}" min="06:00" max="23:30" step="1800" ${s.open ? '' : 'disabled'} />
        </div>
      `;
    }).join('');

    this.container.querySelectorAll('[data-day-open]').forEach(input => {
      input.addEventListener('change', () => {
        this.schedule[input.dataset.dayOpen].open = input.checked;
        this.render();
        this.updateSummary();
        this.onChange?.(this.getData());
      });
    });

    this.container.querySelectorAll('.hours-time').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.dayFrom || input.dataset.dayTo;
        if (input.dataset.dayFrom) this.schedule[key].from = input.value || '11:00';
        else this.schedule[key].to = input.value || '23:00';
        this.updateSummary();
        this.onChange?.(this.getData());
      });
    });
  },

  bindPresets() {
    document.querySelectorAll('[data-hours-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = PRESETS[btn.dataset.hoursPreset];
        DAYS.forEach(d => {
          this.schedule[d.key] = {
            open: preset.days.includes(d.key),
            from: preset.from,
            to: preset.to
          };
        });
        document.querySelectorAll('[data-hours-preset]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.render();
        this.updateSummary();
        this.onChange?.(this.getData());
      });
    });
  },

  formatTime(t) {
    if (!t) return '';
    return t.replace(':', 'h');
  },

  formatSummary() {
    const openDays = DAYS.filter(d => this.schedule[d.key]?.open);
    if (!openDays.length) return 'Fermé';
    const groups = [];
    let i = 0;
    while (i < openDays.length) {
      const start = openDays[i];
      const from = this.schedule[start.key].from;
      const to = this.schedule[start.key].to;
      let j = i + 1;
      while (
        j < openDays.length &&
        this.schedule[openDays[j].key].from === from &&
        this.schedule[openDays[j].key].to === to &&
        DAYS.indexOf(openDays[j]) === DAYS.indexOf(openDays[j - 1]) + 1
      ) j++;
      const end = openDays[j - 1];
      const dayLabel = start === end
        ? start.label.slice(0, 3)
        : `${start.label.slice(0, 3)}–${end.label.slice(0, 3)}`;
      groups.push(`${dayLabel} · ${this.formatTime(from)}–${this.formatTime(to)}`);
      i = j;
    }
    return groups.join(' · ');
  },

  updateSummary() {
    if (this.summaryEl) this.summaryEl.textContent = this.formatSummary();
  },

  getData() {
    return {
      schedule: JSON.parse(JSON.stringify(this.schedule)),
      summary: this.formatSummary()
    };
  }
};

window.HoursPicker = HoursPicker;
