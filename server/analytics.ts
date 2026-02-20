import { db } from "./db";
import { analyticsEvents } from "@shared/schema";
import { desc, sql, eq, gte, count } from "drizzle-orm";

export async function trackEvent(event: {
  eventType: string;
  tenantId?: string;
  userEmail?: string;
  policyCount?: number;
  policyTypes?: string;
  platforms?: string;
  metadata?: string;
}) {
  try {
    await db.insert(analyticsEvents).values({
      eventType: event.eventType,
      tenantId: event.tenantId || null,
      userEmail: event.userEmail || null,
      policyCount: event.policyCount || null,
      policyTypes: event.policyTypes || null,
      platforms: event.platforms || null,
      metadata: event.metadata || null,
    });
  } catch (error) {
    console.error("Analytics tracking error:", error);
  }
}

export async function getAnalyticsSummary() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalAnalyses,
    totalLogins,
    last30DaysAnalyses,
    last7DaysAnalyses,
    last24HoursAnalyses,
    uniqueTenants,
    uniqueUsers,
    totalPoliciesAnalyzed,
    recentEvents,
    dailyStats,
    platformBreakdown,
    policyTypeBreakdown,
    tenantBreakdown,
    topUsers,
    dailyLogins,
    last30DaysLogins,
    last7DaysLogins,
    last24HoursLogins,
  ] = await Promise.all([
    db.select({ count: count() }).from(analyticsEvents).where(eq(analyticsEvents.eventType, "analysis")),
    db.select({ count: count() }).from(analyticsEvents).where(eq(analyticsEvents.eventType, "login")),
    db.select({ count: count() }).from(analyticsEvents).where(
      sql`${analyticsEvents.eventType} = 'analysis' AND ${analyticsEvents.createdAt} >= ${thirtyDaysAgo}`
    ),
    db.select({ count: count() }).from(analyticsEvents).where(
      sql`${analyticsEvents.eventType} = 'analysis' AND ${analyticsEvents.createdAt} >= ${sevenDaysAgo}`
    ),
    db.select({ count: count() }).from(analyticsEvents).where(
      sql`${analyticsEvents.eventType} = 'analysis' AND ${analyticsEvents.createdAt} >= ${oneDayAgo}`
    ),
    db.select({ count: sql<number>`COUNT(DISTINCT ${analyticsEvents.tenantId})` }).from(analyticsEvents).where(sql`${analyticsEvents.tenantId} IS NOT NULL`),
    db.select({ count: sql<number>`COUNT(DISTINCT ${analyticsEvents.userEmail})` }).from(analyticsEvents).where(sql`${analyticsEvents.userEmail} IS NOT NULL`),
    db.select({ total: sql<number>`COALESCE(SUM(${analyticsEvents.policyCount}), 0)` }).from(analyticsEvents).where(eq(analyticsEvents.eventType, "analysis")),
    db.select().from(analyticsEvents).orderBy(desc(analyticsEvents.createdAt)).limit(100),
    db.select({
      date: sql<string>`DATE(${analyticsEvents.createdAt})`,
      analyses: count(),
      policies: sql<number>`COALESCE(SUM(${analyticsEvents.policyCount}), 0)`,
    }).from(analyticsEvents)
      .where(sql`${analyticsEvents.eventType} = 'analysis' AND ${analyticsEvents.createdAt} >= ${thirtyDaysAgo}`)
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`),
    db.select({
      platform: analyticsEvents.platforms,
      count: count(),
    }).from(analyticsEvents)
      .where(sql`${analyticsEvents.eventType} = 'analysis' AND ${analyticsEvents.platforms} IS NOT NULL`)
      .groupBy(analyticsEvents.platforms)
      .orderBy(desc(count())),
    db.select({
      policyType: analyticsEvents.policyTypes,
      count: count(),
    }).from(analyticsEvents)
      .where(sql`${analyticsEvents.eventType} = 'analysis' AND ${analyticsEvents.policyTypes} IS NOT NULL`)
      .groupBy(analyticsEvents.policyTypes)
      .orderBy(desc(count())),
    db.select({
      tenantId: analyticsEvents.tenantId,
      analyses: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'analysis')`,
      logins: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'login')`,
      users: sql<number>`COUNT(DISTINCT ${analyticsEvents.userEmail})`,
      policies: sql<number>`COALESCE(SUM(${analyticsEvents.policyCount}) FILTER (WHERE ${analyticsEvents.eventType} = 'analysis'), 0)`,
      lastActive: sql<string>`MAX(${analyticsEvents.createdAt})`,
    }).from(analyticsEvents)
      .where(sql`${analyticsEvents.tenantId} IS NOT NULL AND ${analyticsEvents.tenantId} != ''`)
      .groupBy(analyticsEvents.tenantId)
      .orderBy(sql`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'analysis') DESC`)
      .limit(50),
    db.select({
      email: analyticsEvents.userEmail,
      tenantId: analyticsEvents.tenantId,
      analyses: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'analysis')`,
      logins: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'login')`,
      policies: sql<number>`COALESCE(SUM(${analyticsEvents.policyCount}) FILTER (WHERE ${analyticsEvents.eventType} = 'analysis'), 0)`,
      lastActive: sql<string>`MAX(${analyticsEvents.createdAt})`,
    }).from(analyticsEvents)
      .where(sql`${analyticsEvents.userEmail} IS NOT NULL AND ${analyticsEvents.userEmail} != ''`)
      .groupBy(analyticsEvents.userEmail, analyticsEvents.tenantId)
      .orderBy(sql`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'analysis') DESC`)
      .limit(50),
    db.select({
      date: sql<string>`DATE(${analyticsEvents.createdAt})`,
      logins: count(),
    }).from(analyticsEvents)
      .where(sql`${analyticsEvents.eventType} = 'login' AND ${analyticsEvents.createdAt} >= ${thirtyDaysAgo}`)
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`),
    db.select({ count: count() }).from(analyticsEvents).where(
      sql`${analyticsEvents.eventType} = 'login' AND ${analyticsEvents.createdAt} >= ${thirtyDaysAgo}`
    ),
    db.select({ count: count() }).from(analyticsEvents).where(
      sql`${analyticsEvents.eventType} = 'login' AND ${analyticsEvents.createdAt} >= ${sevenDaysAgo}`
    ),
    db.select({ count: count() }).from(analyticsEvents).where(
      sql`${analyticsEvents.eventType} = 'login' AND ${analyticsEvents.createdAt} >= ${oneDayAgo}`
    ),
  ]);

  const combinedDailyStats = dailyStats.map((d: any) => {
    const loginEntry = dailyLogins.find((l: any) => l.date === d.date);
    return {
      ...d,
      logins: loginEntry ? loginEntry.logins : 0,
    };
  });

  const loginOnlyDates = dailyLogins.filter((l: any) => !dailyStats.find((d: any) => d.date === l.date));
  for (const l of loginOnlyDates) {
    combinedDailyStats.push({ date: l.date, analyses: 0, policies: 0, logins: l.logins });
  }
  combinedDailyStats.sort((a: any, b: any) => a.date.localeCompare(b.date));

  return {
    totals: {
      analyses: totalAnalyses[0]?.count || 0,
      logins: totalLogins[0]?.count || 0,
      uniqueTenants: uniqueTenants[0]?.count || 0,
      uniqueUsers: uniqueUsers[0]?.count || 0,
      policiesAnalyzed: totalPoliciesAnalyzed[0]?.total || 0,
    },
    periods: {
      last24Hours: last24HoursAnalyses[0]?.count || 0,
      last7Days: last7DaysAnalyses[0]?.count || 0,
      last30Days: last30DaysAnalyses[0]?.count || 0,
      loginsLast24Hours: last24HoursLogins[0]?.count || 0,
      loginsLast7Days: last7DaysLogins[0]?.count || 0,
      loginsLast30Days: last30DaysLogins[0]?.count || 0,
    },
    dailyStats: combinedDailyStats,
    platformBreakdown,
    policyTypeBreakdown,
    tenantBreakdown: tenantBreakdown.map((t: any) => ({
      tenantId: t.tenantId,
      tenantIdShort: t.tenantId ? t.tenantId.substring(0, 8) + "..." : "Unknown",
      analyses: Number(t.analyses) || 0,
      logins: Number(t.logins) || 0,
      users: Number(t.users) || 0,
      policies: Number(t.policies) || 0,
      lastActive: t.lastActive,
    })),
    topUsers: topUsers.map((u: any) => ({
      email: u.email ? u.email.replace(/(.{3}).*(@.*)/, "$1***$2") : "Unknown",
      tenantIdShort: u.tenantId ? u.tenantId.substring(0, 8) + "..." : "Unknown",
      analyses: Number(u.analyses) || 0,
      logins: Number(u.logins) || 0,
      policies: Number(u.policies) || 0,
      lastActive: u.lastActive,
    })),
    recentEvents: recentEvents.map(e => ({
      id: e.id,
      eventType: e.eventType,
      tenantId: e.tenantId ? e.tenantId.substring(0, 8) + "..." : null,
      userEmail: e.userEmail ? e.userEmail.replace(/(.{3}).*(@.*)/, "$1***$2") : null,
      policyCount: e.policyCount,
      policyTypes: e.policyTypes,
      platforms: e.platforms,
      createdAt: e.createdAt,
    })),
  };
}
