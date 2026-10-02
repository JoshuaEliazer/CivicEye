import Complaint from '../models/Complaint.js';

export class AnalyticsValidationError extends Error {
  constructor(message, code = 'INVALID_DATE_RANGE') {
    super(message);
    this.name = 'AnalyticsValidationError';
    this.statusCode = 400;
    this.code = code;
  }
}

/**
 * Parses and validates date range parameters into start and end Dates.
 * Supports preset aliases: 'all', 'today', '7d', '30d', '90d', or explicit 'from'/'to'.
 */
export const parseDateRange = ({ from, to, preset } = {}) => {
  const now = new Date();

  // Handle Preset Aliases
  if (preset) {
    const normalizedPreset = String(preset).trim().toLowerCase();
    switch (normalizedPreset) {
      case 'today': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return { startDate: start, endDate: end, label: 'Today', period: 'daily' };
      }
      case '7d':
      case 'last_7_days': {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { startDate: start, endDate: now, label: 'Last 7 Days', period: 'daily' };
      }
      case '30d':
      case 'last_30_days': {
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { startDate: start, endDate: now, label: 'Last 30 Days', period: 'daily' };
      }
      case '90d':
      case 'last_90_days': {
        const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        return { startDate: start, endDate: now, label: 'Last 90 Days', period: 'weekly' };
      }
      case 'all':
      case 'all_time':
        return { startDate: null, endDate: null, label: 'All Time', period: 'monthly' };
      default:
        throw new AnalyticsValidationError(
          `Invalid preset '${preset}'. Allowed presets: all, today, 7d, 30d, 90d`,
          'INVALID_PRESET'
        );
    }
  }

  // Handle Explicit From/To
  if (from || to) {
    if (from && isNaN(Date.parse(from))) {
      throw new AnalyticsValidationError(
        'Invalid "from" date format. Please supply a valid ISO date (e.g. YYYY-MM-DD).',
        'INVALID_FROM_DATE'
      );
    }
    if (to && isNaN(Date.parse(to))) {
      throw new AnalyticsValidationError(
        'Invalid "to" date format. Please supply a valid ISO date (e.g. YYYY-MM-DD).',
        'INVALID_TO_DATE'
      );
    }

    const startDate = from ? new Date(from) : null;
    let endDate = to ? new Date(to) : null;

    // If 'to' is a date string without time (length <= 10), make it inclusive to end of that day
    if (endDate && typeof to === 'string' && to.trim().length <= 10) {
      endDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
    }

    if (startDate && endDate && startDate > endDate) {
      throw new AnalyticsValidationError(
        '"from" date must be earlier than or equal to "to" date.',
        'INVALID_DATE_RANGE'
      );
    }

    // Determine appropriate aggregation period based on span
    let period = 'daily';
    if (startDate && endDate) {
      const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      if (diffDays > 180) {
        period = 'monthly';
      } else if (diffDays > 31) {
        period = 'weekly';
      }
    } else {
      period = 'monthly';
    }

    return {
      startDate,
      endDate,
      label: `${startDate ? startDate.toISOString().split('T')[0] : 'Beginning'} to ${endDate ? endDate.toISOString().split('T')[0] : 'Present'}`,
      period,
    };
  }

  // Default: All time
  return { startDate: null, endDate: null, label: 'All Time', period: 'monthly' };
};

/**
 * Build MongoDB $match filter for date range
 */
const buildDateMatch = (startDate, endDate) => {
  const match = {};
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = startDate;
    if (endDate) match.createdAt.$lte = endDate;
  }
  return match;
};

/**
 * Compute main analytics overview using MongoDB aggregations.
 */
export const getAnalyticsOverview = async (filters = {}) => {
  const { startDate, endDate, label, period } = parseDateRange(filters);
  const dateMatch = buildDateMatch(startDate, endDate);

  // 1. Total All-Time Complaints (Global baseline)
  const totalAllTime = await Complaint.countDocuments({});

  // 2. High-Level Aggregation Facet for the selected date range
  const facetResult = await Complaint.aggregate([
    { $match: dateMatch },
    {
      $facet: {
        // Status counts
        byStatus: [
          {
            $group: {
              _id: { $toLower: '$status' },
              count: { $sum: 1 },
            },
          },
        ],
        // Category counts
        byCategory: [
          {
            $group: {
              _id: { $toLower: '$issueType' },
              count: { $sum: 1 },
            },
          },
        ],
        // Resolution data: resolved complaints with valid resolvedAt and createdAt
        resolutionMetrics: [
          {
            $match: {
              status: { $in: ['resolved', 'RESOLVED'] },
              resolvedAt: { $ne: null, $exists: true },
              createdAt: { $ne: null, $exists: true },
            },
          },
          {
            $project: {
              durationHours: {
                $divide: [
                  { $subtract: ['$resolvedAt', '$createdAt'] },
                  1000 * 60 * 60, // Convert ms to hours
                ],
              },
            },
          },
          {
            $match: {
              durationHours: { $gte: 0 }, // Filter any negative anomalies
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              avgHours: { $avg: '$durationHours' },
              minHours: { $min: '$durationHours' },
              maxHours: { $max: '$durationHours' },
              durations: { $push: '$durationHours' },
            },
          },
        ],
        // ML Prediction counts & confidence metrics
        mlMetrics: [
          {
            $match: {
              confidence: { $gte: 0, $lte: 1 },
            },
          },
          {
            $group: {
              _id: null,
              totalWithConfidence: { $sum: 1 },
              avgConfidence: { $avg: '$confidence' },
              minConfidence: { $min: '$confidence' },
              maxConfidence: { $max: '$confidence' },
              confidences: { $push: '$confidence' },
              uncertainCount: {
                $sum: { $cond: [{ $eq: ['$isUncertain', true] }, 1, 0] },
              },
            },
          },
        ],
        // ML Categories
        mlCategories: [
          {
            $group: {
              _id: { $toLower: '$issueType' },
              count: { $sum: 1 },
              avgConfidence: { $avg: '$confidence' },
            },
          },
        ],
        // Location statistics
        locationCounts: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              withCoords: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: [{ $ifNull: ['$location.latitude', '$latitude'] }, null] },
                        { $ne: [{ $ifNull: ['$location.longitude', '$longitude'] }, null] },
                        { $gte: [{ $ifNull: ['$location.latitude', '$latitude'] }, -90] },
                        { $lte: [{ $ifNull: ['$location.latitude', '$latitude'] }, 90] },
                        { $gte: [{ $ifNull: ['$location.longitude', '$longitude'] }, -180] },
                        { $lte: [{ $ifNull: ['$location.longitude', '$longitude'] }, 180] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
        // Total matching date filter
        totalCount: [{ $count: 'count' }],
      },
    },
  ]);

  const raw = facetResult[0] || {};
  const totalInRange = raw.totalCount?.[0]?.count || 0;

  // --------------------------------------------------------------------------
  // Process Status Breakdown & Totals
  // --------------------------------------------------------------------------
  let submittedCount = 0;
  let underReviewCount = 0;
  let inProgressCount = 0;
  let resolvedCount = 0;
  let rejectedCount = 0;

  (raw.byStatus || []).forEach((item) => {
    const s = item._id;
    if (s === 'submitted' || s === 'pending') {
      submittedCount += item.count;
    } else if (s === 'under_review') {
      underReviewCount += item.count;
    } else if (s === 'in_progress') {
      inProgressCount += item.count;
    } else if (s === 'resolved') {
      resolvedCount += item.count;
    } else if (s === 'rejected') {
      rejectedCount += item.count;
    }
  });

  const statusBreakdown = [
    {
      status: 'submitted',
      label: 'Submitted / Pending',
      count: submittedCount,
      percentage: totalInRange > 0 ? Number(((submittedCount / totalInRange) * 100).toFixed(1)) : 0,
      color: '#60a5fa',
    },
    {
      status: 'under_review',
      label: 'Under Review',
      count: underReviewCount,
      percentage: totalInRange > 0 ? Number(((underReviewCount / totalInRange) * 100).toFixed(1)) : 0,
      color: '#f59e0b',
    },
    {
      status: 'in_progress',
      label: 'In Progress',
      count: inProgressCount,
      percentage: totalInRange > 0 ? Number(((inProgressCount / totalInRange) * 100).toFixed(1)) : 0,
      color: '#818cf8',
    },
    {
      status: 'resolved',
      label: 'Resolved',
      count: resolvedCount,
      percentage: totalInRange > 0 ? Number(((resolvedCount / totalInRange) * 100).toFixed(1)) : 0,
      color: '#34d399',
    },
    {
      status: 'rejected',
      label: 'Rejected',
      count: rejectedCount,
      percentage: totalInRange > 0 ? Number(((rejectedCount / totalInRange) * 100).toFixed(1)) : 0,
      color: '#f87171',
    },
  ];

  const resolutionRate =
    totalInRange > 0 ? Number(((resolvedCount / totalInRange) * 100).toFixed(1)) : 0;

  // --------------------------------------------------------------------------
  // Process Category Breakdown
  // --------------------------------------------------------------------------
  let potholesCount = 0;
  let leakagesCount = 0;
  let garbageCount = 0;
  let otherCount = 0;

  (raw.byCategory || []).forEach((item) => {
    const cat = item._id;
    if (cat === 'pothole') {
      potholesCount += item.count;
    } else if (cat === 'leakage') {
      leakagesCount += item.count;
    } else if (cat === 'garbage') {
      garbageCount += item.count;
    } else {
      otherCount += item.count;
    }
  });

  const categoryBreakdown = [
    {
      category: 'pothole',
      label: 'Potholes',
      count: potholesCount,
      percentage: totalInRange > 0 ? Number(((potholesCount / totalInRange) * 100).toFixed(1)) : 0,
      color: '#f97316',
    },
    {
      category: 'leakage',
      label: 'Water/Drain Leakage',
      count: leakagesCount,
      percentage: totalInRange > 0 ? Number(((leakagesCount / totalInRange) * 100).toFixed(1)) : 0,
      color: '#3b82f6',
    },
    {
      category: 'garbage',
      label: 'Garbage Accumulation',
      count: garbageCount,
      percentage: totalInRange > 0 ? Number(((garbageCount / totalInRange) * 100).toFixed(1)) : 0,
      color: '#10b981',
    },
    {
      category: 'other',
      label: 'Other / None',
      count: otherCount,
      percentage: totalInRange > 0 ? Number(((otherCount / totalInRange) * 100).toFixed(1)) : 0,
      color: '#94a3b8',
    },
  ];

  // --------------------------------------------------------------------------
  // Process Time Trends (Daily / Weekly / Monthly grouping)
  // --------------------------------------------------------------------------
  let trendFormat = '%Y-%m-%d';
  if (period === 'monthly') {
    trendFormat = '%Y-%m';
  } else if (period === 'weekly') {
    trendFormat = '%Y-W%V';
  }

  const trendRaw = await Complaint.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: { $dateToString: { format: trendFormat, date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const trends = trendRaw.map((t) => ({
    date: t._id,
    label: t._id,
    count: t.count,
  }));

  // --------------------------------------------------------------------------
  // Process Resolution Analytics
  // --------------------------------------------------------------------------
  const resMeta = raw.resolutionMetrics?.[0];
  let resolutionAnalytics = {
    hasSufficientData: false,
    message: 'Insufficient resolution timestamp data',
    resolvedTotal: resolvedCount,
    timedCount: 0,
    averageHours: null,
    medianHours: null,
    minHours: null,
    maxHours: null,
    averageDays: null,
  };

  if (resMeta && resMeta.count > 0) {
    const durations = (resMeta.durations || []).sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const median =
      durations.length % 2 !== 0
        ? durations[mid]
        : (durations[mid - 1] + durations[mid]) / 2;

    const avg = Number(resMeta.avgHours.toFixed(1));
    resolutionAnalytics = {
      hasSufficientData: true,
      message: `${resMeta.count} complaint(s) with recorded resolution timestamps`,
      resolvedTotal: resolvedCount,
      timedCount: resMeta.count,
      averageHours: avg,
      medianHours: Number(median.toFixed(1)),
      minHours: Number(resMeta.minHours.toFixed(1)),
      maxHours: Number(resMeta.maxHours.toFixed(1)),
      averageDays: Number((avg / 24).toFixed(1)),
    };
  }

  // --------------------------------------------------------------------------
  // Process ML Prediction Analytics (Factual inference metrics)
  // --------------------------------------------------------------------------
  const mlMeta = raw.mlMetrics?.[0];
  const mlCatMap = {};
  (raw.mlCategories || []).forEach((c) => {
    mlCatMap[c._id] = {
      count: c.count,
      avgConfidence: Number(((c.avgConfidence || 0) * 100).toFixed(1)),
    };
  });

  // Calculate confidence distribution bins (0-50%, 50-70%, 70-85%, 85-100%)
  const confBins = {
    low: 0, // < 50%
    moderate: 0, // 50 - 70%
    confident: 0, // 70 - 85%
    high: 0, // 85 - 100%
  };

  if (mlMeta && mlMeta.confidences) {
    mlMeta.confidences.forEach((c) => {
      if (c < 0.5) confBins.low++;
      else if (c < 0.7) confBins.moderate++;
      else if (c < 0.85) confBins.confident++;
      else confBins.high++;
    });
  }

  const mlAnalytics = {
    totalAnalyzed: mlMeta?.totalWithConfidence || 0,
    averageConfidence: mlMeta?.avgConfidence ? Number(((mlMeta.avgConfidence) * 100).toFixed(1)) : 0,
    minConfidence: mlMeta?.minConfidence !== undefined ? Number(((mlMeta.minConfidence) * 100).toFixed(1)) : 0,
    maxConfidence: mlMeta?.maxConfidence !== undefined ? Number(((mlMeta.maxConfidence) * 100).toFixed(1)) : 0,
    uncertainDetections: mlMeta?.uncertainCount || 0,
    categoryConfidence: {
      pothole: mlCatMap['pothole']?.avgConfidence || 0,
      leakage: mlCatMap['leakage']?.avgConfidence || 0,
      garbage: mlCatMap['garbage']?.avgConfidence || 0,
      other: mlCatMap['other']?.avgConfidence || 0,
    },
    confidenceDistribution: [
      { range: '0–50% (Baseline / None)', count: confBins.low },
      { range: '50–70% (Moderate)', count: confBins.moderate },
      { range: '70–85% (Confident)', count: confBins.confident },
      { range: '85–100% (High Confidence)', count: confBins.high },
    ],
    notice: 'Recorded prediction confidence from YOLO26 inference at time of submission. Not model evaluation accuracy.',
  };

  // --------------------------------------------------------------------------
  // Process Location Analytics & Map Coordinates
  // --------------------------------------------------------------------------
  const locRaw = raw.locationCounts?.[0] || { total: totalInRange, withCoords: 0 };
  const withCoordinatesCount = locRaw.withCoords || 0;
  const withoutCoordinatesCount = Math.max(0, totalInRange - withCoordinatesCount);
  const coordinateRate = totalInRange > 0 ? Number(((withCoordinatesCount / totalInRange) * 100).toFixed(1)) : 0;

  // Retrieve up to 300 coordinate markers for geospatial visualization without PII
  const locationMarkers = await Complaint.find(
    {
      ...dateMatch,
      $or: [
        { latitude: { $gte: -90, $lte: 90 }, longitude: { $gte: -180, $lte: 180 } },
        { 'location.latitude': { $gte: -90, $lte: 90 }, 'location.longitude': { $gte: -180, $lte: 180 } },
      ],
    },
    'complaintId issueType status latitude longitude location createdAt'
  )
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  const sanitizedMarkers = locationMarkers.map((m) => {
    const lat = m.latitude !== undefined && m.latitude !== null ? m.latitude : m.location?.latitude;
    const lng = m.longitude !== undefined && m.longitude !== null ? m.longitude : m.location?.longitude;
    return {
      complaintId: m.complaintId,
      issueType: m.issueType,
      status: m.status,
      latitude: lat,
      longitude: lng,
      address: m.location?.address || '',
      createdAt: m.createdAt,
    };
  });

  // --------------------------------------------------------------------------
  // Factual City Insights (Neutral, evidence-based language)
  // --------------------------------------------------------------------------
  const topCategoryItem = [...categoryBreakdown].sort((a, b) => b.count - a.count)[0];
  const cityInsights = [];

  if (totalInRange === 0) {
    cityInsights.push('No complaints have been recorded within the selected date range.');
  } else {
    cityInsights.push(
      `A total of ${totalInRange} civic complaint(s) were recorded during this period (${label}).`
    );
    if (topCategoryItem && topCategoryItem.count > 0) {
      cityInsights.push(
        `Highest reported issue category: ${topCategoryItem.label} with ${topCategoryItem.count} complaint(s) (${topCategoryItem.percentage}% of period total).`
      );
    }
    cityInsights.push(
      `Geographic coverage: ${withCoordinatesCount} complaint(s) (${coordinateRate}%) include valid GPS coordinate points.`
    );
    cityInsights.push(
      `Municipal resolution rate: ${resolvedCount} complaint(s) (${resolutionRate}%) have reached resolved status.`
    );
    if (resolutionAnalytics.hasSufficientData) {
      cityInsights.push(
        `Observed average resolution duration: ${resolutionAnalytics.averageHours} hour(s) (~${resolutionAnalytics.averageDays} days) across ${resolutionAnalytics.timedCount} verified complaint(s).`
      );
    } else {
      cityInsights.push(
        'Resolution duration timestamps are currently accumulating as new complaints are resolved.'
      );
    }
    cityInsights.push(
      `Active municipal workflow: ${underReviewCount + inProgressCount} complaint(s) are currently under review or in progress.`
    );
  }

  // --------------------------------------------------------------------------
  // Assemble Clean Response
  // --------------------------------------------------------------------------
  return {
    success: true,
    dateRange: {
      from: startDate ? startDate.toISOString() : null,
      to: endDate ? endDate.toISOString() : null,
      label,
      period,
    },
    overview: {
      totalAllTime,
      totalInRange,
      submitted: submittedCount,
      underReview: underReviewCount,
      inProgress: inProgressCount,
      resolved: resolvedCount,
      rejected: rejectedCount,
      resolutionRate,
    },
    byStatus: statusBreakdown,
    byCategory: categoryBreakdown,
    trends,
    resolution: resolutionAnalytics,
    ml: mlAnalytics,
    location: {
      totalInRange,
      withCoordinatesCount,
      withoutCoordinatesCount,
      coordinateRate,
      markers: sanitizedMarkers,
    },
    cityInsights,
  };
};

/**
 * Generate CSV export of aggregated analytics without any citizen PII.
 */
export const exportAnalyticsCSV = async (filters = {}) => {
  const data = await getAnalyticsOverview(filters);

  const lines = [];
  lines.push('CIVICEYE MUNICIPAL ANALYTICS & CITY INSIGHTS REPORT');
  lines.push(`Generated At,${new Date().toISOString()}`);
  lines.push(`Date Range,${data.dateRange.label}`);
  lines.push(`From,${data.dateRange.from || 'Beginning'}`);
  lines.push(`To,${data.dateRange.to || 'Present'}`);
  lines.push('');

  // Overview Section
  lines.push('OVERVIEW SUMMARY');
  lines.push('Metric,Value');
  lines.push(`Total Complaints All-Time,${data.overview.totalAllTime}`);
  lines.push(`Total Complaints in Selected Range,${data.overview.totalInRange}`);
  lines.push(`Submitted / Pending,${data.overview.submitted}`);
  lines.push(`Under Review,${data.overview.underReview}`);
  lines.push(`In Progress,${data.overview.inProgress}`);
  lines.push(`Resolved,${data.overview.resolved}`);
  lines.push(`Rejected,${data.overview.rejected}`);
  lines.push(`Resolution Rate (%),${data.overview.resolutionRate}%`);
  lines.push('');

  // Category Breakdown Section
  lines.push('CATEGORY BREAKDOWN');
  lines.push('Category,Count,Percentage');
  data.byCategory.forEach((c) => {
    lines.push(`"${c.label}",${c.count},${c.percentage}%`);
  });
  lines.push('');

  // Status Breakdown Section
  lines.push('STATUS BREAKDOWN');
  lines.push('Status,Count,Percentage');
  data.byStatus.forEach((s) => {
    lines.push(`"${s.label}",${s.count},${s.percentage}%`);
  });
  lines.push('');

  // Resolution Metrics Section
  lines.push('RESOLUTION DURATION METRICS');
  lines.push('Metric,Value');
  lines.push(`Resolved Count,${data.resolution.resolvedTotal}`);
  lines.push(`Timed Resolved Count,${data.resolution.timedCount}`);
  lines.push(`Average Hours,${data.resolution.averageHours !== null ? data.resolution.averageHours : 'N/A'}`);
  lines.push(`Average Days,${data.resolution.averageDays !== null ? data.resolution.averageDays : 'N/A'}`);
  lines.push(`Median Hours,${data.resolution.medianHours !== null ? data.resolution.medianHours : 'N/A'}`);
  lines.push(`Fastest Resolution (Hours),${data.resolution.minHours !== null ? data.resolution.minHours : 'N/A'}`);
  lines.push(`Slowest Resolution (Hours),${data.resolution.maxHours !== null ? data.resolution.maxHours : 'N/A'}`);
  lines.push('');

  // ML Prediction Section
  lines.push('ML PREDICTION METRICS');
  lines.push('Metric,Value');
  lines.push(`Total Predictions Analyzed,${data.ml.totalAnalyzed}`);
  lines.push(`Average Recorded Confidence (%),${data.ml.averageConfidence}%`);
  lines.push(`Lowest Confidence (%),${data.ml.minConfidence}%`);
  lines.push(`Highest Confidence (%),${data.ml.maxConfidence}%`);
  lines.push(`Uncertain Detections,${data.ml.uncertainDetections}`);
  lines.push('');

  // Geolocation Coverage Section
  lines.push('GEOLOCATION COVERAGE');
  lines.push('Metric,Value');
  lines.push(`Complaints with GPS,${data.location.withCoordinatesCount}`);
  lines.push(`Complaints without GPS,${data.location.withoutCoordinatesCount}`);
  lines.push(`GPS Coverage Rate (%),${data.location.coordinateRate}%`);
  lines.push('');

  // Trends Section
  lines.push('TIME TRENDS');
  lines.push('Date,Complaint Count');
  data.trends.forEach((t) => {
    lines.push(`${t.date},${t.count}`);
  });
  lines.push('');

  // City Insights Section
  lines.push('FACTUAL CITY INSIGHTS');
  data.cityInsights.forEach((insight, idx) => {
    lines.push(`${idx + 1},"${insight.replace(/"/g, '""')}"`);
  });

  return lines.join('\n');
};

export default {
  parseDateRange,
  getAnalyticsOverview,
  exportAnalyticsCSV,
  AnalyticsValidationError,
};
