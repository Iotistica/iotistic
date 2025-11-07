/**
 * Digital Twin Graph API Routes
 * 
 * RESTful endpoints for managing Digital Twin spatial graph:
 * - IFC file upload and parsing
 * - Neo4j graph queries
 * - Device-to-space mapping
 * - Graph visualization data
 */

import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { IFCParserService } from '../services/ifc-parser.service';
import { neo4jService } from '../services/neo4j.service';
import { query } from '../db/connection';

const router: Router = express.Router();

// Configure multer for IFC file uploads
const upload = multer({
  dest: 'uploads/ifc/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.ifc')) {
      cb(null, true);
    } else {
      cb(new Error('Only .ifc files are allowed'));
    }
  },
});

// Ensure upload directory exists
const uploadDir = 'uploads/ifc';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * POST /api/digital-twin/graph/upload-ifc
 * Upload and parse IFC file, load into Neo4j
 */
router.post('/upload-ifc', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`Uploading IFC file: ${req.file.originalname}`);

    // Initialize IFC parser
    const parser = new IFCParserService();
    await parser.init();

    // Parse IFC file
    const hierarchy = await parser.parseIFCFile(req.file.path);

    console.log('IFC Parsing Results:');
    console.log(`- Project: ${hierarchy.project?.name || 'none'}`);
    console.log(`- Site: ${hierarchy.site?.name || 'none'}`);
    console.log(`- Building: ${hierarchy.building?.name || 'none'}`);
    console.log(`- Floors: ${hierarchy.floors.length}`);
    hierarchy.floors.forEach(f => console.log(`  - Floor: ${f.name} (ID: ${f.expressId})`));
    console.log(`- Spaces: ${hierarchy.spaces.length}`);
    hierarchy.spaces.forEach(s => console.log(`  - Space: ${s.name} (ID: ${s.expressId})`));
    console.log(`- Edge Devices: ${hierarchy.edgeDevices.length}`);
    hierarchy.edgeDevices.forEach(d => console.log(`  - Device: ${d.name} (ID: ${d.expressId})`));
    console.log(`- Sensors: ${hierarchy.sensors.length}`);
    hierarchy.sensors.forEach(s => console.log(`  - Sensor: ${s.name} (ID: ${s.expressId})`));
    console.log(`- Relationships: ${hierarchy.relationships.length}`);
    hierarchy.relationships.forEach(r => console.log(`  - ${r.type}: ${r.from} -> ${r.to}`));

    // Load into Neo4j
    await neo4jService.loadIFCHierarchy(hierarchy);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: 'IFC file processed successfully',
      stats: {
        floors: hierarchy.floors.length,
        spaces: hierarchy.spaces.length,
        edgeDevices: hierarchy.edgeDevices.length,
        sensors: hierarchy.sensors.length,
        relationships: hierarchy.relationships.length,
      },
    });
  } catch (error: any) {
    console.error('Failed to upload IFC:', error);
    
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Failed to process IFC file',
      message: error.message,
    });
  }
});

/**
 * GET /api/digital-twin/graph
 * Get full graph visualization data from Neo4j
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const graphData = await neo4jService.getGraphVisualizationData();
    
    console.log('📊 Graph Data Being Returned:');
    console.log(`- Nodes: ${graphData.nodes.length}`);
    console.log(`- Relationships: ${graphData.relationships.length}`);
    graphData.relationships.forEach(rel => {
      console.log(`  - ${rel.type}: ${rel.from} -> ${rel.to}`);
    });
    
    res.json({
      success: true,
      data: graphData,
    });
  } catch (error: any) {
    console.error('Failed to get graph data:', error);
    res.status(500).json({
      error: 'Failed to retrieve graph data',
      message: error.message,
    });
  }
});

/**
 * POST /api/digital-twin/graph/map-device
 * Map an edge device to a space
 * 
 * Body: { deviceUuid: string, spaceExpressId: number }
 */
router.post('/map-device', async (req: Request, res: Response) => {
  try {
    const { deviceUuid, spaceExpressId } = req.body;

    if (!deviceUuid || !spaceExpressId) {
      return res.status(400).json({
        error: 'Missing required fields: deviceUuid, spaceExpressId',
      });
    }

    // Get device name from PostgreSQL
    let deviceName: string | null = null;
    try {
      const deviceResult = await query('SELECT device_name FROM devices WHERE uuid = $1', [deviceUuid]);
      if (deviceResult.rows.length > 0) {
        deviceName = deviceResult.rows[0].device_name;
      }
    } catch (dbError) {
      console.warn(`Could not fetch device name for ${deviceUuid}:`, dbError);
    }

    await neo4jService.mapDeviceToSpace(deviceUuid, spaceExpressId, deviceName);

    res.json({
      success: true,
      message: `Device ${deviceName || deviceUuid} mapped to space ${spaceExpressId}`,
    });
  } catch (error: any) {
    console.error('Failed to map device:', error);
    res.status(500).json({
      error: 'Failed to map device to space',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/digital-twin/graph/map-device/:deviceUuid
 * Remove device mapping from space
 */
router.delete('/map-device/:deviceUuid', async (req: Request, res: Response) => {
  try {
    const { deviceUuid } = req.params;

    await neo4jService.unmapDeviceFromSpace(deviceUuid);

    res.json({
      success: true,
      message: `Device ${deviceUuid} unmapped from space`,
    });
  } catch (error: any) {
    console.error('Failed to unmap device:', error);
    res.status(500).json({
      error: 'Failed to unmap device',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/digital-twin/graph/node/:nodeId
 * Delete an unmapped EdgeDevice node
 */
router.delete('/node/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    const { uuid } = req.query;

    if (!uuid || typeof uuid !== 'string') {
      return res.status(400).json({
        error: 'Missing required query parameter: uuid',
      });
    }

    const result = await neo4jService.deleteUnmappedDevice(uuid);

    if (!result.deleted) {
      return res.status(400).json({
        success: false,
        message: result.reason || 'Failed to delete device',
      });
    }

    res.json({
      success: true,
      message: `Device ${uuid} deleted successfully`,
    });
  } catch (error: any) {
    console.error('Failed to delete node:', error);
    res.status(500).json({
      error: 'Failed to delete node',
      message: error.message,
    });
  }
});

/**
 * GET /api/digital-twin/graph/device-mappings
 * Get all device-to-space mappings
 */
router.get('/device-mappings', async (req: Request, res: Response) => {
  try {
    const mappings = await neo4jService.getDeviceMappings();

    res.json({
      success: true,
      data: mappings,
    });
  } catch (error: any) {
    console.error('Failed to get device mappings:', error);
    res.status(500).json({
      error: 'Failed to retrieve device mappings',
      message: error.message,
    });
  }
});

export default router;
