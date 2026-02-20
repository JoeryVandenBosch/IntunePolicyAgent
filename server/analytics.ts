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
    db.select().from(analyticsEvents).orderBy(desc(analyticsEvents.createdAt)).limit(50),
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
  ]);

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
    },
    dailyStats,
    platformBreakdown,
    policyTypeBreakdown,
    recentEvents: recentEvents.map(e => ({
      id: e.id,
      eventType: e.eventType,
      tenantId: e.tenantId ? e.tenantId.substring(0, 8) + "..." : null,
      userEmail: e.userEmail ? e.userEmail.replace(/(.{2}).*(@.*)/, "$1***$2") : null,
      policyCount: e.policyCount,
      policyTypes: e.policyTypes,
      platforms: e.platforms,
      createdAt: e.createdAt,
    })),
  };
}
