/**
 * Neo4j Service
 * 
 * Manages Neo4j database connections and operations for Digital Twin graph storage.
 * 
 * Graph Schema:
 * - Nodes: Project, Site, Building, Floor, Space, EdgeDevice, Sensor
 * - Relationships: CONTAINS, CONTAINS_FLOOR, CONTAINS_SPACE, HAS_DEVICE, HAS_SENSOR
 */

import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import { IFCHierarchy, IFCElement } from './ifc-parser.service';

export interface GraphNode {
  id: string; // Neo4j node ID or expressId
  labels: string[];
  properties: Record<string, any>;
}

export interface GraphRelationship {
  type: string;
  from: string;
  to: string;
  properties?: Record<string, any>;
}

export interface GraphVisualizationData {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export class Neo4jService {
  private driver: Driver | null = null;
  private uri: string;
  private username: string;
  private password: string;

  constructor() {
    // Get config from env or use defaults
    this.uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    this.username = process.env.NEO4J_USERNAME || 'neo4j';
    this.password = process.env.NEO4J_PASSWORD || 'iotistic123';
  }

  /**
   * Connect to Neo4j database
   */
  async connect(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.username, this.password),
        {
          maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
        }
      );

      // Verify connectivity
      await this.driver.verifyConnectivity();
      console.log(`Connected to Neo4j at ${this.uri}`);

      // Initialize schema
      await this.initializeSchema();
    } catch (error) {
      console.error('Failed to connect to Neo4j:', error);
      throw error;
    }
  }

  /**
   * Initialize database schema with constraints and indexes
   */
  private async initializeSchema(): Promise<void> {
    const session = this.getSession();
    try {
      // Create uniqueness constraints (also creates indexes)
      await session.run(`
        CREATE CONSTRAINT project_expressId IF NOT EXISTS
        FOR (p:Project) REQUIRE p.expressId IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT building_expressId IF NOT EXISTS
        FOR (b:Building) REQUIRE b.expressId IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT floor_expressId IF NOT EXISTS
        FOR (f:Floor) REQUIRE f.expressId IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT space_expressId IF NOT EXISTS
        FOR (s:Space) REQUIRE s.expressId IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT device_uuid IF NOT EXISTS
        FOR (d:EdgeDevice) REQUIRE d.uuid IS UNIQUE
      `);

      // Create indexes for common queries
      await session.run(`
        CREATE INDEX floor_name IF NOT EXISTS
        FOR (f:Floor) ON (f.name)
      `);

      await session.run(`
        CREATE INDEX space_name IF NOT EXISTS
        FOR (s:Space) ON (s.name)
      `);

      console.log('Neo4j schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize schema:', error);
      // Don't throw - constraints might already exist
    } finally {
      await session.close();
    }
  }

  /**
   * Get a new session
   */
  private getSession(): Session {
    if (!this.driver) {
      throw new Error('Neo4j driver not connected');
    }
    return this.driver.session();
  }

  /**
   * Load IFC hierarchy into Neo4j graph
   */
  async loadIFCHierarchy(hierarchy: IFCHierarchy): Promise<void> {
    const session = this.getSession();
    try {
      // Clear existing building data (including devices and sensors)
      await session.run('MATCH (n) WHERE n:Project OR n:Site OR n:Building OR n:Floor OR n:Space OR n:EdgeDevice OR n:Sensor DETACH DELETE n');
      console.log('Cleared existing building data');

      // Create project node
      if (hierarchy.project) {
        await this.createNode(session, hierarchy.project, 'Project');
      }

      // Create site node
      if (hierarchy.site) {
        await this.createNode(session, hierarchy.site, 'Site');
      }

      // Create building node
      if (hierarchy.building) {
        await this.createNode(session, hierarchy.building, 'Building');
      }

      // Create floor nodes
      for (const floor of hierarchy.floors) {
        await this.createNode(session, floor, 'Floor');
      }

      // Create space nodes
      for (const space of hierarchy.spaces) {
        await this.createNode(session, space, 'Space');
      }

      // Create edge device nodes
      for (const device of hierarchy.edgeDevices) {
        await this.createNode(session, device, 'EdgeDevice');
      }

      // Create sensor nodes
      for (const sensor of hierarchy.sensors) {
        await this.createNode(session, sensor, 'Sensor');
      }

      // Create relationships
      for (const rel of hierarchy.relationships) {
        await session.run(`
          MATCH (from {expressId: $fromId})
          MATCH (to {expressId: $toId})
          MERGE (from)-[:${rel.type}]->(to)
        `, {
          fromId: rel.from,
          toId: rel.to,
        });
      }

      console.log(`Loaded IFC hierarchy: ${hierarchy.floors.length} floors, ${hierarchy.spaces.length} spaces, ${hierarchy.edgeDevices.length} devices, ${hierarchy.sensors.length} sensors`);
    } catch (error) {
      console.error('Failed to load IFC hierarchy:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a node in Neo4j
   */
  private async createNode(session: Session, element: IFCElement, label: string): Promise<void> {
    // Convert properties Map to plain object
    // Extract primitive properties to set directly on node
    const params: Record<string, any> = {
      expressId: element.expressId,
      name: element.name,
      globalId: element.globalId || null,
      type: element.type,
    };

    // Add individual properties if they exist
    if (element.properties) {
      for (const [key, value] of Object.entries(element.properties)) {
        // Only include primitive types
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          params[key] = value;
        }
      }
    }

    // Build SET clause dynamically
    const setClause = `
      SET n.name = $name,
          n.globalId = $globalId,
          n.type = $type
          ${element.properties?.description ? ', n.description = $description' : ''}
          ${element.properties?.objectType ? ', n.objectType = $objectType' : ''}
    `;

    await session.run(`
      MERGE (n:${label} {expressId: $expressId})
      ${setClause}
    `, params);
  }

  /**
   * Map an edge device to a space
   */
  async mapDeviceToSpace(deviceUuid: string, spaceExpressId: number, deviceName?: string): Promise<void> {
    const session = this.getSession();
    try {
      // Create or update device node with name
      await session.run(`
        MERGE (d:EdgeDevice {uuid: $uuid})
        SET d.lastSeen = datetime(),
            d.name = COALESCE($name, d.name, $uuid)
      `, { 
        uuid: deviceUuid,
        name: deviceName || null
      });

      // Create relationship to space
      await session.run(`
        MATCH (s:Space {expressId: $spaceId})
        MATCH (d:EdgeDevice {uuid: $deviceUuid})
        MERGE (s)-[:HAS_DEVICE]->(d)
      `, {
        spaceId: spaceExpressId,
        deviceUuid,
      });

      console.log(`Mapped device ${deviceUuid} (${deviceName || deviceUuid}) to space ${spaceExpressId}`);
    } catch (error) {
      console.error('Failed to map device to space:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Remove device mapping from space
   */
  async unmapDeviceFromSpace(deviceUuid: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(`
        MATCH (s:Space)-[r:HAS_DEVICE]->(d:EdgeDevice {uuid: $uuid})
        DELETE r
      `, { uuid: deviceUuid });

      console.log(`Unmapped device ${deviceUuid} from space`);
    } catch (error) {
      console.error('Failed to unmap device:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete an unmapped EdgeDevice node from the graph
   * Only deletes if the device has no relationships (unmapped)
   */
  async deleteUnmappedDevice(deviceUuid: string): Promise<{ deleted: boolean; reason?: string }> {
    const session = this.getSession();
    try {
      // Check if device has any relationships
      const checkResult = await session.run(`
        MATCH (d:EdgeDevice {uuid: $uuid})
        OPTIONAL MATCH (d)-[r]-()
        RETURN d, count(r) as relCount
      `, { uuid: deviceUuid });

      if (checkResult.records.length === 0) {
        return { deleted: false, reason: 'Device not found' };
      }

      const relCount = checkResult.records[0].get('relCount').toNumber();
      
      if (relCount > 0) {
        return { deleted: false, reason: 'Device is mapped to a space. Unmap it first.' };
      }

      // Delete the unmapped device
      await session.run(`
        MATCH (d:EdgeDevice {uuid: $uuid})
        DETACH DELETE d
      `, { uuid: deviceUuid });

      console.log(`Deleted unmapped device ${deviceUuid}`);
      return { deleted: true };
    } catch (error) {
      console.error('Failed to delete unmapped device:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get full graph for visualization
   */
  async getGraphVisualizationData(): Promise<GraphVisualizationData> {
    const session = this.getSession();
    try {
      // Get all nodes first
      const nodesResult = await session.run(`MATCH (n) RETURN n`);
      const nodes: GraphNode[] = nodesResult.records.map(record => {
        const node = record.get('n');
        return {
          id: node.identity.toString(),
          labels: node.labels,
          properties: node.properties,
        };
      });

      // Get all relationships - use Neo4j internal IDs to match with node IDs
      const relsResult = await session.run(`
        MATCH (source)-[r]->(target)
        RETURN id(source) as sourceId, type(r) as relType, id(target) as targetId
      `);
      
      const relationships: GraphRelationship[] = relsResult.records.map(record => ({
        type: record.get('relType'),
        from: record.get('sourceId').toString(),
        to: record.get('targetId').toString(),
      }));

      console.log(`📊 Neo4j Query Results: ${nodes.length} nodes, ${relationships.length} relationships`);
      console.log(`  Relationships breakdown:`, relationships.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>));

      return { nodes, relationships };
    } catch (error) {
      console.error('Failed to get graph visualization data:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get devices mapped to spaces
   */
  async getDeviceMappings(): Promise<Array<{ deviceUuid: string; deviceName: string | null; spaceName: string; spaceId: number }>> {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (s:Space)-[:HAS_DEVICE]->(d:EdgeDevice)
        RETURN d.uuid as deviceUuid, s.name as spaceName, toInteger(s.expressId) as spaceId
      `);

      return result.records.map(record => {
        const spaceIdValue = record.get('spaceId');
        const deviceUuid = record.get('deviceUuid');
        // Handle Neo4j Integer type
        const spaceId = spaceIdValue?.low ?? spaceIdValue?.toNumber?.() ?? spaceIdValue ?? 0;
        return {
          deviceUuid: deviceUuid,
          deviceName: deviceUuid || null, // Use UUID as name fallback since d.name doesn't exist
          spaceName: record.get('spaceName'),
          spaceId: typeof spaceId === 'number' ? spaceId : parseInt(String(spaceId)) || 0,
        };
      });
    } catch (error) {
      console.error('Failed to get device mappings:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Close Neo4j connection
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      console.log('Neo4j connection closed');
    }
  }
}

// Singleton instance
export const neo4jService = new Neo4jService();
