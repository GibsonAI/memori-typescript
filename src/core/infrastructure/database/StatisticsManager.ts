import { DatabaseStats } from '../../types/models';
import { logInfo, logError } from '../config/Logger';
import { DatabaseContext } from './DatabaseContext';

/**
 * StatisticsManager - Dedicated class for database statistics and analytics
 *
 * This class provides comprehensive database statistics functionality that was
 * extracted from DatabaseManager to follow the Single Responsibility Principle.
 * It focuses solely on statistics collection, analysis, and reporting.
 *
 * Features:
 * - Comprehensive database statistics collection
 * - Efficient parallel query execution for performance
 * - Namespace-based filtering and reporting
 * - Activity tracking across all database tables
 * - Memory type breakdowns and analytics
 * - Conversation and session statistics
 */
export class StatisticsManager {
  private databaseContext: DatabaseContext;

  constructor(databaseContext: DatabaseContext) {
    this.databaseContext = databaseContext;
  }

  /**
   * Get comprehensive database statistics for a namespace
   *
   * This method collects statistics from all database tables in parallel
   * for optimal performance and provides detailed insights into database usage.
   */
  async getDatabaseStats(namespace: string = 'default'): Promise<DatabaseStats> {
    try {
      logInfo(`Collecting database statistics for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
      });

      // Get counts from all tables in parallel for better performance
      const [
        totalConversations,
        totalLongTermMemories,
        totalShortTermMemories,
        totalConsciousMemories,
        lastChatActivity,
        lastLongTermActivity,
        lastShortTermActivity,
      ] = await Promise.all([
        this.getConversationCount(namespace),
        this.getLongTermMemoryCount(namespace),
        this.getShortTermMemoryCount(namespace),
        this.getConsciousMemoryCount(namespace),
        this.getLastChatActivity(namespace),
        this.getLastLongTermActivity(namespace),
        this.getLastShortTermActivity(namespace),
      ]);

      // Calculate total memories and find most recent activity
      const totalMemories = totalLongTermMemories + totalShortTermMemories;
      const lastActivity = this.calculateLastActivity([
        lastChatActivity,
        lastLongTermActivity,
        lastShortTermActivity,
      ]);

      const stats: DatabaseStats = {
        totalConversations,
        totalMemories,
        shortTermMemories: totalShortTermMemories,
        longTermMemories: totalLongTermMemories,
        consciousMemories: totalConsciousMemories,
        lastActivity,
      };

      logInfo(`Retrieved database statistics for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
        ...stats,
      });

      return stats;

    } catch (error) {
      logError(`Error retrieving database statistics for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to retrieve database statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get detailed memory statistics with breakdowns by type and category
   */
  async getDetailedMemoryStats(namespace: string = 'default'): Promise<{
    totalMemories: number;
    byType: {
      longTerm: number;
      shortTerm: number;
      conscious: number;
    };
    byImportance: Record<string, number>;
    byCategory: Record<string, number>;
    recentActivity: {
      last24Hours: number;
      last7Days: number;
      last30Days: number;
    };
    averageConfidence: number;
  }> {
    try {
      logInfo(`Collecting detailed memory statistics for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
      });

      // Execute parallel queries for comprehensive statistics
      const [
        longTermMemories,
        shortTermMemories,
        importanceStats,
        categoryStats,
        recentActivity,
        confidenceStats,
      ] = await Promise.all([
        this.getLongTermMemoryBreakdown(namespace),
        this.getShortTermMemoryBreakdown(namespace),
        this.getImportanceBreakdown(namespace),
        this.getCategoryBreakdown(namespace),
        this.getRecentActivityStats(namespace),
        this.getConfidenceStats(namespace),
      ]);

      const totalMemories = longTermMemories.total + shortTermMemories.total;
      const consciousMemories = longTermMemories.byCategory?.conscious || 0;

      const result = {
        totalMemories,
        byType: {
          longTerm: longTermMemories.total,
          shortTerm: shortTermMemories.total,
          conscious: consciousMemories,
        },
        byImportance: importanceStats,
        byCategory: categoryStats,
        recentActivity,
        averageConfidence: confidenceStats.average,
      };

      logInfo(`Retrieved detailed memory statistics for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
        ...result,
      });

      return result;

    } catch (error) {
      logError(`Error retrieving detailed memory statistics for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to retrieve detailed memory statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get conversation statistics with session analysis
   */
  async getConversationStats(namespace: string = 'default'): Promise<{
    totalConversations: number;
    uniqueSessions: number;
    averageMessagesPerSession: number;
    conversationsByModel: Record<string, number>;
    recentConversations: {
      last24Hours: number;
      last7Days: number;
      last30Days: number;
    };
    peakActivityHours: number[];
  }> {
    try {
      logInfo(`Collecting conversation statistics for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
      });

      // Execute parallel queries for conversation statistics
      const [
        basicStats,
        modelStats,
        temporalStats,
      ] = await Promise.all([
        this.getBasicConversationStats(namespace),
        this.getConversationModelStats(namespace),
        this.getConversationTemporalStats(namespace),
      ]);

      const result = {
        totalConversations: basicStats.totalConversations,
        uniqueSessions: basicStats.uniqueSessions,
        averageMessagesPerSession: basicStats.averageMessagesPerSession,
        conversationsByModel: modelStats,
        recentConversations: temporalStats.recentConversations,
        peakActivityHours: temporalStats.peakActivityHours,
      };

      logInfo(`Retrieved conversation statistics for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
        ...result,
      });

      return result;

    } catch (error) {
      logError(`Error retrieving conversation statistics for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to retrieve conversation statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get database usage trends over time
   */
  async getUsageTrends(
    namespace: string = 'default',
    days: number = 30,
  ): Promise<{
    dailyActivity: Array<{ date: string; conversations: number; memories: number }>;
    growthRate: {
      conversations: number;
      memories: number;
      overall: number;
    };
    projections: {
      nextWeek: { conversations: number; memories: number };
      nextMonth: { conversations: number; memories: number };
    };
  }> {
    try {
      logInfo(`Collecting usage trends for namespace '${namespace}' over ${days} days`, {
        component: 'StatisticsManager',
        namespace,
        days,
      });

      // Get daily activity data
      const dailyActivity = await this.getDailyActivityData(namespace, days);

      // Calculate growth rates
      const growthRate = this.calculateGrowthRates(dailyActivity);

      // Generate projections based on trends
      const projections = this.generateProjections(dailyActivity, growthRate);

      const result = {
        dailyActivity,
        growthRate,
        projections,
      };

      logInfo(`Retrieved usage trends for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
        days,
        dataPoints: dailyActivity.length,
        ...growthRate,
      });

      return result;

    } catch (error) {
      logError(`Error retrieving usage trends for namespace '${namespace}'`, {
        component: 'StatisticsManager',
        namespace,
        days,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to retrieve usage trends: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private async getConversationCount(namespace: string): Promise<number> {
    const prisma = this.databaseContext.getPrismaClient();
    return await prisma.chatHistory.count({ where: { namespace } });
  }

  private async getLongTermMemoryCount(namespace: string): Promise<number> {
    const prisma = this.databaseContext.getPrismaClient();
    return await prisma.longTermMemory.count({ where: { namespace } });
  }

  private async getShortTermMemoryCount(namespace: string): Promise<number> {
    const prisma = this.databaseContext.getPrismaClient();
    return await prisma.shortTermMemory.count({ where: { namespace } });
  }

  private async getConsciousMemoryCount(namespace: string): Promise<number> {
    const prisma = this.databaseContext.getPrismaClient();
    return await prisma.longTermMemory.count({
      where: {
        namespace,
        categoryPrimary: 'conscious-info',
      },
    });
  }

  private async getLastChatActivity(namespace: string): Promise<Date | null> {
    const prisma = this.databaseContext.getPrismaClient();
    const result = await prisma.chatHistory.findFirst({
      where: { namespace },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    return result?.timestamp || null;
  }

  private async getLastLongTermActivity(namespace: string): Promise<Date | null> {
    const prisma = this.databaseContext.getPrismaClient();
    const result = await prisma.longTermMemory.findFirst({
      where: { namespace },
      orderBy: { extractionTimestamp: 'desc' },
      select: { extractionTimestamp: true },
    });
    return result?.extractionTimestamp || null;
  }

  private async getLastShortTermActivity(namespace: string): Promise<Date | null> {
    const prisma = this.databaseContext.getPrismaClient();
    const result = await prisma.shortTermMemory.findFirst({
      where: { namespace },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return result?.createdAt || null;
  }

  private calculateLastActivity(activityDates: (Date | null)[]): Date | undefined {
    const validDates = activityDates.filter(Boolean) as Date[];
    if (validDates.length === 0) return undefined;

    return new Date(Math.max(...validDates.map(date => date.getTime())));
  }

  private async getLongTermMemoryBreakdown(namespace: string): Promise<{
    total: number;
    byCategory?: Record<string, number>;
  }> {
    const prisma = this.databaseContext.getPrismaClient();

    // Get total count
    const total = await prisma.longTermMemory.count({ where: { namespace } });

    // Get breakdown by category for detailed stats
    const categoryBreakdown = await prisma.longTermMemory.groupBy({
      by: ['categoryPrimary'],
      where: { namespace },
      _count: { id: true },
    });

    const byCategory: Record<string, number> = {};
    categoryBreakdown.forEach(item => {
      byCategory[item.categoryPrimary || 'unknown'] = item._count.id;
    });

    return { total, byCategory };
  }

  private async getShortTermMemoryBreakdown(namespace: string): Promise<{
    total: number;
    permanent: number;
  }> {
    const prisma = this.databaseContext.getPrismaClient();

    const [total, permanent] = await Promise.all([
      prisma.shortTermMemory.count({ where: { namespace } }),
      prisma.shortTermMemory.count({
        where: {
          namespace,
          isPermanentContext: true,
        },
      }),
    ]);

    return { total, permanent };
  }

  private async getImportanceBreakdown(namespace: string): Promise<Record<string, number>> {
    const prisma = this.databaseContext.getPrismaClient();

    const importanceBreakdown = await prisma.longTermMemory.groupBy({
      by: ['memoryImportance'],
      where: { namespace },
      _count: { id: true },
    });

    const result: Record<string, number> = {};
    importanceBreakdown.forEach(item => {
      result[item.memoryImportance || 'unknown'] = item._count.id;
    });

    return result;
  }

  private async getCategoryBreakdown(namespace: string): Promise<Record<string, number>> {
    const prisma = this.databaseContext.getPrismaClient();

    const categoryBreakdown = await prisma.longTermMemory.groupBy({
      by: ['categoryPrimary'],
      where: { namespace },
      _count: { id: true },
    });

    const result: Record<string, number> = {};
    categoryBreakdown.forEach(item => {
      result[item.categoryPrimary || 'unknown'] = item._count.id;
    });

    return result;
  }

  private async getRecentActivityStats(namespace: string): Promise<{
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  }> {
    const prisma = this.databaseContext.getPrismaClient();
    const now = new Date();

    const [last24Hours, last7Days, last30Days] = await Promise.all([
      // Count memories from last 24 hours
      prisma.longTermMemory.count({
        where: {
          namespace,
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      // Count memories from last 7 days
      prisma.longTermMemory.count({
        where: {
          namespace,
          createdAt: {
            gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // Count memories from last 30 days
      prisma.longTermMemory.count({
        where: {
          namespace,
          createdAt: {
            gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return { last24Hours, last7Days, last30Days };
  }

  private async getConfidenceStats(namespace: string): Promise<{
    average: number;
    distribution: Record<string, number>;
  }> {
    const prisma = this.databaseContext.getPrismaClient();

    // Get average confidence score
    const avgResult = await prisma.longTermMemory.aggregate({
      where: { namespace },
      _avg: { confidenceScore: true },
    });

    // Get confidence distribution (rounded to nearest 0.1)
    const distributionResult = await prisma.longTermMemory.findMany({
      where: { namespace },
      select: { confidenceScore: true },
    });

    const distribution: Record<string, number> = {};
    distributionResult.forEach(memory => {
      const bucket = Math.floor((memory.confidenceScore || 0) * 10) / 10;
      distribution[bucket.toFixed(1)] = (distribution[bucket.toFixed(1)] || 0) + 1;
    });

    return {
      average: avgResult._avg.confidenceScore || 0,
      distribution,
    };
  }

  private async getBasicConversationStats(namespace: string): Promise<{
    totalConversations: number;
    uniqueSessions: number;
    averageMessagesPerSession: number;
  }> {
    const prisma = this.databaseContext.getPrismaClient();

    // Get total conversations
    const totalConversations = await prisma.chatHistory.count({ where: { namespace } });

    // Get unique sessions
    const uniqueSessionsResult = await prisma.chatHistory.findMany({
      where: { namespace },
      select: { sessionId: true },
      distinct: ['sessionId'],
    });

    const uniqueSessions = uniqueSessionsResult.length;

    // Calculate average messages per session
    const averageMessagesPerSession = uniqueSessions > 0 ? totalConversations / uniqueSessions : 0;

    return {
      totalConversations,
      uniqueSessions,
      averageMessagesPerSession: Math.round(averageMessagesPerSession * 100) / 100,
    };
  }

  private async getConversationModelStats(namespace: string): Promise<Record<string, number>> {
    const prisma = this.databaseContext.getPrismaClient();

    const modelBreakdown = await prisma.chatHistory.groupBy({
      by: ['model'],
      where: { namespace },
      _count: { id: true },
    });

    const result: Record<string, number> = {};
    modelBreakdown.forEach(item => {
      result[item.model || 'unknown'] = item._count.id;
    });

    return result;
  }

  private async getConversationTemporalStats(namespace: string): Promise<{
    recentConversations: {
      last24Hours: number;
      last7Days: number;
      last30Days: number;
    };
    peakActivityHours: number[];
  }> {
    const prisma = this.databaseContext.getPrismaClient();
    const now = new Date();

    const [last24Hours, last7Days, last30Days] = await Promise.all([
      prisma.chatHistory.count({
        where: {
          namespace,
          timestamp: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.chatHistory.count({
        where: {
          namespace,
          timestamp: {
            gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.chatHistory.count({
        where: {
          namespace,
          timestamp: {
            gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    // Calculate peak activity hours (simplified - would need more complex query for real data)
    const peakActivityHours = [9, 10, 11, 14, 15, 16]; // Placeholder based on typical patterns

    return {
      recentConversations: { last24Hours, last7Days, last30Days },
      peakActivityHours,
    };
  }

  private async getDailyActivityData(namespace: string, days: number): Promise<
    Array<{ date: string; conversations: number; memories: number }>
  > {
    const prisma = this.databaseContext.getPrismaClient();
    const results: Array<{ date: string; conversations: number; memories: number }> = [];

    // Get daily data for the specified number of days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      const [conversations, memories] = await Promise.all([
        prisma.chatHistory.count({
          where: {
            namespace,
            timestamp: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },
        }),
        prisma.longTermMemory.count({
          where: {
            namespace,
            createdAt: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },
        }),
      ]);

      results.push({
        date: startOfDay.toISOString().split('T')[0],
        conversations,
        memories,
      });
    }

    return results;
  }

  private calculateGrowthRates(dailyActivity: Array<{ date: string; conversations: number; memories: number }>): {
    conversations: number;
    memories: number;
    overall: number;
  } {
    if (dailyActivity.length < 2) {
      return { conversations: 0, memories: 0, overall: 0 };
    }

    // Calculate growth rates based on first vs last 7 days
    const firstWeek = dailyActivity.slice(0, 7);
    const lastWeek = dailyActivity.slice(-7);

    const firstWeekConversations = firstWeek.reduce((sum, day) => sum + day.conversations, 0);
    const lastWeekConversations = lastWeek.reduce((sum, day) => sum + day.conversations, 0);
    const firstWeekMemories = firstWeek.reduce((sum, day) => sum + day.memories, 0);
    const lastWeekMemories = lastWeek.reduce((sum, day) => sum + day.memories, 0);

    const conversationGrowthRate = firstWeekConversations > 0 ?
      ((lastWeekConversations - firstWeekConversations) / firstWeekConversations) * 100 : 0;
    const memoryGrowthRate = firstWeekMemories > 0 ?
      ((lastWeekMemories - firstWeekMemories) / firstWeekMemories) * 100 : 0;

    const overallGrowthRate = (conversationGrowthRate + memoryGrowthRate) / 2;

    return {
      conversations: Math.round(conversationGrowthRate * 100) / 100,
      memories: Math.round(memoryGrowthRate * 100) / 100,
      overall: Math.round(overallGrowthRate * 100) / 100,
    };
  }

  private generateProjections(
    dailyActivity: Array<{ date: string; conversations: number; memories: number }>,
    growthRate: { conversations: number; memories: number; overall: number },
  ): {
    nextWeek: { conversations: number; memories: number };
    nextMonth: { conversations: number; memories: number };
  } {
    // Calculate recent averages
    const recentDays = dailyActivity.slice(-7);
    const avgConversationsPerDay = recentDays.reduce((sum, day) => sum + day.conversations, 0) / recentDays.length;
    const avgMemoriesPerDay = recentDays.reduce((sum, day) => sum + day.memories, 0) / recentDays.length;

    // Project next week (7 days)
    const nextWeekConversations = Math.round(avgConversationsPerDay * 7 * (1 + growthRate.conversations / 100));
    const nextWeekMemories = Math.round(avgMemoriesPerDay * 7 * (1 + growthRate.memories / 100));

    // Project next month (30 days)
    const nextMonthConversations = Math.round(avgConversationsPerDay * 30 * (1 + growthRate.conversations / 100));
    const nextMonthMemories = Math.round(avgMemoriesPerDay * 30 * (1 + growthRate.memories / 100));

    return {
      nextWeek: { conversations: nextWeekConversations, memories: nextWeekMemories },
      nextMonth: { conversations: nextMonthConversations, memories: nextMonthMemories },
    };
  }
}