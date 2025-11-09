/**
 * Housekeeper Management Routes
 * 
 * API endpoints for managing maintenance tasks:
 * - View task list and status
 * - Trigger tasks manually
 * - Enable/disable tasks
 * - View execution history
 */

import express, { Request, Response } from 'express';
import { pool } from '../db/connection';

const router = express.Router();

// Store housekeeper instance (set by index.ts)
let housekeeperInstance: any = null;

export function setHousekeeperInstance(instance: any) {
  housekeeperInstance = instance;
}

/**
 * GET /api/housekeeper/tasks
 * List all registered tasks with their current status
 */
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    if (!housekeeperInstance) {
      return res.status(503).json({ error: 'Housekeeper not initialized' });
    }

    const tasks = housekeeperInstance.getAllTasks();
    
    // Get execution statistics for each task
    const stats = await pool.query(`SELECT * FROM get_housekeeper_stats()`);
    const statsMap = new Map(stats.rows.map(row => [row.task_name, row]));
    
    // Get config (enabled/disabled state)
    const config = await pool.query(`SELECT * FROM housekeeper_config`);
    const configMap = new Map(config.rows.map(row => [row.task_name, row]));
    
    // Merge data
    const enrichedTasks = tasks.map((task: any) => ({
      ...task,
      enabled: configMap.get(task.name)?.enabled ?? true,
      stats: statsMap.get(task.name) || {
        total_runs: 0,
        success_count: 0,
        error_count: 0,
        avg_duration_ms: null,
        last_run_at: null,
        last_status: null
      }
    }));

    res.json({
      tasks: enrichedTasks,
      totalTasks: enrichedTasks.length,
      runningTasks: enrichedTasks.filter((t: any) => t.isRunning).length
    });
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/housekeeper/tasks/:name
 * Get detailed information about a specific task
 */
router.get('/tasks/:name', async (req: Request, res: Response) => {
  try {
    if (!housekeeperInstance) {
      return res.status(503).json({ error: 'Housekeeper not initialized' });
    }

    const { name } = req.params;
    const task = housekeeperInstance.getTask(name);
    
    if (!task) {
      return res.status(404).json({ error: `Task '${name}' not found` });
    }

    // Get recent execution history
    const history = await pool.query(
      `SELECT id, started_at, completed_at, status, duration_ms, triggered_by, error
       FROM housekeeper_runs
       WHERE task_name = $1
       ORDER BY started_at DESC
       LIMIT 50`,
      [name]
    );

    // Get config
    const config = await pool.query(
      `SELECT * FROM housekeeper_config WHERE task_name = $1`,
      [name]
    );

    res.json({
      task: {
        ...task,
        enabled: config.rows[0]?.enabled ?? true
      },
      history: history.rows
    });
  } catch (error: any) {
    console.error('Error fetching task details:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/housekeeper/tasks/:name/runs/:runId
 * Get detailed output for a specific task run
 */
router.get('/tasks/:name/runs/:runId', async (req: Request, res: Response) => {
  try {
    const { name, runId } = req.params;

    const result = await pool.query(
      `SELECT * FROM housekeeper_runs WHERE task_name = $1 AND id = $2`,
      [name, parseInt(runId)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json({ run: result.rows[0] });
  } catch (error: any) {
    console.error('Error fetching run details:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/housekeeper/tasks/:name/run
 * Trigger a task manually
 */
router.post('/tasks/:name/run', async (req: Request, res: Response) => {
  try {
    if (!housekeeperInstance) {
      return res.status(503).json({ error: 'Housekeeper not initialized' });
    }

    const { name } = req.params;
    
    // Check if task is enabled
    const config = await pool.query(
      `SELECT enabled FROM housekeeper_config WHERE task_name = $1`,
      [name]
    );
    
    if (config.rows.length > 0 && !config.rows[0].enabled) {
      return res.status(403).json({ error: 'Task is disabled' });
    }

    // Trigger task (non-blocking)
    housekeeperInstance.runTaskManually(name).catch((error: Error) => {
      console.error(`Manual task execution failed:`, error);
    });

    res.json({ 
      message: `Task '${name}' triggered successfully`,
      status: 'running'
    });
  } catch (error: any) {
    console.error('Error triggering task:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/housekeeper/tasks/:name/toggle
 * Enable or disable a task
 */
router.patch('/tasks/:name/toggle', async (req: Request, res: Response) => {
  try {
    if (!housekeeperInstance) {
      return res.status(503).json({ error: 'Housekeeper not initialized' });
    }

    const { name } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    await housekeeperInstance.toggleTask(name, enabled);

    res.json({
      message: `Task '${name}' ${enabled ? 'enabled' : 'disabled'}`,
      enabled
    });
  } catch (error: any) {
    console.error('Error toggling task:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/housekeeper/status
 * Get overall housekeeper status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    if (!housekeeperInstance) {
      return res.status(503).json({ error: 'Housekeeper not initialized' });
    }

    const tasks = housekeeperInstance.getAllTasks();
    const stats = await pool.query(`SELECT * FROM get_housekeeper_stats()`);
    
    // Count recent failures
    const recentFailures = await pool.query(
      `SELECT COUNT(*) as count
       FROM housekeeper_runs
       WHERE status = 'error' AND started_at > NOW() - INTERVAL '24 hours'`
    );

    res.json({
      healthy: true,
      totalTasks: tasks.length,
      runningTasks: tasks.filter((t: any) => t.isRunning).length,
      totalExecutions: stats.rows.reduce((sum, row) => sum + parseInt(row.total_runs || 0), 0),
      recentFailures: parseInt(recentFailures.rows[0].count),
      uptime: process.uptime()
    });
  } catch (error: any) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
