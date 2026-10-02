import analyticsService, { AnalyticsValidationError } from '../services/analyticsService.js';

/**
 * Get comprehensive analytics overview for the admin dashboard.
 * Route: GET /api/admin/analytics/overview
 * Access: Protected (ADMIN only)
 */
export const getOverview = async (req, res, next) => {
  try {
    const { from, to, preset, range } = req.query;
    const activePreset = preset || range;

    const data = await analyticsService.getAnalyticsOverview({ from, to, preset: activePreset });

    return res.status(200).json(data);
  } catch (err) {
    if (err instanceof AnalyticsValidationError) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
        error: err.code || 'INVALID_DATE_RANGE',
      });
    }
    return next(err);
  }
};

/**
 * Export aggregated analytics report as CSV.
 * Route: GET /api/admin/analytics/export
 * Access: Protected (ADMIN only)
 */
export const exportCSV = async (req, res, next) => {
  try {
    const { from, to, preset, range } = req.query;
    const activePreset = preset || range;

    const csvContent = await analyticsService.exportAnalyticsCSV({ from, to, preset: activePreset });

    const filename = `civiceye-analytics-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    return res.status(200).send(csvContent);
  } catch (err) {
    if (err instanceof AnalyticsValidationError) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
        error: err.code || 'INVALID_DATE_RANGE',
      });
    }
    return next(err);
  }
};

export default {
  getOverview,
  exportCSV,
};
