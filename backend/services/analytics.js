// ============================================================
// Auresto — Analyses de ventes
//
// Toutes les requêtes sont paramétrées et filtrées par restaurant_id,
// fourni exclusivement par la couche d'authentification (jamais par le
// client). Les commandes annulées sont exclues du chiffre d'affaires.
// ============================================================

const EXCLUDED_STATUS = 'cancelled';

/** Chiffre d'affaires, commandes et panier moyen sur une période. */
async function periodTotals(pool, restaurantId, fromISO, toISO) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int                              AS orders_count,
       COALESCE(SUM(total), 0)::float             AS revenue,
       COALESCE(AVG(total), 0)::float             AS avg_basket
     FROM orders
     WHERE restaurant_id = $1
       AND status <> $2
       AND created_at >= $3
       AND created_at < $4`,
    [restaurantId, EXCLUDED_STATUS, fromISO, toISO]
  );
  const r = rows[0] || {};
  return {
    ordersCount: r.orders_count || 0,
    revenue: Math.round(r.revenue || 0),
    avgBasket: Math.round(r.avg_basket || 0)
  };
}

/** Classement des plats par quantité vendue et CA généré. */
async function topDishes(pool, restaurantId, fromISO, toISO, { limit = 10, ascending = false } = {}) {
  const { rows } = await pool.query(
    `SELECT
       oi.name,
       SUM(oi.qty)::int                  AS qty,
       COALESCE(SUM(oi.line_total),0)::float AS revenue,
       COUNT(DISTINCT oi.order_id)::int  AS orders_count
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.restaurant_id = $1
       AND o.status <> $2
       AND oi.created_at >= $3
       AND oi.created_at < $4
     GROUP BY oi.name
     ORDER BY qty ${ascending ? 'ASC' : 'DESC'}
     LIMIT $5`,
    [restaurantId, EXCLUDED_STATUS, fromISO, toISO, limit]
  );
  return rows.map(r => ({
    name: r.name,
    qty: r.qty,
    revenue: Math.round(r.revenue),
    ordersCount: r.orders_count
  }));
}

/** Répartition du CA par heure de la journée. */
async function salesByHour(pool, restaurantId, fromISO, toISO) {
  const { rows } = await pool.query(
    `SELECT
       EXTRACT(HOUR FROM created_at)::int AS hour,
       COUNT(*)::int                      AS orders_count,
       COALESCE(SUM(total),0)::float      AS revenue
     FROM orders
     WHERE restaurant_id = $1 AND status <> $2
       AND created_at >= $3 AND created_at < $4
     GROUP BY hour ORDER BY hour`,
    [restaurantId, EXCLUDED_STATUS, fromISO, toISO]
  );
  return rows.map(r => ({ hour: r.hour, ordersCount: r.orders_count, revenue: Math.round(r.revenue) }));
}

/** Répartition du CA par jour de la semaine (0 = dimanche). */
async function salesByWeekday(pool, restaurantId, fromISO, toISO) {
  const { rows } = await pool.query(
    `SELECT
       EXTRACT(DOW FROM created_at)::int AS weekday,
       COUNT(*)::int                     AS orders_count,
       COALESCE(SUM(total),0)::float     AS revenue
     FROM orders
     WHERE restaurant_id = $1 AND status <> $2
       AND created_at >= $3 AND created_at < $4
     GROUP BY weekday ORDER BY weekday`,
    [restaurantId, EXCLUDED_STATUS, fromISO, toISO]
  );
  const labels = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return rows.map(r => ({
    weekday: r.weekday,
    label: labels[r.weekday],
    ordersCount: r.orders_count,
    revenue: Math.round(r.revenue)
  }));
}

/** Série journalière du CA (pour visualiser la tendance). */
async function dailySeries(pool, restaurantId, fromISO, toISO) {
  const { rows } = await pool.query(
    `SELECT
       to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
       COUNT(*)::int                 AS orders_count,
       COALESCE(SUM(total),0)::float AS revenue
     FROM orders
     WHERE restaurant_id = $1 AND status <> $2
       AND created_at >= $3 AND created_at < $4
     GROUP BY day ORDER BY day`,
    [restaurantId, EXCLUDED_STATUS, fromISO, toISO]
  );
  return rows.map(r => ({ day: r.day, ordersCount: r.orders_count, revenue: Math.round(r.revenue) }));
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Construit le contexte analytique complet d'un restaurant.
 * C'est le SEUL objet transmis au modèle IA : des agrégats, jamais
 * de données brutes ni d'informations de compte.
 */
async function buildRestaurantContext(pool, restaurantId) {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)); // lundi
  const startOfPrevWeek = new Date(startOfWeek); startOfPrevWeek.setDate(startOfPrevWeek.getDate() - 7);

  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
  const startOfPrevMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1);

  const last30 = new Date(startOfToday); last30.setDate(last30.getDate() - 30);
  const nowISO = now.toISOString();

  const [
    today, yesterday,
    thisWeek, prevWeek,
    thisMonth, prevMonth,
    best, worst, byHour, byWeekday, daily,
    menuSize
  ] = await Promise.all([
    periodTotals(pool, restaurantId, startOfToday.toISOString(), nowISO),
    periodTotals(pool, restaurantId, startOfYesterday.toISOString(), startOfToday.toISOString()),
    periodTotals(pool, restaurantId, startOfWeek.toISOString(), nowISO),
    periodTotals(pool, restaurantId, startOfPrevWeek.toISOString(), startOfWeek.toISOString()),
    periodTotals(pool, restaurantId, startOfMonth.toISOString(), nowISO),
    periodTotals(pool, restaurantId, startOfPrevMonth.toISOString(), startOfMonth.toISOString()),
    topDishes(pool, restaurantId, last30.toISOString(), nowISO, { limit: 8 }),
    topDishes(pool, restaurantId, last30.toISOString(), nowISO, { limit: 5, ascending: true }),
    salesByHour(pool, restaurantId, last30.toISOString(), nowISO),
    salesByWeekday(pool, restaurantId, last30.toISOString(), nowISO),
    dailySeries(pool, restaurantId, last30.toISOString(), nowISO),
    pool.query('SELECT COUNT(*)::int AS n FROM menu_items WHERE restaurant_id=$1', [restaurantId])
  ]);

  const totalOrdersRes = await pool.query(
    'SELECT COUNT(*)::int AS n FROM orders WHERE restaurant_id=$1', [restaurantId]
  );
  const totalOrders = totalOrdersRes.rows[0].n;

  return {
    generatedAt: nowISO,
    // Permet à l'IA de savoir explicitement si les données sont suffisantes.
    dataCoverage: {
      totalOrdersAllTime: totalOrders,
      ordersLast30Days: daily.reduce((s, d) => s + d.ordersCount, 0),
      menuItemsCount: menuSize.rows[0].n,
      hasEnoughData: totalOrders >= 5
    },
    periods: {
      today, yesterday,
      thisWeek, previousWeek: prevWeek,
      thisMonth, previousMonth: prevMonth
    },
    trends: {
      revenueTodayVsYesterday: pctChange(today.revenue, yesterday.revenue),
      revenueWeekVsPrevious: pctChange(thisWeek.revenue, prevWeek.revenue),
      revenueMonthVsPrevious: pctChange(thisMonth.revenue, prevMonth.revenue),
      ordersWeekVsPrevious: pctChange(thisWeek.ordersCount, prevWeek.ordersCount),
      avgBasketWeekVsPrevious: pctChange(thisWeek.avgBasket, prevWeek.avgBasket)
    },
    dishes: { bestSellers: best, worstSellers: worst },
    timing: { byHour, byWeekday },
    dailyRevenueLast30Days: daily,
    currency: 'FCFA'
  };
}

module.exports = { buildRestaurantContext, periodTotals, topDishes, salesByHour, salesByWeekday, dailySeries, pctChange };
